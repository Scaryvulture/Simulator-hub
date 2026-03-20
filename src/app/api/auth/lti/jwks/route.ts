import { NextResponse } from 'next/server'

function parseJwksEnv(): { keys: Array<Record<string, unknown>> } {
    const fullJwksRaw = process.env.LTI_TOOL_JWKS_JSON?.trim()
    if (fullJwksRaw) {
        try {
            const parsed = JSON.parse(fullJwksRaw) as { keys?: unknown }
            if (Array.isArray(parsed.keys)) {
                return { keys: parsed.keys.filter((entry): entry is Record<string, unknown> => Boolean(entry && typeof entry === 'object')) }
            }
        } catch {
            // Invalid JSON: fall back to empty keys.
        }
    }

    const singleJwkRaw = process.env.LTI_TOOL_PUBLIC_JWK?.trim()
    if (singleJwkRaw) {
        try {
            const parsed = JSON.parse(singleJwkRaw)
            if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
                return { keys: [parsed as Record<string, unknown>] }
            }
        } catch {
            // Invalid JSON: fall back to empty keys.
        }
    }

    return { keys: [] }
}

export async function GET() {
    return NextResponse.json(parseJwksEnv())
}
