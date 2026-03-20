import { toBoundedNumber } from '@/lib/number-utils'

export const authSessionConfig = {
    idleTimeoutMs: toBoundedNumber(process.env.AUTH_IDLE_TIMEOUT_MINUTES, 120, { min: 15, max: 720 }) * 60_000,
    maxSessionMs: toBoundedNumber(process.env.AUTH_MAX_SESSION_HOURS, 24, { min: 1, max: 168 }) * 60 * 60_000,
    touchIntervalMs: toBoundedNumber(process.env.AUTH_TOUCH_INTERVAL_SECONDS, 30, { min: 10, max: 600 }) * 1_000,
}

export function getAuthSessionConfig() {
    return authSessionConfig
}
