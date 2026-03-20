import 'server-only';

type CellValue = string | number | boolean | null | undefined;

function xmlEscape(value: string): string {
    return value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');
}

function toColumnName(index: number): string {
    let n = index + 1;
    let col = '';
    while (n > 0) {
        const rem = (n - 1) % 26;
        col = String.fromCharCode(65 + rem) + col;
        n = Math.floor((n - 1) / 26);
    }
    return col;
}

function makeCellXml(colIndex: number, rowIndex: number, value: CellValue): string {
    const ref = `${toColumnName(colIndex)}${rowIndex}`;

    if (value === null || value === undefined || value === '') {
        return `<c r="${ref}" t="inlineStr"><is><t></t></is></c>`;
    }

    if (typeof value === 'number' && Number.isFinite(value)) {
        return `<c r="${ref}"><v>${value}</v></c>`;
    }

    const text = typeof value === 'boolean' ? (value ? 'true' : 'false') : String(value);
    return `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${xmlEscape(text)}</t></is></c>`;
}

function buildWorksheetXml(headers: string[], rows: CellValue[][]): string {
    const allRows: string[] = [];

    const headerCells = headers.map((header, idx) => makeCellXml(idx, 1, header)).join('');
    allRows.push(`<row r="1">${headerCells}</row>`);

    for (let i = 0; i < rows.length; i += 1) {
        const rowIndex = i + 2;
        const row = rows[i];
        const cells = headers.map((_, colIndex) => makeCellXml(colIndex, rowIndex, row[colIndex])).join('');
        allRows.push(`<row r="${rowIndex}">${cells}</row>`);
    }

    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <sheetData>
    ${allRows.join('')}
  </sheetData>
</worksheet>`;
}

function dosDateTime(date: Date): { time: number; date: number } {
    const year = Math.max(1980, date.getFullYear());
    const month = date.getMonth() + 1;
    const day = date.getDate();
    const hours = date.getHours();
    const minutes = date.getMinutes();
    const seconds = Math.floor(date.getSeconds() / 2);

    const dosTime = (hours << 11) | (minutes << 5) | seconds;
    const dosDate = ((year - 1980) << 9) | (month << 5) | day;
    return { time: dosTime, date: dosDate };
}

const CRC32_TABLE = (() => {
    const table = new Uint32Array(256);
    for (let i = 0; i < 256; i += 1) {
        let c = i;
        for (let j = 0; j < 8; j += 1) {
            c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
        }
        table[i] = c >>> 0;
    }
    return table;
})();

function crc32(buffer: Buffer): number {
    let crc = 0xffffffff;
    for (let i = 0; i < buffer.length; i += 1) {
        crc = CRC32_TABLE[(crc ^ buffer[i]) & 0xff] ^ (crc >>> 8);
    }
    return (crc ^ 0xffffffff) >>> 0;
}

function u16(value: number): Buffer {
    const buf = Buffer.allocUnsafe(2);
    buf.writeUInt16LE(value & 0xffff, 0);
    return buf;
}

function u32(value: number): Buffer {
    const buf = Buffer.allocUnsafe(4);
    buf.writeUInt32LE(value >>> 0, 0);
    return buf;
}

function buildZip(entries: Array<{ name: string; data: Buffer }>): Buffer {
    const now = dosDateTime(new Date());
    const localParts: Buffer[] = [];
    const centralParts: Buffer[] = [];
    let offset = 0;

    for (const entry of entries) {
        const nameBuf = Buffer.from(entry.name, 'utf8');
        const dataBuf = entry.data;
        const crc = crc32(dataBuf);
        const size = dataBuf.length;

        const localHeader = Buffer.concat([
            u32(0x04034b50),
            u16(20),
            u16(0),
            u16(0),
            u16(now.time),
            u16(now.date),
            u32(crc),
            u32(size),
            u32(size),
            u16(nameBuf.length),
            u16(0),
            nameBuf,
        ]);

        localParts.push(localHeader, dataBuf);

        const centralHeader = Buffer.concat([
            u32(0x02014b50),
            u16(20),
            u16(20),
            u16(0),
            u16(0),
            u16(now.time),
            u16(now.date),
            u32(crc),
            u32(size),
            u32(size),
            u16(nameBuf.length),
            u16(0),
            u16(0),
            u16(0),
            u16(0),
            u32(0),
            u32(offset),
            nameBuf,
        ]);

        centralParts.push(centralHeader);
        offset += localHeader.length + dataBuf.length;
    }

    const centralDir = Buffer.concat(centralParts);
    const localData = Buffer.concat(localParts);

    const eocd = Buffer.concat([
        u32(0x06054b50),
        u16(0),
        u16(0),
        u16(entries.length),
        u16(entries.length),
        u32(centralDir.length),
        u32(localData.length),
        u16(0),
    ]);

    return Buffer.concat([localData, centralDir, eocd]);
}

export function buildSimpleXlsx(params: {
    headers: string[];
    rows: CellValue[][];
    sheetName?: string;
}): Buffer {
    const safeSheetName = (params.sheetName || 'Practices').slice(0, 31);
    const worksheetXml = buildWorksheetXml(params.headers, params.rows);

    const entries = [
        {
            name: '[Content_Types].xml',
            data: Buffer.from(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
  <Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
</Types>`),
        },
        {
            name: '_rels/.rels',
            data: Buffer.from(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`),
        },
        {
            name: 'xl/workbook.xml',
            data: Buffer.from(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets>
    <sheet name="${xmlEscape(safeSheetName)}" sheetId="1" r:id="rId1"/>
  </sheets>
</workbook>`),
        },
        {
            name: 'xl/_rels/workbook.xml.rels',
            data: Buffer.from(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`),
        },
        {
            name: 'xl/styles.xml',
            data: Buffer.from(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <fonts count="1">
    <font>
      <sz val="11"/>
      <name val="Calibri"/>
    </font>
  </fonts>
  <fills count="2">
    <fill><patternFill patternType="none"/></fill>
    <fill><patternFill patternType="gray125"/></fill>
  </fills>
  <borders count="1">
    <border><left/><right/><top/><bottom/><diagonal/></border>
  </borders>
  <cellStyleXfs count="1">
    <xf numFmtId="0" fontId="0" fillId="0" borderId="0"/>
  </cellStyleXfs>
  <cellXfs count="1">
    <xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
  </cellXfs>
  <cellStyles count="1">
    <cellStyle name="Normal" xfId="0" builtinId="0"/>
  </cellStyles>
</styleSheet>`),
        },
        {
            name: 'xl/worksheets/sheet1.xml',
            data: Buffer.from(worksheetXml),
        },
    ];

    return buildZip(entries);
}
