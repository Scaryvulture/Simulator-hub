import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getSessionActor } from '@/lib/auth-utils';
import { assertCanUseSessionForLiveChat, AccessError } from '@/lib/chat-access';
import { checkRateLimit, getRequestIp } from '@/lib/rate-limit';
import {
    isContentLengthOverLimit,
    isValidEntityId,
    isValidUuid,
    parseJsonBodyWithLimit,
    PayloadTooLargeError,
} from '@/lib/request-validation';
import { decrypt, isEncrypted } from '@/lib/crypto';
import { PricingService } from '@/lib/pricing';
import { appendVoiceAuditEvent } from '@/lib/voice-audit';
import { createOpenAIClient } from '@/lib/ai-client';
import { toBoundedNumeric, toPositiveInteger } from '@/lib/number-utils';
import { logServerError, logServerWarning } from '@/lib/server-log';

function sanitizeTtsInput(value: string): string {
    return value
        .replace(/!\[[^\]]*]\([^)]+\)/g, ' ')
        .replace(/\[[^\]]+]\([^)]+\)/g, ' ')
        .replace(/[`*_>#]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

const ALLOWED_TTS_VOICES = ['alloy', 'ash', 'ballad', 'coral', 'echo', 'fable', 'nova', 'onyx', 'sage', 'shimmer', 'verse'] as const;

function pickDeterministicVoice(sessionId: string): (typeof ALLOWED_TTS_VOICES)[number] {
    if (!sessionId) return 'alloy';
    const hash = sessionId.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
    return ALLOWED_TTS_VOICES[hash % ALLOWED_TTS_VOICES.length];
}

function extractTtsErrorMessage(error: unknown): string {
    const generic = 'Unable to generate audio.';
    if (!error || typeof error !== 'object') return generic;

    const source = error as {
        message?: unknown;
        error?: { message?: unknown };
        status?: unknown;
    };
    const candidate = typeof source.error?.message === 'string'
        ? source.error.message
        : (typeof source.message === 'string' ? source.message : '');

    if (!candidate.trim()) return generic;

    const normalized = candidate.toLowerCase();
    if (normalized.includes('api key') || normalized.includes('authentication') || normalized.includes('unauthorized')) {
        return 'Voice output is temporarily unavailable.';
    }
    if (normalized.includes('model') && (
        normalized.includes('not found')
        || normalized.includes('does not exist')
        || normalized.includes('not available')
    )) {
        return 'Voice output is temporarily unavailable.';
    }
    if (normalized.includes('quota') || normalized.includes('rate limit') || normalized.includes('too many requests')) {
        return 'Voice generation quota reached. Try again in a few seconds.';
    }

    return generic;
}

function extractTtsStatus(error: unknown): number {
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
        const maxRequestBytes = toPositiveInteger(process.env.CHAT_TTS_MAX_REQUEST_BYTES, 64_000);
        if (isContentLengthOverLimit(req.headers.get('content-length'), maxRequestBytes)) {
            return NextResponse.json(
                { error: `Request body too large. Max ${maxRequestBytes} bytes.` },
                { status: 413 }
            );
        }

        const body = await parseJsonBodyWithLimit(req, maxRequestBytes);
        sessionId = typeof body?.sessionId === 'string' ? body.sessionId : '';
        botId = typeof body?.botId === 'string' ? body.botId : '';
        const text = typeof body?.text === 'string' ? body.text : '';
        const requestedMode = body?.mode === 'realtime' ? 'realtime' : 'normal';

        if (!isValidUuid(sessionId) || !isValidEntityId(botId)) {
            return NextResponse.json({ error: 'Invalid sessionId or botId' }, { status: 400 });
        }

        const normalizedText = sanitizeTtsInput(text);
        const maxChars = toPositiveInteger(process.env.CHAT_TTS_MAX_CHARS, 1400);
        if (!normalizedText) {
            return NextResponse.json({ error: 'Text is required for TTS.' }, { status: 400 });
        }
        if (normalizedText.length > maxChars) {
            return NextResponse.json({ error: `Text too long for TTS. Max ${maxChars} characters.` }, { status: 400 });
        }

        const actor = await getSessionActor();
        const ip = getRequestIp(req);
        const ttsRateLimitMax = toPositiveInteger(process.env.CHAT_TTS_RATE_LIMIT_MAX, 20);
        const ttsRateLimitWindowMs = toPositiveInteger(process.env.CHAT_TTS_RATE_LIMIT_WINDOW_MS, 60_000);
        const actorKey = actor?.userId || ip;
        const limiter = await checkRateLimit({
            key: `tts:${actorKey}:${botId}`,
            limit: ttsRateLimitMax,
            windowMs: ttsRateLimitWindowMs,
        });
        if (!limiter.allowed) {
            return NextResponse.json(
                {
                    error: 'Too many TTS requests. Retry in a few seconds.',
                    retry_after_ms: limiter.retryAfterMs,
                },
                { status: 429 }
            );
        }

        await assertCanUseSessionForLiveChat({ sessionId, botId, user: actor });

        const [bot, ttsConfig] = await Promise.all([
            prisma.bot.findFirst({
                where: { id: botId, deleted_at: null },
                select: {
                    api_key: true,
                    bot_type: true,
                    config: true,
                },
            }),
            prisma.ttsConfig.findFirst(),
        ]);

        if (!bot?.api_key) {
            return NextResponse.json({ error: 'Voice output is temporarily unavailable.' }, { status: 503 });
        }

        let apiKey = bot.api_key;
        if (isEncrypted(apiKey)) {
            apiKey = decrypt(apiKey);
        }
        if (!apiKey) {
            return NextResponse.json({ error: 'Voice output is temporarily unavailable.' }, { status: 503 });
        }

        const config = (bot?.config && typeof bot.config === 'object' && !Array.isArray(bot.config))
            ? bot.config as Record<string, unknown>
            : {};
        const chatFeatures = (config.chat_features && typeof config.chat_features === 'object' && !Array.isArray(config.chat_features))
            ? config.chat_features as Record<string, unknown>
            : {};

        if (chatFeatures.allow_voice_output === false) {
            return NextResponse.json({ error: 'Voice output is disabled for this bot.' }, { status: 403 });
        }

        const mode = bot?.bot_type === 'REALTIME' ? 'realtime' : requestedMode;
        const ttsModel = typeof ttsConfig?.model === 'string' ? ttsConfig.model.trim() : '';
        if (!ttsModel) {
            return NextResponse.json(
                { error: 'Voice output is temporarily unavailable.' },
                { status: 503 }
            );
        }
        const speed = toBoundedNumeric(ttsConfig?.default_speed, 1.0, { min: 0.25, max: 4 });
        const voice = pickDeterministicVoice(sessionId);
        const ttsInput = normalizedText;

        const openai = createOpenAIClient(apiKey);

        const startedAt = Date.now();
        let audioResponse: Awaited<ReturnType<typeof openai.audio.speech.create>>;

        try {
            audioResponse = await openai.audio.speech.create({
                model: ttsModel,
                voice,
                input: ttsInput,
                speed,
                response_format: 'mp3',
            });
        } catch (openaiError: unknown) {
            logServerError('api.chat.tts.openai', openaiError, { sessionId, botId, mode });
            return NextResponse.json(
                { error: extractTtsErrorMessage(openaiError) },
                { status: extractTtsStatus(openaiError) }
            );
        }

        const latencyMs = Date.now() - startedAt;
        const audioBuffer = Buffer.from(await audioResponse.arrayBuffer());

        const estimatedTokens = Math.max(1, Math.ceil(ttsInput.length / 4));
        const costUsd = await PricingService.calculateCost(ttsModel, estimatedTokens, 0);
        try {
            await appendVoiceAuditEvent(sessionId, {
                timestamp: new Date().toISOString(),
                channel: mode === 'realtime' ? 'realtime_tts' : 'chat_tts',
                mode,
                model: ttsModel,
                text_chars: normalizedText.length,
                estimated_tokens: estimatedTokens,
                cost_usd: costUsd,
                latency_ms: latencyMs,
            });
        } catch (auditError) {
            logServerWarning('api.chat.tts.audit', 'Unable to append voice audit event.', {
                sessionId,
                botId,
                error: auditError instanceof Error ? auditError.message : String(auditError),
            });
        }

        return new NextResponse(new Uint8Array(audioBuffer), {
            status: 200,
            headers: {
                'Content-Type': 'audio/mpeg',
                'Cache-Control': 'no-store',
            },
        });
    } catch (error: unknown) {
        if (error instanceof AccessError) {
            return NextResponse.json({ error: error.message }, { status: error.status });
        }
        if (error instanceof PayloadTooLargeError) {
            return NextResponse.json({ error: error.message }, { status: 413 });
        }
        if (error instanceof SyntaxError) {
            return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
        }
        logServerError('api.chat.tts', error, { sessionId, botId });
        return NextResponse.json({ error: 'Unable to generate audio.' }, { status: 500 });
    }
}
