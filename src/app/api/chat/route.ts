import { getRuntimeBot } from '@/lib/runtime-bot';
import { SessionOperationError } from '@/lib/session-operation-context';
import { NextRequest, NextResponse } from 'next/server';
import { Director } from '@/lib/director';
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
import { toPublicChatResponse } from '@/lib/public-response-contract';
import { toPositiveInteger } from '@/lib/number-utils';
import { logServerError } from '@/lib/server-log';
type ChatImagePayload = {
    mime_type: string;
    data_url: string;
};

const BASE64_REGEX = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;

function decodeStrictBase64(base64Payload: string): Buffer | null {
    const normalized = base64Payload.trim();
    if (!normalized || !BASE64_REGEX.test(normalized)) return null;

    try {
        const buffer = Buffer.from(normalized, 'base64');
        if (!buffer.length) return null;

        // Verify canonical base64 roundtrip to reject malformed payloads.
        const canonical = buffer.toString('base64');
        const normalizedNoPad = normalized.replace(/=+$/, '');
        const canonicalNoPad = canonical.replace(/=+$/, '');
        if (canonicalNoPad !== normalizedNoPad) return null;

        return buffer;
    } catch {
        return null;
    }
}

function matchesImageSignature(mimeType: string, bytes: Buffer): boolean {
    if (mimeType === 'image/png') {
        return bytes.length >= 8
            && bytes[0] === 0x89
            && bytes[1] === 0x50
            && bytes[2] === 0x4e
            && bytes[3] === 0x47
            && bytes[4] === 0x0d
            && bytes[5] === 0x0a
            && bytes[6] === 0x1a
            && bytes[7] === 0x0a;
    }

    if (mimeType === 'image/jpeg') {
        return bytes.length >= 3
            && bytes[0] === 0xff
            && bytes[1] === 0xd8
            && bytes[2] === 0xff;
    }

    if (mimeType === 'image/webp') {
        return bytes.length >= 12
            && bytes.toString('ascii', 0, 4) === 'RIFF'
            && bytes.toString('ascii', 8, 12) === 'WEBP';
    }

    return false;
}

export async function POST(req: NextRequest) {
    let sessionId: unknown
    let botId: unknown
    try {
        const maxRequestBytes = toPositiveInteger(process.env.CHAT_MAX_REQUEST_BYTES, 24_000_000);
        if (isContentLengthOverLimit(req.headers.get('content-length'), maxRequestBytes)) {
            return NextResponse.json(
                { error: `Request body too large. Max ${maxRequestBytes} bytes.` },
                { status: 413 }
            );
        }

        const payload = await parseJsonBodyWithLimit(req, maxRequestBytes);
        sessionId = payload?.sessionId;
        botId = payload?.botId;
        const message = payload?.message;
        const requestId = payload?.requestId;
        if (!isValidUuid(requestId)) return NextResponse.json({ error: 'A valid requestId is required' }, { status: 400 });
        const rawImages = Array.isArray(payload?.images) ? payload.images : [];
        const currentUser = await getSessionActor();
        const ip = getRequestIp(req);

        if (!isValidUuid(sessionId) || !isValidEntityId(botId)) {
            return NextResponse.json(
                { error: 'Invalid sessionId or botId' },
                { status: 400 }
            );
        }

        const maxMessageLength = toPositiveInteger(process.env.CHAT_MAX_MESSAGE_LENGTH, 4000);
        const maxImages = toPositiveInteger(process.env.CHAT_MAX_IMAGES_PER_MESSAGE, 3);
        const maxImageBytes = toPositiveInteger(process.env.CHAT_MAX_IMAGE_BYTES, 5_000_000);

        if (rawImages.length > maxImages) {
            return NextResponse.json(
                { error: `Too many images. Max ${maxImages} images per message.` },
                { status: 400 }
            );
        }

        const images: ChatImagePayload[] = [];
        for (const rawImage of rawImages) {
            if (!rawImage || typeof rawImage !== 'object') {
                return NextResponse.json({ error: 'Invalid image payload' }, { status: 400 });
            }
            const image = rawImage as Partial<ChatImagePayload>;
            const mimeType = typeof image.mime_type === 'string' ? image.mime_type.toLowerCase() : '';
            const dataUrl = typeof image.data_url === 'string' ? image.data_url : '';
            const validMime = mimeType === 'image/png' || mimeType === 'image/jpeg' || mimeType === 'image/webp';
            if (!validMime) {
                return NextResponse.json({ error: 'Unsupported image type. Use PNG, JPEG, or WEBP.' }, { status: 400 });
            }
            if (!dataUrl.startsWith(`data:${mimeType};base64,`)) {
                return NextResponse.json({ error: 'Invalid image encoding. Expected data URL base64.' }, { status: 400 });
            }
            const base64Payload = dataUrl.slice(`data:${mimeType};base64,`.length);
            const imageBytes = decodeStrictBase64(base64Payload);
            if (!imageBytes) {
                return NextResponse.json({ error: 'Invalid image base64 payload.' }, { status: 400 });
            }
            if (imageBytes.length > maxImageBytes) {
                return NextResponse.json({ error: `Image too large. Max ${maxImageBytes} bytes per image.` }, { status: 400 });
            }
            if (!matchesImageSignature(mimeType, imageBytes)) {
                return NextResponse.json({ error: 'Image content does not match declared MIME type.' }, { status: 400 });
            }
            images.push({
                mime_type: mimeType,
                data_url: dataUrl,
            });
        }

        const hasText = typeof message === 'string' && Boolean(message.trim());
        if (!hasText && images.length === 0) {
            return NextResponse.json(
                { error: 'Message or image is required' },
                { status: 400 }
            );
        }
        if (hasText && message.length > maxMessageLength) {
            return NextResponse.json(
                { error: `Message too long. Max ${maxMessageLength} characters.` },
                { status: 400 }
            );
        }
        const normalizedMessage = hasText
            ? message.trim()
            : 'Analyze the attached image and reply in the same language as the conversation.';

        const rateLimitMax = toPositiveInteger(process.env.CHAT_RATE_LIMIT_MAX, 30);
        const rateLimitWindowMs = toPositiveInteger(process.env.CHAT_RATE_LIMIT_WINDOW_MS, 60_000);
        const actorKey = currentUser?.userId || ip;
        const limiter = await checkRateLimit({
            key: `chat:${actorKey}:${botId}`,
            limit: rateLimitMax,
            windowMs: rateLimitWindowMs,
        });
        if (!limiter.allowed) {
            return NextResponse.json(
                {
                    error: 'Too many chat requests. Retry in a few seconds.',
                    retry_after_ms: limiter.retryAfterMs,
                },
                { status: 429 }
            );
        }

        await assertCanUseSessionForLiveChat({ sessionId, botId, user: currentUser });

        const bot = await getRuntimeBot(botId, sessionId);
        if (!bot) {
            return NextResponse.json({ error: 'Bot not found' }, { status: 404 });
        }
        const rawConfig = (bot?.config && typeof bot.config === 'object' && !Array.isArray(bot.config))
            ? bot.config as Record<string, unknown>
            : {};
        const chatFeatures = (rawConfig.chat_features && typeof rawConfig.chat_features === 'object' && !Array.isArray(rawConfig.chat_features))
            ? rawConfig.chat_features as Record<string, unknown>
            : {};

        if (images.length > 0) {
            const allowImageUpload = Boolean(chatFeatures.allow_image_upload);
            if (!allowImageUpload) {
                return NextResponse.json(
                    { error: 'Image upload is disabled for this bot.' },
                    { status: 403 }
                );
            }
        }

        const result = await Director.processMessage(sessionId, botId, normalizedMessage, images, requestId);

        return NextResponse.json(toPublicChatResponse(result));
    } catch (error: unknown) {
        if (error instanceof AccessError || error instanceof SessionOperationError) {
            return NextResponse.json({ error: error.message }, { status: error.status });
        }
        if (error instanceof PayloadTooLargeError) {
            return NextResponse.json({ error: error.message }, { status: 413 });
        }
        if (error instanceof SyntaxError) {
            return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
        }
        logServerError('api.chat.message', error, {
            sessionId: typeof sessionId === 'string' ? sessionId : null,
            botId: typeof botId === 'string' ? botId : null,
        });
        return NextResponse.json(
            { error: 'Internal Server Error' },
            { status: 500 }
        );
    }
}
