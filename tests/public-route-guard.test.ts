import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import fs from 'node:fs';
import path from 'node:path';

const WORKSPACE_ROOT = process.cwd();
const API_ROOT = path.join(WORKSPACE_ROOT, 'src', 'app', 'api');

function listRouteFiles(dir: string): string[] {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    const files: string[] = [];

    for (const entry of entries) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            files.push(...listRouteFiles(full));
            continue;
        }
        if (entry.isFile() && entry.name === 'route.ts') {
            files.push(full);
        }
    }

    return files;
}

describe('public-route-guard', () => {
    it('prevents public API routes from importing private getBot accessors', () => {
        const routeFiles = listRouteFiles(API_ROOT)
            .filter((fullPath) => !fullPath.includes(`${path.sep}admin${path.sep}`));

        for (const filePath of routeFiles) {
            const source = fs.readFileSync(filePath, 'utf8');
            const forbiddenDirectImport = /import\s*\{[^}]*\bgetBot\b[^}]*\}\s*from\s*['"]@\/app\/actions\/bots['"]/m;
            const forbiddenAliasImport = /import\s+.*\bgetBot\b.*from\s*['"]@\/app\/actions\/bots['"]/m;
            assert.equal(
                forbiddenDirectImport.test(source) || forbiddenAliasImport.test(source),
                false,
                `Public route must not import getBot from actions: ${filePath}`
            );
        }
    });
});
