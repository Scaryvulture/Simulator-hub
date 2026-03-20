const DANGEROUS_SPREADSHEET_PREFIX = /^[\s]*[=+\-@]/;

export function sanitizeSpreadsheetText(value: string): string {
    if (!value) return value;
    if (!DANGEROUS_SPREADSHEET_PREFIX.test(value)) return value;
    return `'${value}`;
}

export function sanitizeSpreadsheetCell(value: unknown): string | number {
    if (typeof value === 'number') return value;
    if (typeof value === 'bigint') return sanitizeSpreadsheetText(value.toString());
    if (value === null || value === undefined) return '';
    return sanitizeSpreadsheetText(String(value));
}
