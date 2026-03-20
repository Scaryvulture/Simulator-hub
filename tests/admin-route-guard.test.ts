import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import fs from 'node:fs';
import path from 'node:path';

const WORKSPACE_ROOT = process.cwd();
const ADMIN_API_ROOT = path.join(WORKSPACE_ROOT, 'src', 'app', 'api', 'admin');

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

describe('admin-route-guard', () => {
    it('requires explicit auth gate in all admin API routes', () => {
        const routeFiles = listRouteFiles(ADMIN_API_ROOT);

        for (const filePath of routeFiles) {
            const source = fs.readFileSync(filePath, 'utf8');
            const importsAuthGate = /import\s*\{[^}]*\b(verifyAdmin|verifyAdminOrOrgAdmin)\b[^}]*\}\s*from\s*['"]@\/lib\/auth-utils['"]/m.test(source);
            const invokesAuthGate = /\b(verifyAdmin|verifyAdminOrOrgAdmin)\s*\(/m.test(source);

            assert.equal(
                importsAuthGate && invokesAuthGate,
                true,
                `Admin route must enforce explicit auth gate: ${filePath}`
            );
        }
    });
});
