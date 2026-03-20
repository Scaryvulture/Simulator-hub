export function normalizeLtiUrl(value: string): string {
    return value.trim().replace(/\/+$/, '')
}
