import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { processDetectorTurn, type DetectorState } from '@/lib/detector-engine';
import type { BotConfig } from '@/lib/schemas/bot-config';

function buildConfig(overrides: Partial<BotConfig> = {}): BotConfig {
    return {
        detection_steps: [],
        ...overrides,
    };
}

function buildState(overrides: Partial<DetectorState> = {}): DetectorState {
    return {
        currentStepIndex: 0,
        findings: [],
        blocked: false,
        turnCount: 0,
        stepAttempts: 0,
        data: {},
        ...overrides,
    };
}

describe('detector-engine', () => {
    it('normalizes non-standard severity values and blocks when required step is critical', async () => {
        const responses = [
            { severity: 'critico', explanation: 'Falta control crítico.' },
            { severity: 'CRITICAL', explanation: 'Confirmado por supervisor.' },
        ];
        let responseIndex = 0;

        const fakeOpenAI = {
            chat: {
                completions: {
                    create: async () => {
                        const payload = responses[Math.min(responseIndex, responses.length - 1)];
                        responseIndex += 1;
                        return {
                            choices: [{ message: { content: JSON.stringify(payload) } }],
                            usage: { prompt_tokens: 4, completion_tokens: 3 },
                        };
                    },
                },
            },
        } as never;

        const config = buildConfig({
            detection_steps: [
                {
                    id: 'img-1',
                    order: 0,
                    type: 'image',
                    instruction: 'Subí una foto de referencia.',
                    required: true,
                    show_ref_on_uncertain: false,
                    criteria: 'Detectar falla crítica.',
                    feedback_block: '🛑 Bloqueo: {explanation}',
                },
            ],
        });

        const result = await processDetectorTurn({
            userMessage: 'adjunto',
            userImages: ['data:image/png;base64,abc'],
            state: buildState({ stepAttempts: 1 }),
            config,
            openai: fakeOpenAI,
            model: 'gpt-4o-mini',
        });

        assert.equal(result.ended, true);
        assert.equal(result.newState.blocked, true);
        assert.equal(result.newState.findings[0]?.severity, 'CRITICAL');
        assert.match(result.response, /\*\*Veredicto:\*\* NO HABILITADO/);
    });

    it('registers warning and continues when optional image step is missing', async () => {
        const fakeOpenAI = {
            chat: {
                completions: {
                    create: async () => {
                        throw new Error('Should not call vision model for missing optional image');
                    },
                },
            },
        } as never;

        const config = buildConfig({
            detection_steps: [
                {
                    id: 'img-opcional',
                    order: 0,
                    type: 'image',
                    instruction: 'Subí foto opcional.',
                    required: false,
                    show_ref_on_uncertain: false,
                    feedback_warn: '⚠️ {explanation}',
                },
                {
                    id: 'txt-2',
                    order: 1,
                    type: 'text',
                    instruction: 'Confirmá estado final.',
                    required: true,
                    show_ref_on_uncertain: false,
                    keywords: ['ok'],
                },
            ],
        });

        const result = await processDetectorTurn({
            userMessage: 'sin imagen',
            userImages: [],
            state: buildState({ stepAttempts: 1 }),
            config,
            openai: fakeOpenAI,
            model: 'gpt-4o-mini',
        });

        assert.equal(result.ended, false);
        assert.equal(result.newState.blocked, false);
        assert.equal(result.newState.findings.length, 1);
        assert.equal(result.newState.findings[0]?.severity, 'WARNING');
        assert.match(result.response, /Confirmá estado final/);
    });

    it('generates deterministic final report without extra llm call', async () => {
        const fakeOpenAI = {
            chat: {
                completions: {
                    create: async () => {
                        throw new Error('Final report should not call LLM');
                    },
                },
            },
        } as never;

        const config = buildConfig({
            detection_steps: [
                {
                    id: 'txt-1',
                    order: 0,
                    type: 'text',
                    instruction: 'Paso final.',
                    required: true,
                    show_ref_on_uncertain: false,
                },
            ],
        });

        const result = await processDetectorTurn({
            userMessage: 'irrelevante',
            userImages: [],
            state: buildState({
                currentStepIndex: 1,
                findings: [
                    {
                        stepId: 'txt-1',
                        stepTitle: 'Paso final.',
                        severity: 'WARNING',
                        explanation: 'Observación registrada.',
                    },
                ],
                data: { rol: 'soldador' },
            }),
            config,
            openai: fakeOpenAI,
            model: 'gpt-4o-mini',
        });

        assert.equal(result.ended, true);
        assert.match(result.response, /\*\*REPORTE FINAL DE DETECCIÓN\*\*/);
        assert.match(result.response, /\*\*Veredicto:\*\* HABILITADO CON OBSERVACIONES/);
        assert.match(result.response, /\*\*Datos relevados:\*\*/);
    });

    it('renders custom final verdict template using detector variables and saved step data', async () => {
        const fakeOpenAI = {} as never;

        const config = buildConfig({
            detector_options: {
                final_verdict_template: 'Luego de verificar tu andamio, el veredicto es {veredicto}. Severidad: {severidad_global}. Hallazgos críticos: {hallazgos_critical}. Rol: {data.rol}. Acción recomendada: {proxima_accion}.',
                verdict_labels: {
                    habilitado_con_observaciones: 'APTO CON OBS',
                },
            },
            detection_steps: [
                {
                    id: 'txt-1',
                    order: 0,
                    type: 'text',
                    instruction: 'Paso final.',
                    required: true,
                    show_ref_on_uncertain: false,
                },
            ],
        });

        const result = await processDetectorTurn({
            userMessage: 'irrelevante',
            userImages: [],
            state: buildState({
                currentStepIndex: 1,
                findings: [
                    {
                        stepId: 'txt-1',
                        stepTitle: 'Paso final.',
                        severity: 'WARNING',
                        explanation: 'Observación registrada.',
                    },
                ],
                data: { rol: 'soldador' },
            }),
            config,
            openai: fakeOpenAI,
            model: 'gpt-4o-mini',
        });

        assert.equal(result.ended, true);
        assert.match(result.response, /Luego de verificar tu andamio, el veredicto es APTO CON OBS\./);
        assert.match(result.response, /Severidad: WARNING\./);
        assert.match(result.response, /Hallazgos críticos: 0\./);
        assert.match(result.response, /Rol: soldador\./);
        assert.match(result.response, /Acción recomendada: corregir las observaciones/);
        assert.doesNotMatch(result.response, /\*\*REPORTE FINAL DE DETECCIÓN\*\*/);
        assert.doesNotMatch(result.response, /\*\*Veredicto:\*\*/);
    });

    it('skips steps when run_if condition is not met', async () => {
        const fakeOpenAI = {} as never;
        const config = buildConfig({
            detection_steps: [
                {
                    id: 'tipo',
                    order: 0,
                    type: 'text',
                    instruction: '¿Es fijo o móvil?',
                    required: true,
                    show_ref_on_uncertain: false,
                },
                {
                    id: 'solo-movil',
                    order: 1,
                    type: 'text',
                    instruction: 'Paso exclusivo para móvil',
                    required: true,
                    show_ref_on_uncertain: false,
                    run_if: {
                        var: 'tipo',
                        operator: 'contains_any',
                        values: ['movil', 'móvil'],
                    },
                },
                {
                    id: 'comun',
                    order: 2,
                    type: 'text',
                    instruction: 'Paso común',
                    required: true,
                    show_ref_on_uncertain: false,
                },
            ],
        });

        const result = await processDetectorTurn({
            userMessage: 'siguiente',
            userImages: [],
            state: buildState({
                currentStepIndex: 1,
                stepAttempts: 0,
                data: { tipo: 'fijo' },
            }),
            config,
            openai: fakeOpenAI,
            model: 'gpt-4o-mini',
        });

        assert.equal(result.ended, false);
        assert.match(result.response, /Paso común/);
    });

    it('matches text steps when keywords were saved as a single comma-separated entry', async () => {
        const fakeOpenAI = {} as never;
        const config = buildConfig({
            detection_steps: [
                {
                    id: 'scaffold_type',
                    order: 0,
                    type: 'text',
                    instruction: 'Indicá si es móvil o fijo.',
                    required: true,
                    show_ref_on_uncertain: false,
                    keywords: ['móvil, movil, fijo, con ruedas, anclado'],
                },
            ],
        });

        const result = await processDetectorTurn({
            userMessage: 'movil',
            userImages: [],
            state: buildState({ stepAttempts: 1 }),
            config,
            openai: fakeOpenAI,
            model: 'gpt-4o-mini',
        });

        assert.equal(result.ended, true);
        assert.equal(result.newState.data.scaffold_type, 'movil');
        assert.doesNotMatch(result.response, /No entendí\./);
    });

    it('supports fuzzy one-edit typo matching for text step keywords', async () => {
        const fakeOpenAI = {} as never;
        const config = buildConfig({
            detection_steps: [
                {
                    id: 'scaffold_type',
                    order: 0,
                    type: 'text',
                    instruction: 'Indicá si es móvil o fijo.',
                    required: true,
                    show_ref_on_uncertain: false,
                    keywords: ['movil'],
                },
            ],
        });

        const result = await processDetectorTurn({
            userMessage: 'mobil',
            userImages: [],
            state: buildState({ stepAttempts: 1 }),
            config,
            openai: fakeOpenAI,
            model: 'gpt-4o-mini',
        });

        assert.equal(result.ended, true);
        assert.equal(result.newState.data.scaffold_type, 'mobil');
        assert.doesNotMatch(result.response, /No entendí\./);
    });

    it('continues after critical when on_critical is continue_flagged', async () => {
        const responses = [
            { severity: 'critical', explanation: 'Problema grave detectado.' },
            { severity: 'CRITICAL', explanation: 'Supervisor confirma gravedad.' },
        ];
        let responseIndex = 0;
        const fakeOpenAI = {
            chat: {
                completions: {
                    create: async () => {
                        const payload = responses[Math.min(responseIndex, responses.length - 1)];
                        responseIndex += 1;
                        return {
                            choices: [{ message: { content: JSON.stringify(payload) } }],
                            usage: { prompt_tokens: 5, completion_tokens: 4 },
                        };
                    },
                },
            },
        } as never;

        const config = buildConfig({
            detection_steps: [
                {
                    id: 'img-critica',
                    order: 0,
                    type: 'image',
                    instruction: 'Subí imagen de verificación.',
                    required: true,
                    show_ref_on_uncertain: false,
                    on_critical: 'continue_flagged',
                    feedback_block: '🛑 {explanation}',
                    criteria: 'Detectar si hay una falla grave.',
                },
                {
                    id: 'paso-2',
                    order: 1,
                    type: 'text',
                    instruction: 'Ahora pasemos al siguiente control.',
                    required: true,
                    show_ref_on_uncertain: false,
                },
            ],
        });

        const result = await processDetectorTurn({
            userMessage: 'adjunto imagen',
            userImages: ['data:image/png;base64,abc'],
            state: buildState({ stepAttempts: 1 }),
            config,
            openai: fakeOpenAI,
            model: 'gpt-4o-mini',
        });

        assert.equal(result.ended, false);
        assert.equal(result.newState.blocked, false);
        assert.equal(result.newState.findings.length, 1);
        assert.equal(result.newState.findings[0]?.severity, 'CRITICAL');
        assert.match(result.response, /Ahora pasemos al siguiente control/);
    });

    it('reclassifies latest non-critical finding when user sends correction intent', async () => {
        const fakeOpenAI = {} as never;
        const config = buildConfig({
            detection_steps: [
                {
                    id: 'img-1',
                    order: 0,
                    type: 'image',
                    instruction: 'Subí detalle del nudo.',
                    required: true,
                    show_ref_on_uncertain: false,
                    feedback_block: '🛑 {explanation}',
                },
                {
                    id: 'txt-2',
                    order: 1,
                    type: 'text',
                    instruction: 'Continuemos con la base.',
                    required: true,
                    show_ref_on_uncertain: false,
                },
            ],
        });

        const state = buildState({
            currentStepIndex: 1,
            stepAttempts: 1,
            findings: [
                {
                    stepId: 'img-1',
                    stepTitle: 'Subí detalle del nudo.',
                    severity: 'OK',
                    explanation: 'La cuña se veía cerrada.',
                },
            ],
        });

        const result = await processDetectorTurn({
            userMessage: 'eso que marcaste OK en realidad está mal',
            userImages: [],
            state,
            config,
            openai: fakeOpenAI,
            model: 'gpt-4o-mini',
        });

        assert.equal(result.ended, true);
        assert.equal(result.newState.blocked, true);
        assert.equal(result.newState.findings[0]?.severity, 'CRITICAL');
        assert.match(result.response, /Reclasificación|corrección/i);
    });

    it('includes only one deterministic visual reference in final report by severity', async () => {
        const fakeOpenAI = {} as never;
        const config = buildConfig({
            detector_options: {
                include_reference_in_final_report: true,
                reference_mode: 'single_priority',
            },
            detection_steps: [
                {
                    id: 'step-warning',
                    order: 0,
                    type: 'image',
                    instruction: 'Paso warning',
                    required: true,
                    show_ref_on_uncertain: false,
                    example_image_url: 'https://example.com/warning.png',
                },
                {
                    id: 'step-critical',
                    order: 1,
                    type: 'image',
                    instruction: 'Paso critical',
                    required: true,
                    show_ref_on_uncertain: false,
                    example_image_url: 'https://example.com/critical.png',
                },
            ],
        });

        const result = await processDetectorTurn({
            userMessage: 'fin',
            userImages: [],
            state: buildState({
                currentStepIndex: 2,
                findings: [
                    {
                        stepId: 'step-warning',
                        stepTitle: 'Paso warning',
                        severity: 'WARNING',
                        explanation: 'Observación.',
                    },
                    {
                        stepId: 'step-critical',
                        stepTitle: 'Paso critical',
                        severity: 'CRITICAL',
                        explanation: 'Falla grave.',
                    },
                ],
            }),
            config,
            openai: fakeOpenAI,
            model: 'gpt-4o-mini',
        });

        assert.equal(result.ended, true);
        assert.match(result.response, /Referencia visual/);
        assert.match(result.response, /critical\.png/);
        assert.doesNotMatch(result.response, /warning\.png/);
    });
});
