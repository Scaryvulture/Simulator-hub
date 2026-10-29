import assert from 'node:assert/strict';
import test from 'node:test';
import {
    detectGenericTerminalIntent,
    extractSessionVarUpdates,
    generateSessionVars,
    interpolateVars,
    promptSessionVars,
    withSessionVarUpdateProtocol,
} from '@/lib/director-session-vars';
import {
    executeRuntimeToolCall,
    extractRuntimeToolCalls,
    isLikelyReasoningModel,
    sanitizeConfiguredTools,
    type RawResponsesCreateResult,
    type RuntimeToolCall,
} from '@/lib/director-runtime-tools';

test('generateSessionVars preserves deterministic values and resolves dependent mappings', () => {
    const vars = generateSessionVars(
        {
            locale: { type: 'random', options: ['es'] },
            persona: { type: 'fixed', value: 'coach' },
            age: { type: 'computed', formula: 'random(18, 18)' },
            region: {
                type: 'random_by',
                source_var: 'locale',
                mapping: {
                    es: ['latam'],
                },
            },
            legacy: 'legacy-value',
        },
        {
            greeting: {
                depends_on: 'locale',
                mappings: {
                    '^es$': ['hola'],
                },
            },
        }
    );

    assert.deepEqual(vars, {
        locale: 'es',
        persona: 'coach',
        age: 18,
        region: 'latam',
        legacy: 'legacy-value',
        greeting: 'hola',
    });
});

test('extractSessionVarUpdates keeps only allowed primitive updates and strips protocol block', () => {
    const result = extractSessionVarUpdates(
        'Hola equipo.\n[[SV]]{"score":3,"done":true,"unknown":"nope","meta":{"a":1}}[[/SV]]\nSeguimos.',
        { score: 0, done: false },
        { openTag: '[[SV]]', closeTag: '[[/SV]]' }
    );

    assert.equal(result.cleanContent, 'Hola equipo.\n\nSeguimos.');
    assert.deepEqual(result.updates, {
        score: 3,
        done: true,
    });
});

test('session var prompt helpers only expose meaningful values and inject the update protocol when needed', () => {
    const promptedVars = promptSessionVars({
        empty: '',
        missing: null,
        user_name: 'Ana',
        turns: 2,
    });

    assert.deepEqual(promptedVars, {
        user_name: 'Ana',
        turns: 2,
    });

    const instructions = withSessionVarUpdateProtocol(
        'Responde con contexto.',
        promptedVars,
        { openTag: '<sv>', closeTag: '</sv>' }
    );

    assert.match(instructions, /Variables permitidas para actualizar: user_name, turns\./);
    assert.match(instructions, /<sv>\{"variable":"nuevo_valor"\}<\/sv>/);
});

test('detectGenericTerminalIntent respects configured goodbye and closing phrases', () => {
    const config = {
        generic_interaction: {
            goodbye_intent_phrases: ['chau', 'hasta luego'],
            closing_intent_phrases: ['cerramos por ahora'],
        },
        goodbye_message: 'Nos vemos',
        closing_message: 'Cierro la sesion',
    } as const;

    assert.equal(detectGenericTerminalIntent('chau', config), 'GOODBYE');
    assert.equal(detectGenericTerminalIntent('cerramos por ahora', config), 'CLOSING');
    assert.equal(detectGenericTerminalIntent('chau?', config), null);
    assert.equal(interpolateVars('Hola {user}', { user: 'Ana' }), 'Hola Ana');
});

test('sanitizeConfiguredTools keeps only valid function tools and normalizes names', () => {
    const sanitized = sanitizeConfiguredTools([
        null,
        { type: 'web_search' },
        {
            type: 'function',
            function: {
                name: ' runtime.now ',
                description: ' Fecha actual ',
                parameters: { type: 'object', properties: {} },
            },
        },
        {
            type: 'function',
            function: {
                name: '   ',
            },
        },
    ]);

    assert.deepEqual(sanitized, [
        {
            type: 'function',
            function: {
                name: 'runtime.now',
                description: 'Fecha actual',
                parameters: { type: 'object', properties: {} },
            },
        },
    ]);
});

test('extractRuntimeToolCalls returns only valid function calls from platform output', () => {
    const response: RawResponsesCreateResult = {
        output: [
            { type: 'message', role: 'assistant' },
            { type: 'function_call', call_id: 'call-1', name: 'runtime.now', arguments: '{"tz":"UTC"}' },
            { type: 'function_call', call_id: '', name: 'runtime.now', arguments: '{}' },
            { type: 'function_call', call_id: 'call-2', name: '  runtime.session_vars  ', arguments: '' },
        ],
    };

    assert.deepEqual(extractRuntimeToolCalls(response), [
        { call_id: 'call-1', name: 'runtime.now', arguments: '{"tz":"UTC"}' },
        { call_id: 'call-2', name: 'runtime.session_vars', arguments: '' },
    ]);
});

test('executeRuntimeToolCall serves supported runtime tools and reports unsupported ones', () => {
    const sessionVars = {
        user_name: 'Ana',
        attempts: 3,
        active: true,
    };

    const sessionVarsCall: RuntimeToolCall = {
        call_id: 'call-1',
        name: 'runtime.session_vars',
        arguments: '{"keys":["user_name","attempts","missing"]}',
    };
    const sessionVarsResult = JSON.parse(executeRuntimeToolCall(sessionVarsCall, sessionVars));

    assert.deepEqual(sessionVarsResult, {
        ok: true,
        session_vars: {
            user_name: 'Ana',
        },
        available_keys: ['user_name', 'attempts', 'active'],
    });

    const unknownResult = JSON.parse(executeRuntimeToolCall({
        call_id: 'call-2',
        name: 'runtime.unknown',
        arguments: '{}',
    }, sessionVars));

    assert.equal(unknownResult.ok, false);
    assert.match(unknownResult.error, /runtime\.unknown/);
    assert.deepEqual(unknownResult.available_tools, ['runtime.now', 'runtime.session_vars']);
});

test('isLikelyReasoningModel detects current reasoning-oriented families', () => {
    assert.equal(isLikelyReasoningModel('o3-mini'), true);
    assert.equal(isLikelyReasoningModel('gpt-5-mini'), true);
    assert.equal(isLikelyReasoningModel('chatgpt-5'), true);
    assert.equal(isLikelyReasoningModel('codex-5'), true);
    assert.equal(isLikelyReasoningModel('gpt-4.1-mini'), false);
});
