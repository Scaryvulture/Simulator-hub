export function estimateSttCost(response: unknown, audioBytes: number, rateRaw?: string) {
    const usage = (response as { usage?: { type?: string; seconds?: number } } | null)?.usage;
    const seconds = usage?.type === 'duration' && Number.isFinite(usage.seconds) && usage.seconds! > 0
        ? usage.seconds! : null;
    // Fallback is explicitly an estimate, never a client-supplied duration or a billing total.
    const durationMs = seconds !== null ? Math.round(seconds * 1000) : Math.round(Math.max(0, audioBytes) / 16_000 * 1000);
    const candidate = Number(rateRaw ?? 0.006);
    const rate = Number.isFinite(candidate) && candidate >= 0 ? candidate : 0.006;
    return { durationMs, costUsd: Number((durationMs / 60_000 * rate).toFixed(6)), source: seconds !== null ? 'provider_duration' as const : 'server_estimate' as const };
}
