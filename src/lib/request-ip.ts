import { isIP } from 'node:net';

type HeaderReader = {
    get(name: string): string | null;
};

export const UNKNOWN_IP = 'unknown-ip';

function parseBoolean(raw: string | undefined): boolean | null {
    if (!raw) return null;
    const normalized = raw.trim().toLowerCase();
    if (['1', 'true', 'yes', 'y', 'on'].includes(normalized)) return true;
    if (['0', 'false', 'no', 'n', 'off'].includes(normalized)) return false;
    return null;
}

function stripIpPort(value: string): string {
    if (value.startsWith('[') && value.includes(']')) {
        const end = value.indexOf(']');
        return value.slice(1, end);
    }

    const ipv4WithPort = value.match(/^(\d{1,3}(?:\.\d{1,3}){3}):\d+$/);
    if (ipv4WithPort) return ipv4WithPort[1];

    return value;
}

function parseIpCandidate(raw: string | null): string | null {
    if (!raw) return null;
    const trimmed = raw.trim().replace(/^"+|"+$/g, '');
    if (!trimmed || trimmed.length > 128) return null;
    if (trimmed.toLowerCase() === 'unknown') return null;

    const normalized = stripIpPort(trimmed);
    return isIP(normalized) ? normalized : null;
}

function parseForwardedFor(raw: string | null): string | null {
    if (!raw) return null;
    const parts = raw.split(',');
    for (const part of parts) {
        const candidate = parseIpCandidate(part);
        if (candidate) return candidate;
    }
    return null;
}

function shouldTrustProxyHeaders(headers: HeaderReader): boolean {
    const explicit = parseBoolean(process.env.TRUST_PROXY_HEADERS);
    if (explicit !== null) return explicit;

    // Default trust model: accept proxy headers only when request is known to come through Vercel edge.
    return Boolean(headers.get('x-vercel-id'));
}

export function resolveClientIpFromHeaders(headers: HeaderReader): string | null {
    // If Vercel provides an explicit IP header, prefer it.
    const vercelIp = parseIpCandidate(headers.get('x-vercel-ip'));
    if (vercelIp) return vercelIp;

    const trustProxy = shouldTrustProxyHeaders(headers);
    if (!trustProxy) return null;

    const forwarded = parseForwardedFor(headers.get('x-forwarded-for'));
    if (forwarded) return forwarded;

    return parseIpCandidate(headers.get('x-real-ip'));
}

export function resolveClientIpOrUnknown(headers: HeaderReader): string {
    return resolveClientIpFromHeaders(headers) || UNKNOWN_IP;
}
