import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { sanitizeSpreadsheetCell, sanitizeSpreadsheetText } from '@/lib/spreadsheet-sanitizer';

describe('spreadsheet-sanitizer', () => {
    it('keeps normal text untouched', () => {
        assert.equal(sanitizeSpreadsheetText('Hola mundo'), 'Hola mundo');
        assert.equal(sanitizeSpreadsheetText('2026-03-05'), '2026-03-05');
    });

    it('escapes formula-like prefixes to prevent spreadsheet injection', () => {
        assert.equal(sanitizeSpreadsheetText('=SUM(A1:A2)'), "'=SUM(A1:A2)");
        assert.equal(sanitizeSpreadsheetText('+CMD'), "'+CMD");
        assert.equal(sanitizeSpreadsheetText('-10+20'), "'-10+20");
        assert.equal(sanitizeSpreadsheetText('@evil'), "'@evil");
        assert.equal(sanitizeSpreadsheetText('   =HYPERLINK("x","y")'), "'   =HYPERLINK(\"x\",\"y\")");
    });

    it('preserves numeric cells and normalizes nullable values', () => {
        assert.equal(sanitizeSpreadsheetCell(123), 123);
        assert.equal(sanitizeSpreadsheetCell(0), 0);
        assert.equal(sanitizeSpreadsheetCell(null), '');
        assert.equal(sanitizeSpreadsheetCell(undefined), '');
    });

    it('sanitizes non-number cells by converting them to string', () => {
        assert.equal(sanitizeSpreadsheetCell('=2+2'), "'=2+2");
        assert.equal(sanitizeSpreadsheetCell(10n), '10');
        assert.equal(sanitizeSpreadsheetCell('@x'), "'@x");
    });
});
