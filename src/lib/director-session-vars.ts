import { safeRegex } from './safe-regex';
import type { FlowState } from './flow-engine';
import type { BotConfig } from './schemas/bot-config';

export type SessionVars = FlowState['vars'];

type SessionVarCandidate = {
    type?: 'random' | 'fixed' | 'computed' | 'random_by';
    options?: unknown[];
    value?: unknown;
    formula?: string;
    values?: unknown[];
    source_var?: string;
    mapping?: Record<string, unknown>;
};

type SessionVarUpdateTags = {
    openTag: string;
    closeTag: string;
};

export function generateSessionVars(
    sessionVarsConfig: unknown,
    variableRules?: Record<string, { depends_on: string; mappings: Record<string, string[]> }>
): SessionVars {
    const vars: SessionVars = {};

    if (!sessionVarsConfig || typeof sessionVarsConfig !== 'object') return vars;
    const sessionVarsObject = sessionVarsConfig as Record<string, unknown>;

    for (const [key, def] of Object.entries(sessionVarsObject)) {
        const config = (def && typeof def === 'object') ? def as SessionVarCandidate : null;

        if (config?.type) {
            if (config.type === 'random' && Array.isArray(config.options) && config.options.length > 0) {
                vars[key] = config.options[Math.floor(Math.random() * config.options.length)] as SessionVars[string];
            } else if (config.type === 'fixed') {
                vars[key] = (config.value ?? null) as SessionVars[string];
            } else if (config.type === 'computed') {
                const formula = config.formula || '';
                if (formula && formula.startsWith('random(')) {
                    const match = formula.match(/random\((\d+),\s*(\d+)\)/);
                    if (match) {
                        const min = parseInt(match[1], 10);
                        const max = parseInt(match[2], 10);
                        vars[key] = Math.floor(Math.random() * (max - min + 1)) + min;
                    } else {
                        vars[key] = formula;
                    }
                } else {
                    vars[key] = formula;
                }
            } else if (config.type === 'random_by') {
                vars[key] = null;
            }
        } else if (Array.isArray(config?.values) && config.values.length > 0) {
            vars[key] = config.values[Math.floor(Math.random() * config.values.length)] as SessionVars[string];
        } else if (Array.isArray(def) && def.length > 0) {
            vars[key] = def[Math.floor(Math.random() * def.length)] as SessionVars[string];
        } else if (typeof def === 'string' || typeof def === 'number' || typeof def === 'boolean') {
            vars[key] = def;
        }
    }

    if (variableRules) {
        for (const [key, rule] of Object.entries(variableRules)) {
            const dependsOnValue = vars[rule.depends_on];
            if (!dependsOnValue) continue;

            for (const [pattern, possibleValues] of Object.entries(rule.mappings)) {
                const regex = safeRegex(pattern);
                if (regex && regex.test(String(dependsOnValue))) {
                    vars[key] = possibleValues[Math.floor(Math.random() * possibleValues.length)];
                    break;
                }
            }
        }
    }

    for (const [key, def] of Object.entries(sessionVarsObject)) {
        const config = (def && typeof def === 'object') ? def as SessionVarCandidate : null;
        if (
            config
            && config.type === 'random_by'
            && typeof config.source_var === 'string'
            && config.mapping
        ) {
            const mapping = config.mapping;
            const sourceValue = vars[config.source_var];
            if (sourceValue !== undefined && sourceValue !== null && sourceValue !== '') {
                const options = mapping[String(sourceValue)];

                if (options && Array.isArray(options) && options.length > 0) {
                    vars[key] = (options as Array<SessionVars[string]>)[Math.floor(Math.random() * options.length)];
                }
            }
        }
    }

    return vars;
}

export function interpolateVars(template: string, vars: SessionVars): string {
    return template.replace(/\{(\w+)\}/g, (match, varName) => {
        return vars[varName] !== undefined ? String(vars[varName]) : match;
    });
}

export function isSessionVarPrimitive(value: unknown): value is string | number | boolean | null {
    return value === null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean';
}

export function extractSessionVarUpdates(
    content: string,
    currentVars: SessionVars,
    tags: SessionVarUpdateTags
): { cleanContent: string; updates: SessionVars } {
    if (!content) {
        return { cleanContent: '', updates: {} };
    }

    const updates: SessionVars = {};
    const allowedKeys = new Set(Object.keys(currentVars || {}));
    const escapedOpen = tags.openTag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const escapedClose = tags.closeTag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const blockRegex = new RegExp(`${escapedOpen}\\s*([\\s\\S]*?)\\s*${escapedClose}`, 'gi');

    let match: RegExpExecArray | null = null;
    while ((match = blockRegex.exec(content)) !== null) {
        const rawPayload = (match[1] || '').trim();
        if (!rawPayload) continue;

        try {
            const parsed = JSON.parse(rawPayload);
            if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) continue;

            for (const [key, value] of Object.entries(parsed)) {
                if (!allowedKeys.has(key)) continue;
                if (!isSessionVarPrimitive(value)) continue;
                updates[key] = value;
            }
        } catch {
            continue;
        }
    }

    const cleanContent = content
        .replace(blockRegex, '')
        .replace(/\n{3,}/g, '\n\n')
        .trim();

    return { cleanContent, updates };
}

export function withSessionVarUpdateProtocol(
    instructions: string,
    vars: SessionVars,
    tags: SessionVarUpdateTags
): string {
    const varNames = Object.keys(vars || {});
    if (varNames.length === 0) return instructions;

    return [
        instructions,
        '',
        '[CONTROL DE VARIABLES DE SESION]',
        'Manten consistencia de variables en toda la conversacion.',
        'Solo cambia una variable cuando el usuario realmente te convenza con argumentos.',
        `Variables permitidas para actualizar: ${varNames.join(', ')}.`,
        'Si actualizas variables, agrega al FINAL un bloque exacto como este:',
        `${tags.openTag}{"variable":"nuevo_valor"}${tags.closeTag}`,
        'Solo usa JSON valido con claves permitidas y valores primitivos (string, number, boolean o null).',
        'No expliques ese bloque ni lo menciones al usuario.',
    ].join('\n');
}

export function promptSessionVars(vars: SessionVars): SessionVars {
    const source = vars || {};
    const next: SessionVars = {};

    for (const [key, value] of Object.entries(source)) {
        if (value === null || value === undefined) continue;
        if (typeof value === 'string' && value.trim() === '') continue;
        next[key] = value;
    }

    return next;
}

export function normalizeIntentText(input: string): string {
    return (input || '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^\p{L}\p{N}\s]/gu, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

export function matchesIntentPhrases(normalizedMessage: string, phrases: string[]): boolean {
    if (!normalizedMessage || phrases.length === 0) return false;
    const paddedMessage = ` ${normalizedMessage} `;
    return phrases.some((rawPhrase) => {
        const normalizedPhrase = normalizeIntentText(rawPhrase || '');
        if (!normalizedPhrase) return false;
        return normalizedMessage === normalizedPhrase || paddedMessage.includes(` ${normalizedPhrase} `);
    });
}

export function getGenericGoodbyeMessage(config: BotConfig): string {
    if (typeof config.goodbye_message === 'string' && config.goodbye_message.trim()) {
        return config.goodbye_message.trim();
    }
    return '';
}

export function getGenericClosingMessage(config: BotConfig): string {
    if (typeof config.closing_message === 'string' && config.closing_message.trim()) {
        return config.closing_message.trim();
    }
    return '';
}

export function detectGenericTerminalIntent(message: string, config: BotConfig): 'GOODBYE' | 'CLOSING' | null {
    const raw = (message || '').trim();
    if (!raw) return null;
    const genericInteraction = (config.generic_interaction && typeof config.generic_interaction === 'object')
        ? config.generic_interaction
        : undefined;
    const ignoreQuestionMessages = genericInteraction?.ignore_question_messages !== false;
    if (ignoreQuestionMessages && /[?¿]/.test(raw)) return null;
    const normalized = normalizeIntentText(raw);
    if (!normalized) return null;

    const goodbyeSignals = Array.isArray(genericInteraction?.goodbye_intent_phrases)
        ? genericInteraction.goodbye_intent_phrases
        : [];
    const closingSignals = Array.isArray(genericInteraction?.closing_intent_phrases)
        ? genericInteraction.closing_intent_phrases
        : [];

    if (matchesIntentPhrases(normalized, goodbyeSignals)) {
        return 'GOODBYE';
    }

    if (matchesIntentPhrases(normalized, closingSignals)) {
        return 'CLOSING';
    }

    return null;
}
