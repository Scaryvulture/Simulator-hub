import 'server-only';

export type SimplePdfLineKind = 'title' | 'section' | 'meta' | 'body' | 'bullet' | 'spacer';

export type SimplePdfLine = {
    text?: string;
    kind?: SimplePdfLineKind;
};

type NormalizedLine = {
    text: string;
    kind: SimplePdfLineKind;
};

type TextStyle = {
    font: 'F1' | 'F2';
    size: number;
    leading: number;
};

const PAGE_WIDTH = 612;
const PAGE_HEIGHT = 792;
const PAGE_MARGIN_X = 52;
const PAGE_TOP_Y = 750;
const PAGE_BOTTOM_Y = 52;
const CONTENT_WIDTH = PAGE_WIDTH - (PAGE_MARGIN_X * 2);

const STYLES: Record<SimplePdfLineKind, TextStyle> = {
    title: { font: 'F2', size: 18, leading: 24 },
    section: { font: 'F2', size: 12, leading: 17 },
    meta: { font: 'F1', size: 10, leading: 14 },
    body: { font: 'F1', size: 11, leading: 15 },
    bullet: { font: 'F1', size: 11, leading: 15 },
    spacer: { font: 'F1', size: 11, leading: 12 },
};

function toAsciiText(value: string): string {
    return value
        .replace(/[“”]/g, '"')
        .replace(/[‘’]/g, "'")
        .replace(/[–—]/g, '-')
        .replace(/[•]/g, '-')
        .normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^\x20-\x7E]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function escapePdfText(value: string): string {
    return value
        .replace(/\\/g, '\\\\')
        .replace(/\(/g, '\\(')
        .replace(/\)/g, '\\)');
}

function splitLongWord(word: string, limit: number): string[] {
    const parts: string[] = [];
    for (let idx = 0; idx < word.length; idx += limit) {
        parts.push(word.slice(idx, idx + limit));
    }
    return parts;
}

function wrapText(value: string, maxChars: number): string[] {
    if (!value) return [];
    if (maxChars <= 1) return [value];
    const words = value.split(' ').filter(Boolean);
    const lines: string[] = [];
    let current = '';

    for (const rawWord of words) {
        const wordParts = rawWord.length > maxChars ? splitLongWord(rawWord, maxChars) : [rawWord];
        for (const part of wordParts) {
            if (!current) {
                current = part;
                continue;
            }
            const candidate = `${current} ${part}`;
            if (candidate.length <= maxChars) {
                current = candidate;
                continue;
            }
            lines.push(current);
            current = part;
        }
    }

    if (current) lines.push(current);
    return lines;
}

function estimateCharsPerLine(fontSize: number, reservedWidth = 0): number {
    const usableWidth = Math.max(40, CONTENT_WIDTH - reservedWidth);
    const avgCharWidth = fontSize * 0.53;
    return Math.max(12, Math.floor(usableWidth / avgCharWidth));
}

function normalizeLines(lines: Array<string | SimplePdfLine>): NormalizedLine[] {
    const normalized: NormalizedLine[] = [];
    for (const entry of lines) {
        if (typeof entry === 'string') {
            const text = toAsciiText(entry);
            if (!text) {
                normalized.push({ kind: 'spacer', text: '' });
            } else {
                normalized.push({ kind: 'body', text });
            }
            continue;
        }

        const kind = entry.kind || 'body';
        if (kind === 'spacer') {
            normalized.push({ kind: 'spacer', text: '' });
            continue;
        }

        const text = toAsciiText(entry.text || '');
        if (!text) continue;
        normalized.push({ kind, text });
    }
    return normalized;
}

function buildPageStreams(lines: NormalizedLine[]): string[] {
    const pages: string[] = [];
    let currentOps: string[] = [];
    let y = PAGE_TOP_Y;

    const flushPage = () => {
        if (currentOps.length === 0) return;
        pages.push(currentOps.join('\n'));
        currentOps = [];
        y = PAGE_TOP_Y;
    };

    const ensureSpace = (requiredHeight: number) => {
        if ((y - requiredHeight) < PAGE_BOTTOM_Y) {
            flushPage();
        }
    };

    for (const line of lines) {
        if (line.kind === 'spacer') {
            y -= STYLES.spacer.leading;
            continue;
        }

        const style = STYLES[line.kind];
        let renderedLines: string[];
        if (line.kind === 'bullet') {
            const firstLineLimit = estimateCharsPerLine(style.size) - 2;
            const wrapped = wrapText(line.text, firstLineLimit);
            renderedLines = wrapped.map((part, idx) => (idx === 0 ? `- ${part}` : `  ${part}`));
        } else {
            renderedLines = wrapText(line.text, estimateCharsPerLine(style.size));
        }

        for (const text of renderedLines) {
            ensureSpace(style.leading);
            currentOps.push(`BT /${style.font} ${style.size} Tf ${PAGE_MARGIN_X} ${y} Td (${escapePdfText(text)}) Tj ET`);
            y -= style.leading;
        }

        if (line.kind === 'title') y -= 4;
        if (line.kind === 'section') y -= 2;
    }

    flushPage();
    if (pages.length === 0) {
        pages.push(`BT /F1 11 Tf ${PAGE_MARGIN_X} ${PAGE_TOP_Y} Td (${escapePdfText('No content.')}) Tj ET`);
    }
    return pages;
}

function buildPdfFromPageStreams(pageStreams: string[]): Buffer {
    const pageCount = pageStreams.length;
    const firstPageObject = 5;
    const lastObject = firstPageObject + (pageCount * 2) - 1;
    const objects = new Array<string>(lastObject + 1).fill('');
    const kids: string[] = [];

    let objectNum = firstPageObject;
    for (const stream of pageStreams) {
        const pageObject = objectNum;
        const contentObject = objectNum + 1;
        objectNum += 2;
        kids.push(`${pageObject} 0 R`);

        objects[pageObject] = `${pageObject} 0 obj
<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${contentObject} 0 R >>
endobj
`;

        const streamLength = Buffer.byteLength(stream, 'utf8');
        objects[contentObject] = `${contentObject} 0 obj
<< /Length ${streamLength} >>
stream
${stream}
endstream
endobj
`;
    }

    objects[1] = `1 0 obj
<< /Type /Catalog /Pages 2 0 R >>
endobj
`;
    objects[2] = `2 0 obj
<< /Type /Pages /Kids [${kids.join(' ')}] /Count ${pageCount} >>
endobj
`;
    objects[3] = `3 0 obj
<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>
endobj
`;
    objects[4] = `4 0 obj
<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>
endobj
`;

    let pdf = '%PDF-1.4\n';
    const offsets: number[] = [0];
    for (let idx = 1; idx <= lastObject; idx += 1) {
        offsets[idx] = Buffer.byteLength(pdf, 'utf8');
        pdf += objects[idx];
    }

    const xrefOffset = Buffer.byteLength(pdf, 'utf8');
    pdf += `xref\n0 ${lastObject + 1}\n`;
    pdf += '0000000000 65535 f \n';
    for (let idx = 1; idx <= lastObject; idx += 1) {
        pdf += `${offsets[idx].toString().padStart(10, '0')} 00000 n \n`;
    }
    pdf += 'trailer\n';
    pdf += `<< /Size ${lastObject + 1} /Root 1 0 R >>\n`;
    pdf += 'startxref\n';
    pdf += `${xrefOffset}\n`;
    pdf += '%%EOF';
    return Buffer.from(pdf, 'utf8');
}

export function buildSimplePdf(lines: Array<string | SimplePdfLine>): Buffer {
    const normalized = normalizeLines(lines);
    const pageStreams = buildPageStreams(normalized);
    return buildPdfFromPageStreams(pageStreams);
}
