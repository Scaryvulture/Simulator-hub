import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth-utils';
import { AppRole } from '@prisma/client';
import prisma from '@/lib/prisma';
import { decrypt, isEncrypted } from '@/lib/crypto';
import { checkRateLimit, getRequestIp } from '@/lib/rate-limit';
import { createOpenAIClient } from '@/lib/ai-client';
import {
    isContentLengthOverLimit,
    parseJsonBodyWithLimit,
    PayloadTooLargeError,
} from '@/lib/request-validation';
import { toBoundedNumeric, toPositiveInteger } from '@/lib/number-utils';
import { logServerError } from '@/lib/server-log';

export async function POST(req: NextRequest) {
    let model = ''
    try {
        const maxRequestBytes = toPositiveInteger(process.env.CHAT_TTS_TEST_MAX_REQUEST_BYTES, 64_000);
        if (isContentLengthOverLimit(req.headers.get('content-length'), maxRequestBytes)) {
            return NextResponse.json(
                { error: `Request body too large. Max ${maxRequestBytes} bytes.` },
                { status: 413 }
            );
        }

        const user = await getCurrentUser();
        const ip = getRequestIp(req);
        const rateLimitMax = toPositiveInteger(process.env.CHAT_TTS_TEST_RATE_LIMIT_MAX, 12);
        const rateLimitWindowMs = toPositiveInteger(process.env.CHAT_TTS_TEST_RATE_LIMIT_WINDOW_MS, 60_000);
        const actorKey = user?.userId || ip;
        const limiter = await checkRateLimit({
            key: `tts-test:${actorKey}`,
            limit: rateLimitMax,
            windowMs: rateLimitWindowMs,
        });
        if (!limiter.allowed) {
            return NextResponse.json(
                {
                    error: 'Too many TTS test requests. Retry in a few seconds.',
                    retry_after_ms: limiter.retryAfterMs,
                },
                { status: 429 }
            );
        }

        if (!user || user.role !== AppRole.ADMIN) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const body = await parseJsonBodyWithLimit(req, maxRequestBytes);
        const text = typeof body?.text === 'string' ? body.text.trim() : '';
        model = typeof body?.model === 'string' ? body.model.trim() : '';
        const speed = toBoundedNumeric(body?.speed, 1.0, { min: 0.25, max: 4 });
        const maxChars = toPositiveInteger(process.env.CHAT_TTS_MAX_CHARS, 1400);

        if (!text) {
            return NextResponse.json({ error: 'Text is required' }, { status: 400 });
        }
        if (text.length > maxChars) {
            return NextResponse.json({ error: `Text too long for TTS. Max ${maxChars} characters.` }, { status: 400 });
        }
        if (!model) {
            return NextResponse.json({ error: 'TTS model is required.' }, { status: 400 });
        }

        const ttsConfig = await prisma.ttsConfig.findFirst();
        let apiKey = ttsConfig?.openai_api_key;

        if (apiKey && isEncrypted(apiKey)) {
            apiKey = decrypt(apiKey);
        }

        if (!apiKey) {
            return NextResponse.json(
                { error: 'TTS API key is not configured in Admin > Voice Settings.' },
                { status: 400 }
            );
        }

        const openai = createOpenAIClient(apiKey);

        const response = await openai.audio.speech.create({
            model,
            voice: 'alloy',
            input: text,
            speed,
            response_format: 'mp3',
        });

        const arrayBuffer = await response.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);

        return new NextResponse(buffer, {
            headers: {
                'Content-Type': 'audio/mpeg',
                'Content-Length': buffer.length.toString(),
            },
        });

    } catch (error: unknown) {
        if (error instanceof PayloadTooLargeError) {
            return NextResponse.json({ error: error.message }, { status: 413 });
        }
        if (error instanceof SyntaxError) {
            return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
        }
        logServerError('api.chat.tts-test', error, { model });
        const message = error instanceof Error ? error.message : 'Detailed TTS Error';
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
