import { register } from 'node:module';
import { randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';
import { beforeEach, test } from 'node:test';

type Row = Record<string, unknown>;
let db: { session: Row; messages: Row[]; bots: Row[]; versions: Row[]; audits: Row[] };
let clock = Date.now();
let queue = Promise.resolve();
const copy = <T>(value: T): T => structuredClone(value);
const sid = '550e8400-e29b-41d4-a716-446655440000';
const matches = (row: Row, where: Row = {}) => Object.entries(where).every(([key, value]) => row[key] === value);
const prisma = {
    $queryRaw: async () => [{ ...copy(db.session), now_ms: BigInt(clock) }],
    session: {
        findUnique: async ({ include }: { include?: { bot?: boolean } } = {}) => ({ ...copy(db.session), ...(include?.bot ? { bot: copy(db.bots[0]) } : {}) }),
        update: async ({ data }: { data: Row }) => Object.assign(db.session, copy(data)),
    },
    message: {
        create: async ({ data }: { data: Row }) => { db.messages.push(copy(data)); return data; },
        findFirst: async () => copy(db.messages[0] || null),
        findMany: async () => copy(db.messages),
    },
    bot: {
        findUnique: async ({ where }: { where: Row }) => copy(db.bots.find((bot) => matches(bot, where)) || null),
        findFirst: async ({ where }: { where: Row }) => copy(db.bots.find((bot) => matches(bot, where)) || null),
        update: async ({ where, data }: { where: Row; data: Row }) => Object.assign(db.bots.find((bot) => matches(bot, where))!, copy(data)),
    },
    botVersion: {
        findFirst: async ({ where }: { where: Row }) => copy([...db.versions].reverse().find((version) => matches(version, where)) || null),
        create: async ({ data }: { data: Row }) => { const row = { id: randomUUID(), ...copy(data) }; db.versions.push(row); return copy(row); },
    },
    pricingConfig: { findUnique: async () => ({ input_price_per_million: 1, output_price_per_million: 1 }) },
    sessionCostAudit: { upsert: async ({ create }: { create: Row }) => { db.audits.push(copy(create)); } },
    $transaction: async <T>(run: (tx: typeof prisma) => Promise<T>): Promise<T> => {
        const previous = queue;
        let release!: () => void;
        queue = new Promise<void>((resolve) => { release = resolve; });
        await previous;
        const before = copy(db);
        try { return await run(prisma); } catch (error) { db = before; throw error; } finally { release(); }
    },
};
Object.assign(globalThis, { __auditPrisma: prisma, __auditActor: { role: 'ADMIN', userId: 'owner' } });
register('./support/server-loader.mjs', import.meta.url);
const { withSessionOperation } = await import('../src/lib/session-operation');
const { currentSessionOperation, SessionOperationError } = await import('../src/lib/session-operation-context');
const { mutateSessionMetadata } = await import('../src/lib/session-metadata');
const { Director } = await import('../src/lib/director');
const { getRuntimeBot, getPublishedRuntimeBot } = await import('../src/lib/runtime-bot');
const { restoreBotVersion, createBotVersion } = await import('../src/app/actions/versions');

beforeEach(() => {
    db = { session: { id: sid, bot_id: 'bot-one', external_user_id: 'owner', metadata: {}, ended: false }, messages: [], versions: [], audits: [], bots: [{
        id: 'bot-one', name: 'Example', bot_type: 'GENERIC', published: true, deleted_at: null,
        openai_prompt_id: '', prompt_version: '1', openai_vector_store_id: null, api_key: null,
        config: { llm_model: 'gpt-4o-mini', intro_message: 'Hello' },
    }] };
    clock = Date.now();
    Object.assign(globalThis, { __auditActor: { role: 'ADMIN', userId: 'owner' } });
});

test('rejects overlapping turns, commits state and receipt, reuses accepted request IDs', async () => {
    let started!: () => void; let finish!: () => void;
    const entered = new Promise<void>((resolve) => { started = resolve; });
    const gate = new Promise<void>((resolve) => { finish = resolve; });
    const first = withSessionOperation(sid, 'message', async () => {
        await mutateSessionMetadata({ sessionId: sid, mutate: (metadata) => ({ metadata: { ...metadata, count: 1 } }) });
        started(); await gate; return { content: 'accepted' };
    }, { id: 'request-1', payload: 'hello' });
    await entered;
    assert.equal((db.session.metadata as Row).count, undefined, 'progress stays staged');
    await assert.rejects(withSessionOperation(sid, 'end', async () => {}), SessionOperationError);
    finish(); await first;
    assert.equal((db.session.metadata as Row).count, 1);
    const cached = await withSessionOperation(sid, 'message', async () => { throw new Error('must not run'); }, { id: 'request-1', payload: 'hello' });
    assert.deepEqual(cached, { content: 'accepted' });
    await assert.rejects(withSessionOperation(sid, 'message', async () => {}, { id: 'request-1', payload: 'changed' }), /otro contenido/);
});

test('provider failure discards staged progress and messages and permits a retry', async () => {
    await assert.rejects(withSessionOperation(sid, 'message', async () => {
        await mutateSessionMetadata({ sessionId: sid, mutate: () => ({ metadata: { step: 2 }, ended: true }) });
        currentSessionOperation(sid)!.writes.push((tx) => tx.message.create({ data: { content: 'not committed', role: 'assistant' } }));
        throw new Error('provider unavailable');
    }), /provider unavailable/);
    assert.deepEqual(db.session.metadata, {});
    assert.equal(db.session.ended, false);
    assert.equal(db.messages.length, 0);
    await withSessionOperation(sid, 'message', async () => 'retry works');
});

test('expired executor cannot overwrite a replacement operation', async () => {
    let started!: () => void; let finish!: () => void;
    const entered = new Promise<void>((resolve) => { started = resolve; });
    const gate = new Promise<void>((resolve) => { finish = resolve; });
    const old = withSessionOperation(sid, 'message', async () => { started(); await gate; return 'old'; });
    await entered;
    clock += 16 * 60_000;
    await withSessionOperation(sid, 'end', () => mutateSessionMetadata({ sessionId: sid, mutate: () => ({ ended: true }) }));
    finish(); await assert.rejects(old, /venció/);
    assert.equal(db.session.ended, true);
});

test('initialization is idempotent and does not reset existing progress', async () => {
    const first = await Director.initSession(sid, 'bot-one');
    await mutateSessionMetadata({ sessionId: sid, mutate: (metadata) => ({ metadata: { ...metadata, examiner_state: { step: 4 } } }) });
    const second = await Director.initSession(sid, 'bot-one');
    assert.deepEqual(second, first);
    assert.equal(db.messages.length, 1);
    assert.deepEqual((db.session.metadata as Row).examiner_state, { step: 4 });
});

test('closed conversation accepts no new transcript messages', async () => {
    db.session.ended = true;
    await Director.processMessage(sid, 'bot-one', 'late message');
    assert.equal(db.messages.length, 0);
    assert.equal(db.session.ended, true);
});

test('published runtime and session snapshot survive draft and release changes', async () => {
    await getPublishedRuntimeBot('bot-one');
    const original = await getRuntimeBot('bot-one', sid);
    db.bots[0].config = { llm_model: 'gpt-4o-mini', intro_message: 'new draft' };
    assert.deepEqual((await getPublishedRuntimeBot('bot-one')).config, original.config);
    db.versions.push({ id: 'new-release', bot_id: 'bot-one', environment: 'PROD', prompt_version: '2', version_number: 2, config: { intro_message: 'new release', __runtime: { bot_type: 'GENERIC' } } });
    assert.deepEqual((await getRuntimeBot('bot-one', sid)).config, original.config);
});

test('restore rejects another bot version and snapshot labels cannot publish', async () => {
    db.versions.push({ id: 'foreign', bot_id: 'other-bot', environment: 'PROD', config: {}, version_number: 1 });
    await assert.rejects(restoreBotVersion('bot-one', 'foreign'), /no pertenece/);
    const version = await createBotVersion('bot-one', 'PROD');
    assert.equal(version.environment, 'SNAPSHOT');
});

test('evaluation uses frozen rubric, reuses identical transcript and keeps reevaluation history', async () => {
    const evaluator = { ...copy(db.bots[0]), id: 'evaluator', bot_type: 'EVALUATOR', api_key: 'test-only-key', config: {
        llm_model: 'gpt-4o-mini', criteria: { boolean: [{ id: 'c1', title: 'Original rubric', instruction: 'Says hello' }], qualitative: [] },
    } };
    db.bots.push(evaluator);
    db.bots[0].config = { llm_model: 'gpt-4o-mini', evaluator_bot_id: 'evaluator' };
    await getRuntimeBot('bot-one', sid);
    evaluator.config = { llm_model: 'gpt-4o-mini', criteria: { boolean: [{ id: 'c2', title: 'Changed rubric', instruction: 'Different requirement' }], qualitative: [] } };
    db.session.ended = true;
    db.messages.push({ role: 'user', content: 'hello', images: null });
    let calls = 0;
    Object.assign(globalThis, { __auditAI: { responses: { create: async () => {
        calls++;
        return { output_text: JSON.stringify({ boolean_results: [{ id: 'c1', passed: true, reason: 'Said hello' }], qualitative_results: [] }), usage: { input_tokens: 10, output_tokens: 10 } };
    } } } });
    const { runSessionEvaluation } = await import('../src/lib/evaluation-service');
    const first = await runSessionEvaluation(sid, { source: 'manual' });
    assert.equal(first.evaluation.results.boolean[0].title, 'Original rubric');
    assert.equal(first.evaluation.percentage, 100);
    const cached = await runSessionEvaluation(sid, { source: 'manual' });
    assert.equal(cached.reused, true);
    assert.equal(calls, 1);
    await runSessionEvaluation(sid, { source: 'admin_manual', force: true });
    assert.equal(((db.session.metadata as Row).evaluation_history as unknown[]).length, 1);
    assert.equal(calls, 2);
});

test('organization admin cannot assign a bot or operate another users conversation', async () => {
    Object.assign(globalThis, { __auditActor: { role: 'USER', userId: 'org-admin', hasOrgAdminAccess: true } });
    const { addBotToOrg } = await import('../src/app/actions/organizations');
    const result = await addBotToOrg('org', 'bot-one');
    assert.equal(result.success, false);
    const { assertCanUseSessionForLiveChat } = await import('../src/lib/chat-access');
    await assert.rejects(assertCanUseSessionForLiveChat({ sessionId: sid, user: { role: 'ADMIN', userId: 'other-admin' } }), /Only the session owner/);
});

test('production CSP forwards its nonce to renderer and response, replacing supplied headers', async () => {
    process.env.APP_JWT_SECRET = 'test-only-secret-at-least-32-characters';
    process.env.CSP_NONCE_ENABLED = 'true';
    const { proxy } = await import('../src/proxy');
    const { NextRequest } = await import('next/server');
    const response = await proxy(new NextRequest('http://localhost/login', { headers: { 'content-security-policy': "script-src 'nonce-forged'" } }));
    const csp = response.headers.get('content-security-policy');
    assert.equal(response.headers.get('x-middleware-request-content-security-policy'), csp);
    assert(!csp?.includes('forged'));
    const nonce = response.headers.get('x-middleware-request-x-nonce');
    assert(csp?.includes(`'nonce-${nonce}'`));
});
