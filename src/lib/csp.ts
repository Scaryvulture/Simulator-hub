const DEFAULT_IMAGE_MEDIA_ALLOWLIST = [
    'https://drive.google.com',
    'https://docs.google.com',
    'https://*.googleusercontent.com',
    'https://lh3.googleusercontent.com',
    'https://*.supabase.co',
];

export function parseCspSourceList(raw: string | undefined): string[] {
    if (!raw) return [];
    return raw
        .split(',')
        .map((value) => value.trim())
        .filter(Boolean);
}

function uniqueSources(sources: string[]): string[] {
    return [...new Set(sources)];
}

function getFrameAncestorsSources(): string[] {
    const trustedEmbedOrigins = uniqueSources(parseCspSourceList(process.env.LTI_TRUSTED_EMBED_ORIGINS))
    if (trustedEmbedOrigins.length === 0) {
        return ["'none'"]
    }
    return uniqueSources(["'self'", ...trustedEmbedOrigins])
}

export function getCspHeaderKey(): 'Content-Security-Policy' | 'Content-Security-Policy-Report-Only' {
    return process.env.CSP_REPORT_ONLY === 'true'
        ? 'Content-Security-Policy-Report-Only'
        : 'Content-Security-Policy';
}

export function shouldEnableCspNonce(): boolean {
    const raw = (process.env.CSP_NONCE_ENABLED || '').trim().toLowerCase();
    if (['1', 'true', 'yes', 'on'].includes(raw)) return true;
    if (['0', 'false', 'no', 'off'].includes(raw)) return false;
    return process.env.NODE_ENV === 'production';
}

type BuildCspOptions = {
    isDev: boolean;
    nonce?: string;
};

export function buildCspValue(options: BuildCspOptions): string {
    const { isDev, nonce } = options;
    const nonceEnabled = shouldEnableCspNonce() && Boolean(nonce);
    const allowUnsafeInlineScript = nonceEnabled
        ? false
        : process.env.CSP_ALLOW_UNSAFE_INLINE_SCRIPT !== 'false';

    const scriptSrc = ["'self'"];
    if (nonceEnabled && nonce) {
        scriptSrc.push(`'nonce-${nonce}'`, "'strict-dynamic'");
    } else if (allowUnsafeInlineScript) {
        scriptSrc.push("'unsafe-inline'");
    }
    if (isDev) {
        // Next.js dev tooling relies on eval-like paths for HMR/source maps.
        scriptSrc.push("'unsafe-eval'");
    }
    scriptSrc.push(...parseCspSourceList(process.env.CSP_SCRIPT_SRC_EXTRA));

    const connectSrc = uniqueSources([
        "'self'",
        'https://*.supabase.co',
        'wss://*.supabase.co',
        ...parseCspSourceList(process.env.CSP_CONNECT_SRC_EXTRA),
    ]);
    if (isDev) {
        connectSrc.push('http://localhost:*', 'ws://localhost:*');
    }

    const restrictedImageSrc = uniqueSources([
        "'self'",
        'data:',
        'blob:',
        ...DEFAULT_IMAGE_MEDIA_ALLOWLIST,
        ...parseCspSourceList(process.env.CSP_IMG_SRC_EXTRA),
    ]);

    const restrictedMediaSrc = uniqueSources([
        "'self'",
        'data:',
        'blob:',
        ...DEFAULT_IMAGE_MEDIA_ALLOWLIST,
        ...parseCspSourceList(process.env.CSP_MEDIA_SRC_EXTRA),
    ]);

    const frameSrc = uniqueSources([
        "'self'",
        'https://drive.google.com',
        'https://docs.google.com',
        ...parseCspSourceList(process.env.CSP_FRAME_SRC_EXTRA),
    ]);

    const directives: Array<[string, string[]]> = [
        ['default-src', ["'self'"]],
        ['base-uri', ["'self'"]],
        ['form-action', ["'self'"]],
        ['frame-ancestors', getFrameAncestorsSources()],
        ['object-src', ["'none'"]],
        ['script-src', scriptSrc],
        ['style-src', ["'self'", "'unsafe-inline'"]],
        ['img-src', isDev ? ["'self'", 'data:', 'blob:', 'https:'] : restrictedImageSrc],
        ['font-src', ["'self'", 'data:']],
        ['media-src', isDev ? ["'self'", 'data:', 'blob:', 'https:'] : restrictedMediaSrc],
        ['connect-src', connectSrc],
        ['frame-src', frameSrc],
        ['worker-src', ["'self'", 'blob:']],
        ['manifest-src', ["'self'"]],
    ];

    return directives
        .map(([name, values]) => `${name} ${values.join(' ')}`)
        .join('; ');
}
