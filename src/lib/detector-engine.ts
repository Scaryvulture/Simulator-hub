import type { BotConfig } from './schemas/bot-config';
import OpenAI from 'openai';
import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions';

interface DetectionStep {
    id: string;
    order: number;
    type: 'text' | 'image';
    instruction: string;
    required: boolean;
    example_image_url?: string;
    keywords?: string[];
    criteria?: string;


    // V4 Fields
    feedback_ok?: string;
    feedback_warn?: string;
    feedback_block?: string;
    feedback_uncertain?: string;
    show_ref_on_warn?: boolean;
    show_ref_on_block?: boolean;
    show_ref_on_uncertain?: boolean;
    allow_critical_retry?: boolean;
    on_critical?: 'block' | 'continue_flagged';
    run_if?: {
        var: string;
        operator?: 'equals' | 'contains_any' | 'in';
        value?: string;
        values?: string[];
    };
}

interface DetectorOptions {
    reference_mode?: 'step_flags' | 'single_priority' | 'none';
    include_reference_in_final_report?: boolean;
    correction_reclassify_enabled?: boolean;
    correction_requires_new_image?: boolean;
    correction_patterns?: string[];
    final_verdict_template?: string;
    verdict_labels?: {
        habilitado?: string;
        habilitado_con_observaciones?: string;
        no_habilitado?: string;
        informacion_insuficiente?: string;
    };
}

interface ResolvedDetectorOptions {
    reference_mode: 'step_flags' | 'single_priority' | 'none';
    include_reference_in_final_report: boolean;
    correction_reclassify_enabled: boolean;
    correction_requires_new_image: boolean;
    correction_patterns: string[];
    final_verdict_template?: string;
    verdict_labels: {
        habilitado: string;
        habilitado_con_observaciones: string;
        no_habilitado: string;
        informacion_insuficiente: string;
    };
}

export interface DetectorFinding {
    stepId: string;
    stepTitle: string;
    severity: 'CRITICAL' | 'WARNING' | 'OK' | 'UNCERTAIN';
    explanation: string;
    imageRef?: string;
}

export interface DetectorState {
    currentStepIndex: number;
    findings: DetectorFinding[];
    blocked: boolean;
    turnCount: number;
    stepAttempts: number;
    data: Record<string, string>;
}

export interface ProcessInput {
    userMessage: string;
    userImages: string[];
    state: DetectorState;
    config: BotConfig;
    openai: OpenAI;
    model: string;
}

export interface DetectorTurnResult {
    response: string;
    newState: DetectorState;
    ended: boolean;
    usage?: {
        prompt_tokens: number;
        completion_tokens: number;
    };
}

export interface StepAnalysis {
    passed: boolean;
    severity: 'CRITICAL' | 'WARNING' | 'OK' | 'UNCERTAIN';
    explanation: string;
    usage: {
        prompt_tokens: number;
        completion_tokens: number;
    };
}

function normalizeToken(raw: unknown): string {
    if (typeof raw !== 'string') return '';
    return raw
        .normalize('NFD')
        .replace(/\p{Diacritic}/gu, '')
        .trim()
        .toUpperCase();
}

function normalizeSeverity(raw: unknown): 'CRITICAL' | 'WARNING' | 'OK' | 'UNCERTAIN' {
    const token = normalizeToken(raw);
    if (!token) return 'UNCERTAIN';

    if (
        token === 'CRITICAL'
        || token === 'CRITICO'
        || token === 'CRITICA'
        || token.includes('BLOQ')
        || token.includes('BLOCK')
        || token.includes('ROJO')
    ) {
        return 'CRITICAL';
    }

    if (
        token === 'WARNING'
        || token === 'WARN'
        || token === 'ALERTA'
        || token === 'OBSERVACION'
        || token.includes('AMARILLO')
    ) {
        return 'WARNING';
    }

    if (
        token === 'OK'
        || token === 'PASS'
        || token === 'PASSED'
        || token === 'APROBADO'
        || token.includes('VERDE')
    ) {
        return 'OK';
    }

    if (
        token === 'UNCERTAIN'
        || token === 'UNKNOWN'
        || token === 'NO_CLARO'
        || token.includes('DUD')
    ) {
        return 'UNCERTAIN';
    }

    return 'UNCERTAIN';
}

function normalizeText(raw: unknown): string {
    return String(raw ?? '')
        .normalize('NFD')
        .replace(/\p{Diacritic}/gu, '')
        .trim()
        .toLowerCase();
}

function splitAndNormalizeKeywords(rawKeywords: unknown): string[] {
    if (!Array.isArray(rawKeywords)) return [];
    const seen = new Set<string>();
    const normalized: string[] = [];

    for (const rawKeyword of rawKeywords) {
        if (typeof rawKeyword !== 'string') continue;
        const chunks = rawKeyword.split(/[,\n;|]+/g);
        for (const chunk of chunks) {
            const token = normalizeText(chunk).replace(/\s+/g, ' ').trim();
            if (!token || seen.has(token)) continue;
            seen.add(token);
            normalized.push(token);
        }
    }

    return normalized;
}

function levenshteinDistance(a: string, b: string): number {
    if (a === b) return 0;
    if (!a.length) return b.length;
    if (!b.length) return a.length;

    const rows = a.length + 1;
    const cols = b.length + 1;
    const matrix: number[][] = Array.from({ length: rows }, () => Array<number>(cols).fill(0));

    for (let i = 0; i < rows; i += 1) matrix[i][0] = i;
    for (let j = 0; j < cols; j += 1) matrix[0][j] = j;

    for (let i = 1; i < rows; i += 1) {
        for (let j = 1; j < cols; j += 1) {
            const cost = a[i - 1] === b[j - 1] ? 0 : 1;
            matrix[i][j] = Math.min(
                matrix[i - 1][j] + 1,
                matrix[i][j - 1] + 1,
                matrix[i - 1][j - 1] + cost
            );
        }
    }

    return matrix[rows - 1][cols - 1];
}

function textMatchesKeyword(normalizedMessage: string, normalizedKeyword: string): boolean {
    if (!normalizedMessage || !normalizedKeyword) return false;
    if (normalizedMessage.includes(normalizedKeyword)) return true;
    if (normalizedKeyword.length < 4) return false;

    const messageTokens = normalizedMessage.split(/[^a-z0-9]+/g).filter(Boolean);
    const maxEdits = normalizedKeyword.length >= 10 ? 2 : 1;

    return messageTokens.some((token) => {
        if (token === normalizedKeyword) return true;
        if (Math.abs(token.length - normalizedKeyword.length) > maxEdits) return false;
        return levenshteinDistance(token, normalizedKeyword) <= maxEdits;
    });
}

function resolveDetectorOptions(config: BotConfig): ResolvedDetectorOptions {
    const raw = (((config as unknown as { detector_options?: DetectorOptions }).detector_options) || {}) as DetectorOptions;
    const labels = raw.verdict_labels || {};
    const clean = (value: unknown, fallback: string): string => {
        if (typeof value !== 'string') return fallback;
        const trimmed = value.trim();
        return trimmed || fallback;
    };
    const cleanOptional = (value: unknown): string | undefined => {
        if (typeof value !== 'string') return undefined;
        const trimmed = value.trim();
        return trimmed || undefined;
    };

    return {
        reference_mode: raw.reference_mode || 'single_priority',
        include_reference_in_final_report: raw.include_reference_in_final_report !== false,
        correction_reclassify_enabled: raw.correction_reclassify_enabled !== false,
        correction_requires_new_image: raw.correction_requires_new_image !== false,
        correction_patterns: Array.isArray(raw.correction_patterns) ? raw.correction_patterns : [],
        final_verdict_template: cleanOptional(raw.final_verdict_template),
        verdict_labels: {
            habilitado: clean(labels.habilitado, 'HABILITADO'),
            habilitado_con_observaciones: clean(labels.habilitado_con_observaciones, 'HABILITADO CON OBSERVACIONES'),
            no_habilitado: clean(labels.no_habilitado, 'NO HABILITADO'),
            informacion_insuficiente: clean(labels.informacion_insuficiente, 'INFORMACIÓN INSUFICIENTE'),
        },
    };
}

function renderTemplate(template: string | undefined, fallback: string, explanation: string): string {
    const msg = template || fallback;
    return msg.replace(/{explanation}/g, explanation || '');
}

function renderFinalTemplate(template: string, context: Record<string, string>): string {
    return template.replace(/{([^{}]+)}/g, (fullMatch, rawKey) => {
        const key = String(rawKey || '').trim();
        if (!key) return fullMatch;

        if (Object.prototype.hasOwnProperty.call(context, key)) {
            return context[key] || '';
        }

        const normalizedKey = key.toLowerCase();
        if (Object.prototype.hasOwnProperty.call(context, normalizedKey)) {
            return context[normalizedKey] || '';
        }

        return fullMatch;
    });
}

function shouldShowReference(
    severity: 'CRITICAL' | 'WARNING' | 'OK' | 'UNCERTAIN',
    step: DetectionStep,
    options: ResolvedDetectorOptions
): boolean {
    if (!step.example_image_url) return false;
    if (options.reference_mode === 'none') return false;
    if (severity === 'WARNING') return step.show_ref_on_warn ?? true;
    if (severity === 'CRITICAL') return step.show_ref_on_block ?? true;
    if (severity === 'UNCERTAIN') return step.show_ref_on_uncertain ?? false;
    return false;
}

function isCorrectionIntent(message: string, options: ResolvedDetectorOptions): boolean {
    const normalized = normalizeText(message);
    if (!normalized) return false;

    const defaultSignals = [
        'en realidad',
        'eso que marcaste',
        'eso esta mal',
        'eso está mal',
        'no esta bien',
        'no está bien',
        'te corrijo',
        'correccion',
        'corrección',
        'estaba mal',
    ];

    const customSignals = options.correction_patterns.map((entry) => normalizeText(entry)).filter(Boolean);
    return [...defaultSignals, ...customSignals].some((signal) => normalized.includes(signal));
}

function pickSingleReferenceBySeverity(state: DetectorState, steps: DetectionStep[]): string | undefined {
    const priority: Record<DetectorFinding['severity'], number> = {
        CRITICAL: 0,
        WARNING: 1,
        UNCERTAIN: 2,
        OK: 3,
    };

    const candidates = state.findings
        .map((finding, index) => {
            const step = steps.find((item) => item.id === finding.stepId);
            const url = step?.example_image_url;
            if (!url) return null;
            return {
                index,
                severity: finding.severity,
                url,
            };
        })
        .filter((item): item is { index: number; severity: DetectorFinding['severity']; url: string } => Boolean(item));

    if (candidates.length === 0) return undefined;

    candidates.sort((a, b) => {
        const bySeverity = priority[a.severity] - priority[b.severity];
        if (bySeverity !== 0) return bySeverity;
        return a.index - b.index;
    });

    return candidates[0]?.url;
}

function shouldRunStep(step: DetectionStep, data: Record<string, string>): boolean {
    if (!step.run_if || !step.run_if.var) return true;
    const source = normalizeText(data[step.run_if.var] || '');
    const operator = step.run_if.operator || 'equals';

    if (operator === 'equals') {
        const target = normalizeText(step.run_if.value || '');
        if (!target) return true;
        return source === target;
    }

    if (operator === 'contains_any') {
        const targets = (step.run_if.values || []).map((value) => normalizeText(value)).filter(Boolean);
        if (targets.length === 0) return true;
        return targets.some((target) => source.includes(target));
    }

    if (operator === 'in') {
        const targets = (step.run_if.values || []).map((value) => normalizeText(value)).filter(Boolean);
        if (targets.length === 0) return true;
        return targets.includes(source);
    }

    return true;
}

export async function processDetectorTurn(input: ProcessInput): Promise<DetectorTurnResult> {
    const { userMessage, userImages, state, config, openai, model } = input;
    const newState = { ...state };
    const usage = { prompt_tokens: 0, completion_tokens: 0 };

    const steps = (config.detection_steps || []) as DetectionStep[];
    const detectorOptions = resolveDetectorOptions(config);

    if (steps.length === 0) {
        return {
            response: "Error de configuración: No hay pasos de detección definidos.",
            newState,
            ended: true
        };
    }

    while (
        newState.currentStepIndex < steps.length
        && !shouldRunStep(steps[newState.currentStepIndex], newState.data || {})
    ) {
        newState.currentStepIndex += 1;
        newState.stepAttempts = 0;
    }

    if (newState.currentStepIndex >= steps.length) {
        return {
            response: generateFinalReport(newState, config, steps),
            newState,
            ended: true,
            usage
        };
    }

    const currentStep = steps[newState.currentStepIndex];

    // Automatic reclassification when user corrects a previously accepted finding.
    if (
        detectorOptions.correction_reclassify_enabled
        && userImages.length === 0
        && isCorrectionIntent(userMessage, detectorOptions)
    ) {
        const findingIndex = [...newState.findings]
            .reverse()
            .findIndex((finding) => finding.severity !== 'CRITICAL');
        if (findingIndex >= 0) {
            const realIndex = newState.findings.length - 1 - findingIndex;
            const previousFinding = newState.findings[realIndex];
            const targetStep = steps.find((step) => step.id === previousFinding.stepId);
            const correctionExplanation = userMessage.trim() || 'Corrección del usuario en sitio.';
            const mergedExplanation = previousFinding.explanation
                ? `${previousFinding.explanation} | Corrección del usuario: ${correctionExplanation}`
                : `Corrección del usuario: ${correctionExplanation}`;

            newState.findings[realIndex] = {
                ...previousFinding,
                severity: 'CRITICAL',
                explanation: mergedExplanation,
            };

            const fallback = `🛑 Reclasificación automática por corrección en sitio: ${correctionExplanation}`;
            let correctionMsg = renderTemplate(targetStep?.feedback_block, fallback, mergedExplanation);

            if (targetStep && shouldShowReference('CRITICAL', targetStep, detectorOptions)) {
                correctionMsg += `\n\n![Referencia](${targetStep.example_image_url})`;
            }

            const shouldBlock = (targetStep?.on_critical || 'block') === 'block';
            if (shouldBlock) {
                newState.blocked = true;
                return {
                    response: `${correctionMsg}\n\n${generateFinalReport(newState, config, steps)}`,
                    newState,
                    ended: true,
                    usage,
                };
            }

            if (detectorOptions.correction_requires_new_image) {
                correctionMsg += "\n\nPor favor subí una nueva foto de detalle para validar esta corrección en el mismo componente.";
            }

            return {
                response: correctionMsg,
                newState,
                ended: false,
                usage,
            };
        }
    }

    if (newState.stepAttempts === 0) {
        newState.stepAttempts++;
        const msg = currentStep.instruction;

        return {
            response: msg,
            newState,
            ended: false
        };
    }

    if (currentStep.type === 'text') {
        const normalizedMessage = normalizeText(userMessage);
        let matched = false;

        const normalizedKeywords = splitAndNormalizeKeywords(currentStep.keywords);
        if (normalizedKeywords.length > 0) {
            matched = normalizedKeywords.some((keyword) => textMatchesKeyword(normalizedMessage, keyword));
        } else {
            matched = userMessage.trim().length > 0;
        }

        if (matched) {
            newState.data[currentStep.id] = userMessage;
            newState.currentStepIndex++;
            newState.stepAttempts = 0;
            return processDetectorTurn({ ...input, state: newState });
        } else {
            if (currentStep.required === false) {
                const explanation = "No se pudo validar el paso opcional con la respuesta ingresada.";
                newState.findings.push({
                    stepId: currentStep.id,
                    stepTitle: currentStep.instruction,
                    severity: 'WARNING',
                    explanation,
                });
                newState.currentStepIndex++;
                newState.stepAttempts = 0;
                const nextTurn = await processDetectorTurn({ ...input, state: newState });
                const feedback = renderTemplate(currentStep.feedback_warn, `⚠️ ${explanation}`, explanation);
                return {
                    response: `${feedback}\n\n${nextTurn.response}`,
                    newState: nextTurn.newState,
                    ended: nextTurn.ended,
                    usage: nextTurn.usage,
                };
            }
            return {
                response: `No entendí. ${currentStep.instruction}`,
                newState,
                ended: false
            };
        }
    }

    if (currentStep.type === 'image') {
        if (userImages.length === 0) {
            if (currentStep.required === false) {
                const explanation = "No se adjuntó imagen en un paso opcional.";
                newState.findings.push({
                    stepId: currentStep.id,
                    stepTitle: currentStep.instruction,
                    severity: 'WARNING',
                    explanation,
                });
                let optionalMsg = currentStep.feedback_warn
                    ? currentStep.feedback_warn.replace(/{explanation}/g, explanation)
                    : `⚠️ ${explanation}`;
                const showRef = shouldShowReference('WARNING', currentStep, detectorOptions);
                if (showRef && currentStep.example_image_url) {
                    optionalMsg += `\n\n![Referencia](${currentStep.example_image_url})`;
                }

                newState.currentStepIndex++;
                newState.stepAttempts = 0;
                const nextTurn = await processDetectorTurn({ ...input, state: newState });
                return {
                    response: `${optionalMsg}\n\n${nextTurn.response}`,
                    newState: nextTurn.newState,
                    ended: nextTurn.ended,
                    usage: nextTurn.usage,
                };
            }
            return {
                response: "Por favor subí la imagen requerida para continuar.",
                newState,
                ended: false
            };
        }

        const criteriaPrompt = (currentStep.criteria || '').trim()
            || (config.detection_criteria || '').trim()
            || 'Analizar si la imagen es correcta y segura.';

        const analysis = await analyzeImageStep(
            openai,
            model,
            userImages[0],
            criteriaPrompt,
            config.instructions_prefix
        );
        usage.prompt_tokens += analysis.usage.prompt_tokens;
        usage.completion_tokens += analysis.usage.completion_tokens;
        const isOptionalStep = currentStep.required === false;

        if (analysis.severity === 'UNCERTAIN') {
            if (isOptionalStep) {
                analysis.severity = 'WARNING';
                analysis.explanation = analysis.explanation || "No fue posible validar claramente el paso opcional.";
            } else if (newState.stepAttempts < 3) {
                newState.stepAttempts++;
                let retryMsg = currentStep.feedback_uncertain || "No logro distinguir bien la imagen. Por favor, intenta de nuevo con mejor luz o desde otro ángulo.";
                if (shouldShowReference('UNCERTAIN', currentStep, detectorOptions) && currentStep.example_image_url) {
                    retryMsg += `\n\nReferencia: ![](${currentStep.example_image_url})`;
                }
                return {
                    response: retryMsg,
                    newState,
                    ended: false
                };
            } else {
                analysis.severity = 'WARNING';
                analysis.explanation = "Imagen no clara tras varios intentos. Se marca como observación.";
            }
        }

        if (isOptionalStep && analysis.severity === 'CRITICAL') {
            analysis.severity = 'WARNING';
        }

        newState.findings.push({
            stepId: currentStep.id,
            stepTitle: currentStep.instruction,
            severity: analysis.severity || 'OK',
            explanation: analysis.explanation,
            imageRef: userImages[0]
        });

        let responseMsg = "";
        let showRef = false;
        let shouldBlock = false;

        if (analysis.severity === 'OK') {
            responseMsg = renderTemplate(currentStep.feedback_ok, "", analysis.explanation);
        } else if (analysis.severity === 'WARNING') {
            responseMsg = renderTemplate(currentStep.feedback_warn, `⚠️ Observación: ${analysis.explanation}`, analysis.explanation);
            showRef = shouldShowReference('WARNING', currentStep, detectorOptions);
        } else if (analysis.severity === 'CRITICAL') {
            const stepKey = `critical_retry_${currentStep.id}`;
            const retriesUsed = parseInt(newState.data[stepKey] || '0');
            const maxRetries = 1;

            if (currentStep.allow_critical_retry && retriesUsed < maxRetries) {
                newState.data[stepKey] = (retriesUsed + 1).toString();
                newState.findings.pop();

                responseMsg = renderTemplate(currentStep.feedback_block, `🛑 Bloqueo: ${analysis.explanation}`, analysis.explanation);
                responseMsg += "\n\n(Se permite un reintento. Por favor revisa y vuelve a subir la imagen).";
                showRef = shouldShowReference('CRITICAL', currentStep, detectorOptions);

                return {
                    response: responseMsg + (showRef && currentStep.example_image_url ? `\n\n![Referencia](${currentStep.example_image_url})` : ""),
                    newState,
                    ended: false
                };
            } else {
                responseMsg = renderTemplate(currentStep.feedback_block, `🛑 Bloqueo: ${analysis.explanation}`, analysis.explanation);
                showRef = shouldShowReference('CRITICAL', currentStep, detectorOptions);
                shouldBlock = (currentStep.on_critical || 'block') === 'block';
            }
        }

        if (showRef && currentStep.example_image_url) {
            responseMsg += `\n\n![Referencia](${currentStep.example_image_url})`;
        }

        if (shouldBlock) {
            newState.blocked = true;

            return {
                response: `${responseMsg}\n\n${generateFinalReport(newState, config, steps)}`,
                newState,
                ended: true,
                usage
            };
        }

        newState.currentStepIndex++;
        newState.stepAttempts = 0;

        const nextTurn = await processDetectorTurn({ ...input, state: newState });
        usage.prompt_tokens += nextTurn.usage?.prompt_tokens || 0;
        usage.completion_tokens += nextTurn.usage?.completion_tokens || 0;

        return {
            response: responseMsg ? `${responseMsg}\n\n${nextTurn.response}` : nextTurn.response,
            newState: nextTurn.newState,
            ended: nextTurn.ended,
            usage
        };
    }

    return {
        response: "Error interno: Tipo de paso desconocido.",
        newState,
        ended: true
    };
}

async function analyzeImageStep(
    openai: OpenAI,
    model: string,
    imageUrl: string,
    criteriaPrompt: string,
    botInstructions?: string
): Promise<StepAnalysis> {
    let result = await callVisionModel(openai, model, imageUrl, criteriaPrompt, false, botInstructions);

    if (result.severity === 'CRITICAL') {
        console.log(`[Detector] Critical detected. Running Supervisor Check...`);

        const supervisorPrompt = `ERES UN SUPERVISOR SENIOR DE AUDITORÍA.
        Un inspector junior ha marcado esta imagen como "CRITICA" (Falla Grave) por el siguiente motivo: "${result.explanation}".
        
        TU TAREA: Verificar este hallazgo.
        - Si es claramente una falla de seguridad grave: CONFIRMA "CRITICAL".
        - Si es discutible, menor, o la imagen no es clara: BAJA LA SEVERIDAD A "WARNING".
        - Si está OK: CAMBIA A "OK".
        
        Responde SOLO en JSON: { "severity": "...", "explanation": "..." }`;

        const supervisorResult = await callVisionModel(openai, model, imageUrl, supervisorPrompt, true, botInstructions);

        result = supervisorResult;
        console.log(`[Detector] Supervisor Verdict: ${result.severity}`);
    }

    return {
        passed: result.severity === 'OK',
        severity: normalizeSeverity(result.severity),
        explanation: result.explanation || "Análisis completado",
        usage: {
            prompt_tokens: result.usage.prompt_tokens,
            completion_tokens: result.usage.completion_tokens
        }
    };
}

async function callVisionModel(openai: OpenAI, model: string, imageUrl: string, systemPrompt: string, isSupervisor = false, botInstructions?: string) {
    const modelName = (model || '').trim();
    if (!modelName) {
        throw new Error('Modelo de detector no configurado.');
    }

    const jsonInstruction = `
    Respond ONLY in JSON format with the following structure:
    {
        "severity": "CRITICAL" | "WARNING" | "OK" | "UNCERTAIN",
        "explanation": "Brief explanation of the finding"
    }
    `;

    const languageDirective = "IMPORTANT: Respond in the same language as the user or the provided instructions (mostly Spanish).";
    const contextInstructions = botInstructions ? `\n\nCONTEXT/INSTRUCTIONS:\n${botInstructions}` : "";

    const fullSystemPrompt = `${systemPrompt}${contextInstructions}\n\n${languageDirective}\n${jsonInstruction}`;

    const messages: ChatCompletionMessageParam[] = [
        { role: 'system', content: fullSystemPrompt },
        {
            role: 'user',
            content: [
                { type: "text", text: isSupervisor ? "Verifica esta imagen y el veredicto anterior." : "Analizá esta imagen." },
                { type: "image_url", image_url: { url: imageUrl } }
            ]
        }
    ];

    try {
        const completion = await openai.chat.completions.create({
            model: modelName,
            messages: messages,
            response_format: { type: "json_object" },
            temperature: isSupervisor ? 0.0 : 0.1, // Supervisor is colder/stricter
        });

        const content = JSON.parse(completion.choices[0].message.content || '{}');
        return {
            severity: normalizeSeverity(content.severity),
            explanation: content.explanation || "",
            usage: {
                prompt_tokens: completion.usage?.prompt_tokens || 0,
                completion_tokens: completion.usage?.completion_tokens || 0
            }
        };
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        throw new Error(`Detector vision model failed: ${message}`);
    }
}

function generateFinalReport(state: DetectorState, config: BotConfig, steps: DetectionStep[]): string {
    const options = resolveDetectorOptions(config);
    const hasCritical = state.findings.some((finding) => finding.severity === 'CRITICAL');
    const hasWarning = state.findings.some((finding) => finding.severity === 'WARNING');
    const hasUncertain = state.findings.some((finding) => finding.severity === 'UNCERTAIN');
    const hasOk = state.findings.some((finding) => finding.severity === 'OK');
    const criticalCount = state.findings.filter((finding) => finding.severity === 'CRITICAL').length;
    const warningCount = state.findings.filter((finding) => finding.severity === 'WARNING').length;
    const uncertainCount = state.findings.filter((finding) => finding.severity === 'UNCERTAIN').length;
    const okCount = state.findings.filter((finding) => finding.severity === 'OK').length;

    const verdictKey = (state.blocked || hasCritical)
        ? 'no_habilitado'
        : (state.findings.length === 0 || (hasUncertain && !hasWarning && !hasOk))
            ? 'informacion_insuficiente'
            : (hasWarning || hasUncertain)
                ? 'habilitado_con_observaciones'
                : 'habilitado';
    const veredicto = options.verdict_labels[verdictKey];

    const findingsLines = state.findings.length > 0
        ? state.findings.map((finding) => `- ${finding.stepTitle}: ${finding.severity} — ${finding.explanation}`).join('\n')
        : '- Sin hallazgos registrados.';
    const findingsOkSummary = okCount > 0
        ? state.findings
            .filter((finding) => finding.severity === 'OK')
            .map((finding) => `${finding.stepTitle}: ${finding.explanation}`)
            .join(' | ')
        : 'Sin verificaciones en estado OK.';
    const findingsNotOkSummary = (criticalCount + warningCount + uncertainCount) > 0
        ? state.findings
            .filter((finding) => finding.severity !== 'OK')
            .map((finding) => `${finding.stepTitle}: ${finding.severity} (${finding.explanation})`)
            .join(' | ')
        : 'Sin hallazgos con observaciones o bloqueos.';

    const sortedDataEntries = Object.entries(state.data || {}).sort(([a], [b]) => a.localeCompare(b));
    const dataLines = sortedDataEntries.length > 0
        ? sortedDataEntries.map(([key, value]) => `- ${key}: ${value}`).join('\n')
        : '- Sin datos adicionales.';

    const recommendation = verdictKey === 'no_habilitado'
        ? 'No habilitar la tarea hasta corregir los hallazgos críticos y repetir la validación.'
        : (verdictKey === 'habilitado_con_observaciones'
            ? 'Corregir las observaciones antes de continuar y dejar trazabilidad de las acciones tomadas.'
            : (verdictKey === 'informacion_insuficiente'
                ? 'Solicitar nuevas fotos más nítidas y repetir la verificación antes de decidir habilitación.'
                : 'Condición conforme. Se puede avanzar manteniendo controles y monitoreo operativo.'));
    const nextAction = verdictKey === 'no_habilitado'
        ? 'detener la habilitación, corregir los hallazgos críticos y repetir la validación'
        : (verdictKey === 'habilitado_con_observaciones'
            ? 'corregir las observaciones antes de continuar y dejar trazabilidad de las acciones tomadas'
            : (verdictKey === 'informacion_insuficiente'
                ? 'solicitar nuevas fotos más nítidas y repetir la verificación antes de decidir habilitación'
                : 'avanzar manteniendo controles y monitoreo operativo'));

    const globalSeverity = state.blocked || hasCritical
        ? 'CRITICAL'
        : hasWarning
            ? 'WARNING'
            : hasUncertain
                ? 'UNCERTAIN'
                : 'OK';
    const templateContext: Record<string, string> = {
        veredicto,
        verdict: veredicto,
        verdict_key: verdictKey,
        severidad_global: globalSeverity,
        global_severity: globalSeverity,
        hallazgos: findingsLines,
        findings: findingsLines,
        hallazgos_total: String(state.findings.length),
        findings_total: String(state.findings.length),
        hallazgos_critical: String(criticalCount),
        findings_critical: String(criticalCount),
        hallazgos_warning: String(warningCount),
        findings_warning: String(warningCount),
        hallazgos_uncertain: String(uncertainCount),
        findings_uncertain: String(uncertainCount),
        hallazgos_ok: String(okCount),
        findings_ok: String(okCount),
        hallazgos_ok_detalle: findingsOkSummary,
        findings_ok_detail: findingsOkSummary,
        hallazgos_no_ok: findingsNotOkSummary,
        hallazgos_no_ok_detalle: findingsNotOkSummary,
        findings_not_ok: findingsNotOkSummary,
        findings_not_ok_detail: findingsNotOkSummary,
        datos_relevados: dataLines,
        data: dataLines,
        proximo_paso: recommendation,
        recomendacion: recommendation,
        recommendation,
        proxima_accion: nextAction,
        next_action: nextAction,
        next_step: recommendation,
    };
    for (const [key, value] of sortedDataEntries) {
        templateContext[`data.${key}`] = value;
        templateContext[`var.${key}`] = value;
    }

    const referenceUrl = (options.include_reference_in_final_report && options.reference_mode !== 'none')
        ? pickSingleReferenceBySeverity(state, steps)
        : undefined;
    if (referenceUrl) {
        templateContext.referencia_visual = referenceUrl;
        templateContext.visual_reference = referenceUrl;
    }

    const defaultFinalSummaryTemplate = 'Luego de verificar tu andamio, el veredicto es {veredicto}.';
    if (options.final_verdict_template) {
        const renderedCustomTemplate = renderFinalTemplate(options.final_verdict_template, templateContext).trim();
        return renderedCustomTemplate || renderFinalTemplate(defaultFinalSummaryTemplate, templateContext);
    }
    const finalSummary = renderFinalTemplate(defaultFinalSummaryTemplate, templateContext);

    const reportLines = [
        '**REPORTE FINAL DE DETECCIÓN**',
        finalSummary,
        '',
        `**Veredicto:** ${veredicto}`,
        `**Severidad global:** ${globalSeverity}`,
        '',
        '**Hallazgos:**',
        findingsLines,
        '',
        '**Datos relevados:**',
        dataLines,
        '',
        `**Próximo paso:** ${recommendation}`,
    ];

    if (referenceUrl) {
        reportLines.push('', 'Referencia visual (para ubicar el componente):', referenceUrl);
    }

    return reportLines.join('\n');
}
