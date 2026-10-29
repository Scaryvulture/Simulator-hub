import { createHash } from 'node:crypto';
import { safeRegex } from './safe-regex';

export type UserImageAttachment = {
    mime_type: string;
    data_url: string;
};

export type StoredImageAttachment = {
    mime_type: string;
    byte_size: number;
    sha256: string;
    data_url?: string;
    original_mime_type?: string;
    original_byte_size?: number;
    storage_mode?: 'full' | 'thumbnail' | 'metadata';
};

const CHAT_IMAGE_THUMBNAIL_MAX_DIM = 192;
const CHAT_IMAGE_THUMBNAIL_QUALITY = 45;

let sharpModulePromise: Promise<unknown> | null = null;

async function getSharpFactory(): Promise<((input: Buffer) => {
    rotate: () => {
        resize: (
            width: number,
            height: number,
            options: { fit: 'inside'; withoutEnlargement: boolean }
        ) => {
            webp: (options: { quality: number; effort: number }) => { toBuffer: () => Promise<Buffer> }
        }
    }
}) | null> {
    if (!sharpModulePromise) {
        sharpModulePromise = import('sharp').catch(() => null);
    }
    const moduleValue = await sharpModulePromise;
    if (!moduleValue || typeof moduleValue !== 'object') return null;

    const sharpFactory = (moduleValue as { default?: unknown }).default;
    if (typeof sharpFactory !== 'function') return null;

    return sharpFactory as (input: Buffer) => {
        rotate: () => {
            resize: (
                width: number,
                height: number,
                options: { fit: 'inside'; withoutEnlargement: boolean }
            ) => {
                webp: (options: { quality: number; effort: number }) => { toBuffer: () => Promise<Buffer> }
            }
        }
    };
}

async function buildTinyThumbnailDataUrl(bytes: Buffer): Promise<{ dataUrl: string; byteSize: number } | null> {
    const sharpFactory = await getSharpFactory();
    if (!sharpFactory) return null;

    try {
        const thumbnailBytes = await sharpFactory(bytes)
            .rotate()
            .resize(
                CHAT_IMAGE_THUMBNAIL_MAX_DIM,
                CHAT_IMAGE_THUMBNAIL_MAX_DIM,
                { fit: 'inside', withoutEnlargement: true }
            )
            .webp({ quality: CHAT_IMAGE_THUMBNAIL_QUALITY, effort: 3 })
            .toBuffer();

        if (!thumbnailBytes.length) return null;
        return {
            dataUrl: `data:image/webp;base64,${thumbnailBytes.toString('base64')}`,
            byteSize: thumbnailBytes.length,
        };
    } catch {
        return null;
    }
}

export function processImageTriggers(
    response: string,
    triggers?: Array<{ pattern: string; image_url: string; caption?: string }>
): string {
    if (!triggers || triggers.length === 0) {
        return response;
    }

    const matchedImages: string[] = [];
    const isLikelyImageUrl = (url: string) => {
        const clean = (url || '').toLowerCase().split('?')[0];
        return (
            clean.endsWith('.png')
            || clean.endsWith('.jpg')
            || clean.endsWith('.jpeg')
            || clean.endsWith('.gif')
            || clean.endsWith('.webp')
            || clean.endsWith('.svg')
            || clean.includes('/image/')
        );
    };

    for (const trigger of triggers) {
        try {
            const pattern = (trigger.pattern || '').trim();
            const imageUrl = (trigger.image_url || '').trim();
            if (!pattern || !imageUrl) {
                continue;
            }

            const regex = safeRegex(pattern);
            if (regex && regex.test(response)) {
                const caption = trigger.caption || '';
                if (isLikelyImageUrl(imageUrl)) {
                    matchedImages.push(`\n\n![${caption}](${imageUrl})`);
                } else {
                    const line = caption ? `${caption}\n${imageUrl}` : imageUrl;
                    matchedImages.push(`\n\n${line}`);
                }
            }
        } catch {
            console.warn(`Invalid image trigger regex: ${trigger.pattern}`);
        }
    }

    if (matchedImages.length > 0) {
        return response + matchedImages.join('');
    }

    return response;
}

export async function toStoredImageAttachments(images: UserImageAttachment[]): Promise<StoredImageAttachment[]> {
    const mode = (process.env.CHAT_IMAGE_STORAGE_MODE || 'thumbnail').toLowerCase();
    if (mode === 'none') return [];
    if (!Array.isArray(images) || images.length === 0) return [];

    const storageMode = mode === 'full'
        ? 'full'
        : mode === 'metadata'
            ? 'metadata'
            : 'thumbnail';

    const stored: StoredImageAttachment[] = [];
    for (const image of images) {
        if (!image || typeof image.data_url !== 'string' || typeof image.mime_type !== 'string') {
            continue;
        }
        const commaIndex = image.data_url.indexOf(',');
        const base64Payload = commaIndex >= 0 ? image.data_url.slice(commaIndex + 1) : '';
        if (!base64Payload) continue;

        let bytes: Buffer;
        try {
            bytes = Buffer.from(base64Payload, 'base64');
        } catch {
            continue;
        }

        const checksum = createHash('sha256').update(bytes).digest('hex');
        if (storageMode === 'full') {
            stored.push({
                mime_type: image.mime_type,
                byte_size: bytes.length,
                sha256: checksum,
                data_url: image.data_url,
                storage_mode: 'full',
            });
            continue;
        }

        if (storageMode === 'thumbnail') {
            const thumbnail = await buildTinyThumbnailDataUrl(bytes);
            if (thumbnail) {
                stored.push({
                    mime_type: 'image/webp',
                    byte_size: thumbnail.byteSize,
                    sha256: checksum,
                    data_url: thumbnail.dataUrl,
                    original_mime_type: image.mime_type,
                    original_byte_size: bytes.length,
                    storage_mode: 'thumbnail',
                });
                continue;
            }
        }

        stored.push({
            mime_type: image.mime_type,
            byte_size: bytes.length,
            sha256: checksum,
            storage_mode: 'metadata',
        });
    }

    return stored;
}
