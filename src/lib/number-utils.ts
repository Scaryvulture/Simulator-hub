export function toPositiveNumber(value: string | undefined, fallback: number): number {
    const parsed = Number(value)
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

export function toPositiveInteger(value: string | undefined, fallback: number): number {
    return Math.floor(toPositiveNumber(value, fallback))
}

export function toBoundedNumber(
    value: string | undefined,
    fallback: number,
    bounds: { min: number; max: number }
): number {
    const base = toPositiveNumber(value, fallback)
    if (base < bounds.min) return bounds.min
    if (base > bounds.max) return bounds.max
    return base
}

export function toBoundedNumeric(
    value: unknown,
    fallback: number,
    bounds: { min: number; max: number }
): number {
    const parsed = typeof value === 'number' ? value : Number(value)
    if (!Number.isFinite(parsed)) return fallback
    if (parsed < bounds.min) return bounds.min
    if (parsed > bounds.max) return bounds.max
    return parsed
}
