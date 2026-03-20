import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const TARGET_DIRS = ['src', 'scripts'];
const ALLOWED_FILES = new Set([
    path.join(ROOT, 'src/lib/ai-client.ts'),
]);

function walkFiles(dir: string, result: string[]) {
    const entries = readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
        if (entry.name.startsWith('.')) continue;
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            walkFiles(full, result);
            continue;
        }
        if (!entry.isFile()) continue;
        if (!full.endsWith('.ts') && !full.endsWith('.tsx')) continue;
        result.push(full);
    }
}

describe('openai factory guardrail', () => {
    it('forbids direct new OpenAI outside ai-client.ts', () => {
        const files: string[] = [];
        for (const dir of TARGET_DIRS) {
            const fullDir = path.join(ROOT, dir);
            if (!existsSync(fullDir)) continue;
            walkFiles(fullDir, files);
        }

        const offenders: string[] = [];
        for (const file of files) {
            if (ALLOWED_FILES.has(file)) continue;
            const content = readFileSync(file, 'utf-8');
            if (content.includes('new OpenAI(')) {
                offenders.push(path.relative(ROOT, file));
            }
        }

        assert.deepEqual(
            offenders,
            [],
            `Direct OpenAI instantiation detected outside factory:\n${offenders.join('\n')}`
        );
    });
});
