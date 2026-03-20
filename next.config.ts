import type { NextConfig } from "next";

function buildSecurityHeaders() {
    const headers = [
        // CSP is applied dynamically in src/proxy.ts to support per-request nonce.
        { key: 'X-Content-Type-Options', value: 'nosniff' },
        { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        { key: 'Permissions-Policy', value: 'camera=(self), microphone=(self), geolocation=()' },
    ];

    if (process.env.NODE_ENV === 'production') {
        headers.push({
            key: 'Strict-Transport-Security',
            value: 'max-age=31536000; includeSubDomains',
        });
    }

    return headers;
}

const nextConfig: NextConfig = {
    productionBrowserSourceMaps: false,
    headers: async () => [
        {
            source: '/(.*)',
            headers: buildSecurityHeaders(),
        },
    ],
};

export default nextConfig;
