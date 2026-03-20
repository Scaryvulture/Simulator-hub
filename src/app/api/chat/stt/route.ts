import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getSessionActor } from '@/lib/auth-utils';
import { assertCanUseSessionForLiveChat, AccessError } from '@/lib/chat-access';
import { checkRateLimit, getRequestIp } from '@/lib/rate-limit';
import { isContentLengthOverLimit, isValidEntityId, isValidUuid } from '@/lib/request-validation';
import { decrypt, isEncrypted } from '@/lib/crypto';
import { appendVoiceAuditEvent } from '@/lib/voice-audit';
import { toFile } from 'openai/uploads';
import { createOpenAIClient } from '@/lib/ai-client';
import { toPositiveInteger } from '@/lib/number-utils';
import { logServerError, logServerWarning } from '@/lib/server-log';

const ALLOWED_AUDIO_TYPES = new Set([
    'audio/webm',
    'audio/webm;codecs=opus',
    'audio/mp4',
    'audio/mpeg',
    'audio/wav',
    'audio/ogg',
]);

function normalizeTranscript(text: string): string {
    return text.replace(/\s+/g, ' ').trim();
}

function extractSttErrorMessage(error: unknown): string {
    const generic = 'Unable to transcribe audio.';
    if (!error || typeof error !== 'object') return generic;

    const source = error as {
        message?: unknown;
        error?: { message?: unknown };
        status?: unknown;
        code?: unknown;
    };
    const candidate = typeof source.error?.message === 'string'
        ? source.error.message
        : (typeof source.message === 'string' ? source.message : '');

    if (!candidate.trim()) return generic;

    const normalized = candidate.toLowerCase();
    if (normalized.includes('api key') || normalized.includes('authentication') || normalized.includes('unauthorized')) {
        return 'Bot API key rejected for speech transcription.';
    }
    if (normalized.includes('model') && (
        normalized.includes('not found')
        || normalized.includes('does not exist')
        || normalized.includes('not available')
    )) {
        return 'STT model unavailable for this API key.';
    }
    if (normalized.includes('quota') || normalized.includes('rate limit') || normalized.includes('too many requests')) {
        return 'OpenAI STT quota/rate limit reached. Try again in a few seconds.';
    }

    return candidate.slice(0, 240);
}

function extractSttStatus(error: unknown): number {
    if (!error || typeof error !== 'object') return 500;
    const status = Number((error as { status?: unknown }).status);
    if (!Number.isFinite(status)) return 500;
    if (status < 400 || status > 599) return 500;
    return status;
}

export async function POST(req: NextRequest) {
    let sessionId = ''
    let botId = ''
    try {
        const maxRequestBytes = toPositiveInteger(process.env.CHAT_STT_MAX_REQUEST_BYTES, 12_000_000);
        if (isContentLengthOverLimit(req.headers.get('content-length'), maxRequestBytes)) {
            return NextResponse.json(
                { error: `Request body too large. Max ${maxRequestBytes} bytes.` },
                { status: 413 }
            );
        }

        const formData = await req.formData();
        sessionId = typeof formData.get('sessionId') === 'string' ? String(formData.get('sessionId')) : '';
        botId = typeof formData.get('botId') === 'string' ? String(formData.get('botId')) : '';
        const modeRaw = typeof formData.get('mode') === 'string' ? String(formData.get('mode')) : 'normal';
        const durationMsRaw = typeof formData.get('duration_ms') === 'string' ? String(formData.get('duration_ms')) : '0';
        const audioFile = formData.get('audio');

        if (!isValidUuid(sessionId) || !isValidEntityId(botId)) {
            return NextResponse.json({ error: 'Invalid sessionId or botId' }, { status: 400 });
        }

        if (!(audioFile instanceof File)) {
            return NextResponse.json({ error: 'Audio file is required.' }, { status: 400 });
        }

        const contentType = (audioFile.type || '').toLowerCase();
        if (!ALLOWED_AUDIO_TYPES.has(contentType)) {
            return NextResponse.json({ error: 'Unsupported audio format.' }, { status: 400 });
        }

        const maxAudioBytes = toPositiveInteger(process.env.CHAT_STT_MAX_AUDIO_BYTES, 10_000_000);
        if (audioFile.size > maxAudioBytes) {
            return NextResponse.json({ error: `Audio too large. Max ${maxAudioBytes} bytes.` }, { status: 400 });
        }

        const actor = await getSessionActor();
        const ip = getRequestIp(req);
        const sttRateLimitMax = toPositiveInteger(process.env.CHAT_STT_RATE_LIMIT_MAX, 20);
        const sttRateLimitWindowMs = toPositiveInteger(process.env.CHAT_STT_RATE_LIMIT_WINDOW_MS, 60_000);
        const actorKey = actor?.userId || ip;
        const limiter = await checkRateLimit({
            key: `stt:${actorKey}:${botId}`,
            limit: sttRateLimitMax,
            windowMs: sttRateLimitWindowMs,
        });
        if (!limiter.allowed) {
            return NextResponse.json(
                {
                    error: 'Too many STT requests. Retry in a few seconds.',
                    retry_after_ms: limiter.retryAfterMs,
                },
                { status: 429 }
            );
        }

        await assertCanUseSessionForLiveChat({ sessionId, botId, user: actor });

        const bot = await prisma.bot.findFirst({
            where: { id: botId, deleted_at: null },
            select: {
                bot_type: true,
                api_key: true,
                config: true,
            },
        });

        if (!bot?.api_key) {
            return NextResponse.json({ error: 'Bot API key is not configured.' }, { status: 400 });
        }

        const config = (bot.config && typeof bot.config === 'object' && !Array.isArray(bot.config))
            ? bot.config as Record<string, unknown>
            : {};
        const chatFeatures = (config.chat_features && typeof config.chat_features === 'object' && !Array.isArray(config.chat_features))
            ? config.chat_features as Record<string, unknown>
            : {};
        if (chatFeatures.allow_voice_input === false) {
            return NextResponse.json({ error: 'Voice input is disabled for this bot.' }, { status: 403 });
        }

        let apiKey = bot.api_key;
        if (isEncrypted(apiKey)) {
            apiKey = decrypt(apiKey);
        }
        if (!apiKey) {
            return NextResponse.json({ error: 'Invalid Bot API key configuration.' }, { status: 400 });
        }

        const model = process.env.OPENAI_STT_MODEL || 'gpt-4o-mini-transcribe';
        const openai = createOpenAIClient(apiKey);
        const audioBuffer = Buffer.from(await audioFile.arrayBuffer());
        const upload = await toFile(audioBuffer, audioFile.name || 'speech.webm', { type: contentType });

        const startedAt = Date.now();
        const response = await openai.audio.transcriptions.create({
            file: upload,
            model,
        });
        const latencyMs = Date.now() - startedAt;

        const transcript = normalizeTranscript(response.text || '');
        if (!transcript) {
            return NextResponse.json({ error: 'No speech detected.' }, { status: 400 });
        }

        const parsedDurationMs = Math.max(0, Number.parseInt(durationMsRaw, 10) || 0);
        const durationMs = parsedDurationMs > 0 ? parsedDurationMs : Math.round((audioFile.size / 16_000) * 1000);
        const sttRatePerMinute = Number(process.env.OPENAI_STT_COST_PER_MINUTE || 0.006);
        const costUsd = Number((((durationMs / 60_000) * sttRatePerMinute)).toFixed(6));
        const estimatedTokens = Math.max(1, Math.ceil(transcript.length / 4));
        const mode = modeRaw === 'realtime' ? 'realtime' : 'normal';

        try {
            await appendVoiceAuditEvent(sessionId, {
                timestamp: new Date().toISOString(),
                channel: mode === 'realtime' ? 'realtime_stt' : 'chat_stt',
                mode,
                model,
                text_chars: transcript.length,
                estimated_tokens: estimatedTokens,
                cost_usd: costUsd,
                latency_ms: latencyMs,
            });
        } catch (auditError) {
            logServerWarning('api.chat.stt.audit', 'Unable to append STT audit event.', {
                sessionId,
                botId,
                error: auditError instanceof Error ? auditError.message : String(auditError),
            });
        }

        return NextResponse.json({
            transcript,
            duration_ms: durationMs,
            model,
            estimated_tokens: estimatedTokens,
            cost_usd: costUsd,
        });
    } catch (error: unknown) {
        if (error instanceof AccessError) {
            return NextResponse.json({ error: error.message }, { status: error.status });
        }
        logServerError('api.chat.stt', error, { sessionId, botId });
        const status = extractSttStatus(error);
        const message = extractSttErrorMessage(error);
        return NextResponse.json({ error: message }, { status });
    }
}
