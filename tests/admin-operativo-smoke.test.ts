import assert from 'node:assert/strict';
import test from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { AdminPageHeader } from '@/components/admin/admin-page-header';
import { AdminPanel } from '@/components/admin/admin-panel';
import { BotDirectoryCard } from '@/components/admin/bot-directory-card';
import { OrganizationDirectoryCard } from '@/components/admin/organization-directory-card';
import { BotEditorHeader } from '@/components/admin/bot-editor-header';
import { EvaluatorCriteriaSection } from '@/components/admin/evaluator-criteria-section';
import { ExaminerQuestionBankEditor } from '@/components/admin/strategy-fields-examiner-question-bank';
import { ConversationAdminAuditPanels } from '@/components/conversations/conversation-admin-audit-panels';
import { LanguageProvider } from '@/components/providers/i18n-context';
import { StrategyFields } from '@/components/admin/strategy-fields';
import { strategyLabels, strategyPlaceholders } from '@/components/admin/strategy-fields-model';
import type { BotConfig } from '@/lib/schemas/bot-config';

test('AdminPageHeader and AdminPanel render the sober admin shell without throwing', () => {
    const headerMarkup = renderToStaticMarkup(
        createElement(AdminPageHeader, {
            eyebrow: 'Admin',
            title: 'Directorio de bots',
            description: 'Una capa más clara para la misma operación.',
            actions: createElement('button', { type: 'button' }, 'Nuevo bot'),
        })
    );

    const panelMarkup = renderToStaticMarkup(
        createElement(
            AdminPanel,
            {
                title: 'Bots activos',
                description: 'Listado principal',
                actions: createElement('button', { type: 'button' }, 'Filtrar'),
            },
            createElement('div', null, 'Contenido')
        )
    );

    assert.match(headerMarkup, /Directorio de bots/);
    assert.match(headerMarkup, /Nuevo bot/);
    assert.match(panelMarkup, /Bots activos/);
    assert.match(panelMarkup, /Contenido/);
});

test('BotDirectoryCard renders the new sober card with stable actions', () => {
    const markup = renderToStaticMarkup(
        createElement(BotDirectoryCard, {
            bot: {
                id: 'bot-123',
                name: 'Simulador Comercial',
                bot_type: 'SIMULATOR',
                published: true,
                api_key_display: 'sk-live-1234',
            },
            lang: 'es',
            onDelete: () => undefined,
        })
    );

    assert.match(markup, /Simulador Comercial/);
    assert.match(markup, /Publicado/);
    assert.match(markup, /Editar/);
    assert.match(markup, /Chat/);
    assert.match(markup, /bot-123/);
    assert.doesNotMatch(markup, /API key/);
    assert.doesNotMatch(markup, /Clave API/);
});

test('OrganizationDirectoryCard renders a compact organization card without extra metadata blocks', () => {
    const markup = renderToStaticMarkup(
        createElement(OrganizationDirectoryCard, {
            organization: {
                id: 'org-1',
                name: 'Acme Corp',
                logo: null,
                sso_id: 'acme-sso',
                allow_manual_login: false,
                created_at: new Date('2025-01-01T00:00:00.000Z'),
                _count: {
                    members: 12,
                    bots: 3,
                },
            },
            lang: 'es',
            canManageCatalog: true,
            onDelete: () => undefined,
        })
    );

    assert.match(markup, /Acme Corp/);
    assert.match(markup, /SSO/);
    assert.match(markup, /12 miembros/);
    assert.match(markup, /3 bots/);
    assert.match(markup, /Administrar/);
    assert.doesNotMatch(markup, /Creado/);
});

test('BotEditorHeader renders primary editor actions and pending state', () => {
    const markup = renderToStaticMarkup(
        createElement(BotEditorHeader, {
            botId: 'bot-123',
            botType: 'SIMULATOR',
            name: 'Simulador Comercial',
            lang: 'es',
            viewMode: 'STANDARD',
            hasUnsavedChanges: true,
            isSaving: false,
            saveLabel: 'Guardar',
            syncingLabel: 'Sincronizando',
            onToggleViewMode: () => undefined,
            onSave: () => undefined,
        })
    );

    assert.match(markup, /Editor de bot/);
    assert.match(markup, /Cambios pendientes/);
    assert.match(markup, /Modo Pro/);
    assert.match(markup, /QA Lab/);
    assert.match(markup, /Guardar/);
});

test('StrategyFields routes each bot type to the matching editor without changing the editor shell', () => {
    const baseConfig = {} as BotConfig;

    const simulatorMarkup = renderToStaticMarkup(
        createElement(
            LanguageProvider,
            null,
            createElement(StrategyFields, {
                botType: 'SIMULATOR',
                config: baseConfig,
                onChange: () => undefined,
                lang: 'es',
            })
        )
    );

    const examinerMarkup = renderToStaticMarkup(
        createElement(
            LanguageProvider,
            null,
            createElement(StrategyFields, {
                botType: 'EXAMINER',
                config: baseConfig,
                onChange: () => undefined,
                lang: 'es',
            })
        )
    );

    const detectorMarkup = renderToStaticMarkup(
        createElement(
            LanguageProvider,
            null,
            createElement(StrategyFields, {
                botType: 'DETECTOR',
                config: baseConfig,
                onChange: () => undefined,
                lang: 'es',
            })
        )
    );

    const genericMarkup = renderToStaticMarkup(
        createElement(
            LanguageProvider,
            null,
            createElement(StrategyFields, {
                botType: 'GENERIC',
                config: baseConfig,
                onChange: () => undefined,
                lang: 'es',
            })
        )
    );

    assert.match(simulatorMarkup, /Configuración de Simulador/);
    assert.match(examinerMarkup, /Configuración de Examinador/);
    assert.match(examinerMarkup, /Utilidades del banco/);
    assert.match(examinerMarkup, /Listado de preguntas/);
    assert.match(detectorMarkup, /Configuración de Detector/);
    assert.match(genericMarkup, /Reglas de fin/);
    assert.doesNotMatch(genericMarkup, /Identidad y reglas base/);
});

test('ExaminerQuestionBankEditor renders both empty and populated bank states', () => {
    const emptyMarkup = renderToStaticMarkup(
        createElement(ExaminerQuestionBankEditor, {
            questionBank: { topics: [], questions: [] },
            topicOptions: [],
            issues: [],
            issuesByIndex: new Map(),
            onChange: () => undefined,
            labels: strategyLabels.es,
            placeholders: strategyPlaceholders.es,
            lang: 'es',
        })
    );

    const populatedMarkup = renderToStaticMarkup(
        createElement(ExaminerQuestionBankEditor, {
            questionBank: {
                topics: ['Soldadura'],
                questions: [{
                    id: 'q_1',
                    topic: 'Soldadura',
                    type: 'teorica',
                    question: '¿Qué EPP corresponde para soldar?',
                    expected_keys: 'mascara, guantes, ropa ignifuga',
                    is_mandatory: true,
                }],
            },
            topicOptions: ['Soldadura'],
            issues: [],
            issuesByIndex: new Map(),
            onChange: () => undefined,
            labels: strategyLabels.es,
            placeholders: strategyPlaceholders.es,
            lang: 'es',
        })
    );

    assert.match(emptyMarkup, /Todavía no hay preguntas/);
    assert.match(populatedMarkup, /Listado de preguntas/);
    assert.match(populatedMarkup, /¿Qué EPP corresponde para soldar\?/);
    assert.match(populatedMarkup, /Obligatoria/);
});

test('ConversationAdminAuditPanels renders summary, costs, and advanced audit states', () => {
    const emptyMarkup = renderToStaticMarkup(
        createElement(ConversationAdminAuditPanels, {
            lang: 'es',
            sessionId: 'sess-12345678',
            createdAt: '2025-02-10T15:00:00.000Z',
            botName: 'Evaluador Comercial',
            userPrimary: 'maria.gomez',
            userSecondary: 'Totara User ID: 42',
            stats: { count: 12 },
            totalCost: 0.1289,
            chatRows: [],
            ttsRows: [],
            evaluationRows: [],
            metadata: {},
            ragTraces: [],
            triggerTraces: [],
            voiceStats: null,
            formatDateTime: () => '10 feb, 15:00',
        })
    );

    const populatedMarkup = renderToStaticMarkup(
        createElement(ConversationAdminAuditPanels, {
            lang: 'es',
            sessionId: 'sess-12345678',
            createdAt: '2025-02-10T15:00:00.000Z',
            botName: 'Evaluador Comercial',
            userPrimary: 'maria.gomez',
            userSecondary: 'Totara User ID: 42',
            stats: { count: 12 },
            totalCost: 0.1289,
            chatRows: [{
                model: 'gpt-4o',
                tokens_in: 400,
                tokens_out: 250,
                cost_usd: 0.1023,
                messages: 8,
            }],
            ttsRows: [{
                model: 'gpt-4o-mini-tts',
                estimated_tokens: 190,
                cost_usd: 0.0111,
                events: 2,
            }],
            evaluationRows: [{
                model: 'gpt-4.1-mini',
                provider: 'responses',
                tokens_in: 200,
                tokens_out: 90,
                cost_usd: 0.0155,
                runs: 1,
            }],
            metadata: { evaluation: { percentage: 80 } },
            ragTraces: [{
                rag_owner: 'wrapper',
                rag_mode: 'evaluation_only',
                purpose: 'grading',
                evidence_count: 2,
                query: 'procedimiento seguro',
                strategy: 'hybrid',
                top_k: 8,
                latency_ms: 220,
                top_results: [{
                    file_id: 'file-1',
                    filename: 'manual.pdf',
                    score: 0.92,
                    excerpt: 'Usar casco y guantes.',
                }],
            }],
            triggerTraces: [{
                step_id: 'step-1',
                trigger_type: 'similarity',
                layer: 'global',
                matched: true,
                reason: 'threshold met',
                score: 0.88,
                distance: 0.12,
                max_distance: 0.2,
                guardrails_applied: ['safety'],
                model_used: true,
                model_confidence: 0.71,
            }],
            voiceStats: {
                events: 2,
                total_chars: 120,
                total_estimated_tokens: 55,
                total_cost_usd: 0.005,
            },
            formatDateTime: () => '10 feb, 15:00',
        })
    );

    assert.match(emptyMarkup, /Resumen de sesion/);
    assert.match(emptyMarkup, /No hay metadata ni trazas adicionales/);
    assert.match(populatedMarkup, /Costos/);
    assert.match(populatedMarkup, /Trazas RAG/);
    assert.match(populatedMarkup, /Trazas de triggers/);
    assert.match(populatedMarkup, /manual\.pdf/);
});

test('EvaluatorCriteriaSection renders empty and populated criteria states without losing edit anchors', () => {
    const emptyMarkup = renderToStaticMarkup(
        createElement(EvaluatorCriteriaSection, {
            lang: 'es',
            type: 'boolean',
            title: 'Criterios booleanos',
            description: 'Checklist objetivo',
            emptyLabel: 'Todavia no hay criterios booleanos.',
            addLabel: 'Agregar criterio',
            icon: createElement('span', null, 'i'),
            criteria: [],
            titlePlaceholder: 'Ej. Saludo inicial',
            instructionPlaceholder: 'Evalua el saludo.',
            onAdd: () => undefined,
            onRemove: () => undefined,
            onUpdate: () => undefined,
        })
    );

    const populatedMarkup = renderToStaticMarkup(
        createElement(EvaluatorCriteriaSection, {
            lang: 'es',
            type: 'qualitative',
            title: 'Criterios cualitativos',
            description: 'Feedback detallado',
            emptyLabel: 'Todavia no hay criterios cualitativos.',
            addLabel: 'Agregar criterio',
            icon: createElement('span', null, 'i'),
            criteria: [{
                id: 'crit-1',
                title: 'Tono de voz',
                instruction: 'Analiza si el tono fue profesional.',
            }],
            titlePlaceholder: 'Ej. Tono',
            instructionPlaceholder: 'Analiza el tono.',
            onAdd: () => undefined,
            onRemove: () => undefined,
            onUpdate: () => undefined,
        })
    );

    assert.match(emptyMarkup, /Todavia no hay criterios booleanos/);
    assert.match(populatedMarkup, /data-evaluator-criterion-type="qualitative"/);
    assert.match(populatedMarkup, /Tono de voz/);
    assert.match(populatedMarkup, /Instruccion para el modelo/);
});
