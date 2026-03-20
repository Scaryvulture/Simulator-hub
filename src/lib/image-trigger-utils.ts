export interface ImageTriggerLike {
    pattern?: string | null;
    image_url?: string | null;
    caption?: string | null;
}

export interface SanitizedImageTrigger {
    pattern: string;
    image_url: string;
    caption?: string;
}

export interface SanitizeImageTriggersResult {
    sanitized?: SanitizedImageTrigger[];
    partialRow?: number;
    invalidUrlRow?: number;
    invalidHostRow?: number;
    invalidHost?: string;
}

function toTrimmedString(value: unknown): string {
    return typeof value === 'string' ? value.trim() : '';
}

const DEFAULT_ALLOWED_IMAGE_TRIGGER_HOSTS = [
    'drive.google.com',
    'docs.google.com',
    '*.googleusercontent.com',
    'lh3.googleusercontent.com',
    '*.supabase.co',
];

function parseAllowedImageTriggerHosts(raw: string | undefined): string[] {
    const envHosts = (raw || '')
        .split(',')
        .map((value) => value.trim().toLowerCase())
        .filter(Boolean);
    return [...new Set([...DEFAULT_ALLOWED_IMAGE_TRIGGER_HOSTS, ...envHosts])];
}

function isProductionHostAllowlistEnabled(): boolean {
    if (process.env.IMAGE_TRIGGER_ENFORCE_HOST_ALLOWLIST === 'true') return true;
    if (process.env.IMAGE_TRIGGER_ENFORCE_HOST_ALLOWLIST === 'false') return false;
    return process.env.NODE_ENV === 'production';
}

function hostMatchesPattern(host: string, pattern: string): boolean {
    const normalizedHost = host.toLowerCase();
    const normalizedPattern = pattern.toLowerCase();

    if (normalizedPattern.startsWith('*.')) {
        const suffix = normalizedPattern.slice(1); // ".example.com"
        return normalizedHost.endsWith(suffix);
    }

    return normalizedHost === normalizedPattern;
}

function isAllowedImageTriggerHost(host: string, allowlist: string[]): boolean {
    return allowlist.some((pattern) => hostMatchesPattern(host, pattern));
}

function extractGoogleDriveId(url: string): string | null {
    const patterns = [
        /\/file\/d\/([a-zA-Z0-9_-]+)/,
        /[?&]id=([a-zA-Z0-9_-]+)/,
        /\/uc\?id=([a-zA-Z0-9_-]+)/,
        /\/open\?id=([a-zA-Z0-9_-]+)/,
    ];

    for (const pattern of patterns) {
        const match = url.match(pattern);
        if (match && match[1]) return match[1];
    }

    return null;
}

function normalizeDriveImageUrl(rawUrl: string): string {
    const driveId = extractGoogleDriveId(rawUrl);
    if (!driveId) return rawUrl;
    return `https://drive.google.com/uc?export=view&id=${driveId}`;
}

/**
 * Removes fully-empty rows and reports the first partially-filled row.
 * Partial row = one of pattern/image_url is filled and the other one is empty.
 */
export function sanitizeImageTriggersForSave(input: unknown): SanitizeImageTriggersResult {
    if (!Array.isArray(input)) {
        return {};
    }

    const enforceHostAllowlist = isProductionHostAllowlistEnabled();
    const allowedHosts = parseAllowedImageTriggerHosts(process.env.IMAGE_TRIGGER_ALLOWED_HOSTS);
    const sanitized: SanitizedImageTrigger[] = [];

    for (let index = 0; index < input.length; index += 1) {
        const raw = input[index] as ImageTriggerLike | null | undefined;
        const pattern = toTrimmedString(raw?.pattern);
        const imageUrl = toTrimmedString(raw?.image_url);
        const caption = toTrimmedString(raw?.caption);

        const isCompletelyEmpty = !pattern && !imageUrl && !caption;
        if (isCompletelyEmpty) continue;

        if (!pattern || !imageUrl) {
            return { partialRow: index + 1 };
        }

        let parsedUrl: URL;
        try {
            parsedUrl = new URL(imageUrl);
        } catch {
            return { invalidUrlRow: index + 1 };
        }

        const normalizedHost = parsedUrl.hostname.toLowerCase();
        if (enforceHostAllowlist && !isAllowedImageTriggerHost(normalizedHost, allowedHosts)) {
            return {
                invalidHostRow: index + 1,
                invalidHost: normalizedHost,
            };
        }

        const normalizedImageUrl = normalizedHost === 'drive.google.com'
            ? normalizeDriveImageUrl(imageUrl)
            : imageUrl;

        sanitized.push({
            pattern,
            image_url: normalizedImageUrl,
            ...(caption ? { caption } : {}),
        });
    }

    return { sanitized };
}
