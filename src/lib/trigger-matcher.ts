import { parseCSV } from './utils';

export type PhraseScopeMode = 'full_message' | 'tail_only';
export type PhraseExactMode = 'token_boundary' | 'suffix' | 'substring';
export type PhraseModelFallbackMode = 'off' | 'ambiguous_only';

export interface PhraseListScopeConfig {
    mode?: PhraseScopeMode;
    end_window_chars?: number;
    end_window_tokens?: number;
}

export interface PhraseListFuzzyConfig {
    enabled?: boolean;
    min_similarity?: number;
    max_edits_short?: number;
    max_edits_medium?: number;
    max_edits_long?: number;
    gray_zone_min_similarity?: number;
}

export interface PhraseListGuardrailsConfig {
    block_on_question?: boolean;
    block_on_continuation_words?: boolean;
    continuation_words?: string[];
    allow_only_in_flow_states?: string[];
}

export interface PhraseListModelFallbackConfig {
    mode?: PhraseModelFallbackMode;
    min_confidence?: number;
}

export interface PhraseListConfig {
    phrases: string[];
    negative_phrases?: string[];
    scope?: PhraseListScopeConfig;
    exact_mode?: PhraseExactMode;
    fuzzy?: PhraseListFuzzyConfig;
    guardrails?: PhraseListGuardrailsConfig;
    model_fallback?: PhraseListModelFallbackConfig;
    intent_name?: string;
}

export interface PhraseMatchContext {
    raw_message: string;
    current_flow_step?: string;
    trigger_id?: string;
}

export interface PhraseModelFallbackInput {
    trigger_id: string;
    intent_name: string;
    scope_mode: PhraseScopeMode;
    scoped_text: string;
    phrases: string[];
    guardrail_flags: {
        has_question: boolean;
        has_continuation: boolean;
        flow_state_allowed: boolean;
    };
}

export interface PhraseModelFallbackResult {
    match: boolean;
    confidence?: number;
}

export type PhraseModelFallbackResolver = (input: PhraseModelFallbackInput) => Promise<PhraseModelFallbackResult>;

export interface PhraseMatchResult {
    matched: boolean;
    layer: 'exact' | 'fuzzy' | 'model' | 'none';
    candidate?: string;
    score?: number;
    distance?: number;
    max_distance?: number;
    guardrails_applied: string[];
    model_used: boolean;
    model_confidence?: number;
    ambiguous: boolean;
    reason?: string;
    scoped_text: string;
    scoped_text_normalized: string;
}

const DEFAULT_SCOPE: Required<PhraseListScopeConfig> = {
    mode: 'full_message',
    end_window_chars: 90,
    end_window_tokens: 10,
};

const DEFAULT_FUZZY: Required<PhraseListFuzzyConfig> = {
    enabled: true,
    min_similarity: 0.84,
    max_edits_short: 1,
    max_edits_medium: 2,
    max_edits_long: 3,
    gray_zone_min_similarity: 0.7,
};

const DEFAULT_GUARDRAILS: Required<Omit<PhraseListGuardrailsConfig, 'allow_only_in_flow_states'>> & {
    allow_only_in_flow_states?: string[];
} = {
    block_on_question: false,
    block_on_continuation_words: false,
    continuation_words: [
        'pero',
        'ademas',
        'además',
        'otra cosa',
        'igual',
        'tambien',
        'también',
        'despues',
        'después',
        'y otra',
        'y tambien',
        'y también',
    ],
};

const DEFAULT_MODEL_FALLBACK: Required<PhraseListModelFallbackConfig> = {
    mode: 'off',
    min_confidence: 0.75,
};

const MAX_FUZZY_SCOPE_CHARS = 500;
const MAX_FUZZY_SCOPE_TOKENS = 90;
const MAX_FUZZY_CANDIDATES = 220;
const MAX_FUZZY_PHRASE_CHARS = 120;

interface ScopedText {
    raw: string;
    normalized: string;
}

interface CandidateResult {
    phrase: string;
    phraseLength: number;
    score: number;
    distance: number;
    maxDistance: number;
}

function normalizeText(input: string, reduceRepeated = true): string {
    const normalized = input
        .toLocaleLowerCase('es')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^\p{L}\p{N}\s]/gu, ' ')
        .replace(/\s+/g, ' ')
        .trim();

    if (!reduceRepeated) return normalized;

    // Keep up to two repeated chars to reduce "holaaaa" style noise.
    return normalized.replace(/([a-z0-9])\1{2,}/g, '$1$1');
}

function normalizePhraseList(values: string[]): string[] {
    return values
        .map((value) => normalizeText(value))
        .filter((value) => value.length > 0);
}

function applyScope(rawMessage: string, scope: Required<PhraseListScopeConfig>): ScopedText {
    const raw = rawMessage || '';
    if (scope.mode !== 'tail_only') {
        return {
            raw,
            normalized: normalizeText(raw),
        };
    }

    const fromChars = Math.max(raw.length - Math.max(1, scope.end_window_chars), 0);
    let fromTokens = 0;
    if (scope.end_window_tokens > 0) {
        const tokens = raw.split(/\s+/g);
        const tailTokens = tokens.slice(-scope.end_window_tokens);
        const tailStr = tailTokens.join(' ');
        fromTokens = Math.max(raw.length - tailStr.length, 0);
    }

    const start = Math.max(fromChars, fromTokens);
    const slicedRaw = raw.slice(start);
    return {
        raw: slicedRaw,
        normalized: normalizeText(slicedRaw),
    };
}

function hasTokenBoundaryMatch(haystack: string, needle: string): boolean {
    if (!haystack || !needle) return false;
    const hayTokens = haystack.split(' ');
    const needleTokens = needle.split(' ');
    if (needleTokens.length === 0 || hayTokens.length < needleTokens.length) return false;

    for (let idx = 0; idx <= hayTokens.length - needleTokens.length; idx += 1) {
        let allMatch = true;
        for (let off = 0; off < needleTokens.length; off += 1) {
            if (hayTokens[idx + off] !== needleTokens[off]) {
                allMatch = false;
                break;
            }
        }
        if (allMatch) return true;
    }
    return false;
}

function hasSuffixMatch(haystack: string, needle: string): boolean {
    if (!haystack || !needle) return false;
    const hayTokens = haystack.split(' ');
    const needleTokens = needle.split(' ');
    if (hayTokens.length < needleTokens.length) return false;
    const tail = hayTokens.slice(-needleTokens.length);
    return tail.join(' ') === needleTokens.join(' ');
}

function hasExactMatch(haystack: string, phrase: string, mode: PhraseExactMode): boolean {
    if (!haystack || !phrase) return false;
    if (mode === 'substring') return haystack.includes(phrase);
    if (mode === 'suffix') return hasSuffixMatch(haystack, phrase);
    return hasTokenBoundaryMatch(haystack, phrase);
}

function buildNgrams(
    tokens: string[],
    minLen: number,
    maxLen: number,
    maxCandidates = Number.POSITIVE_INFINITY
): string[] {
    const grams: string[] = [];
    const safeMin = Math.max(1, minLen);
    const safeMax = Math.max(safeMin, maxLen);
    for (let length = safeMin; length <= safeMax; length += 1) {
        if (tokens.length < length) continue;
        for (let i = 0; i <= tokens.length - length; i += 1) {
            grams.push(tokens.slice(i, i + length).join(' '));
            if (grams.length >= maxCandidates) return grams;
        }
    }
    return grams;
}

function maxEditsForLength(
    length: number,
    fuzzyConfig: Required<PhraseListFuzzyConfig>
): number {
    if (length <= 3) return 0;
    if (length <= 6) return fuzzyConfig.max_edits_short;
    if (length <= 12) return fuzzyConfig.max_edits_medium;
    if (length <= 20) return fuzzyConfig.max_edits_long;
    // For long strings rely more on similarity.
    return fuzzyConfig.max_edits_long + 1;
}

function damerauLevenshteinCutoff(a: string, b: string, maxDistance: number): number {
    const aLen = a.length;
    const bLen = b.length;

    if (Math.abs(aLen - bLen) > maxDistance) return maxDistance + 1;
    if (a === b) return 0;
    if (aLen === 0) return bLen <= maxDistance ? bLen : maxDistance + 1;
    if (bLen === 0) return aLen <= maxDistance ? aLen : maxDistance + 1;

    let prevPrev: number[] = new Array(bLen + 1).fill(0);
    let prev: number[] = new Array(bLen + 1).fill(0);
    let curr: number[] = new Array(bLen + 1).fill(0);

    for (let j = 0; j <= bLen; j += 1) prev[j] = j;

    for (let i = 1; i <= aLen; i += 1) {
        curr[0] = i;
        let rowMin = curr[0];

        for (let j = 1; j <= bLen; j += 1) {
            const cost = a.charCodeAt(i - 1) === b.charCodeAt(j - 1) ? 0 : 1;

            let value = Math.min(
                prev[j] + 1,
                curr[j - 1] + 1,
                prev[j - 1] + cost
            );

            if (
                i > 1
                && j > 1
                && a.charCodeAt(i - 1) === b.charCodeAt(j - 2)
                && a.charCodeAt(i - 2) === b.charCodeAt(j - 1)
            ) {
                value = Math.min(value, prevPrev[j - 2] + 1);
            }

            curr[j] = value;
            if (value < rowMin) rowMin = value;
        }

        if (rowMin > maxDistance) return maxDistance + 1;

        prevPrev = prev;
        prev = curr;
        curr = new Array(bLen + 1).fill(0);
    }

    return prev[bLen];
}

function similarityFromDistance(a: string, b: string, distance: number): number {
    const base = Math.max(a.length, b.length);
    if (base === 0) return 1;
    return Math.max(0, 1 - (distance / base));
}

function hasQuestion(rawText: string): boolean {
    const trimmed = rawText.trim();
    return trimmed.includes('?') || trimmed.includes('¿') || trimmed.endsWith('?');
}

function hasContinuationWord(normalizedText: string, continuationWords: string[]): boolean {
    if (!normalizedText) return false;
    const padded = ` ${normalizedText} `;
    return continuationWords.some((word) => {
        const normalizedWord = normalizeText(word, false);
        if (!normalizedWord) return false;
        return padded.includes(` ${normalizedWord} `);
    });
}

function isFlowStateAllowed(
    currentStep: string | undefined,
    allowedStates?: string[]
): boolean {
    if (!allowedStates || allowedStates.length === 0) return true;
    if (!currentStep) return false;
    return allowedStates.includes(currentStep);
}

function trimScopeForFuzzy(scopedNormalized: string): string {
    const byChars = scopedNormalized.slice(-MAX_FUZZY_SCOPE_CHARS);
    if (!byChars) return '';
    const tokens = byChars.split(' ').filter(Boolean);
    if (tokens.length <= MAX_FUZZY_SCOPE_TOKENS) return byChars;
    return tokens.slice(-MAX_FUZZY_SCOPE_TOKENS).join(' ');
}

function fuzzyBestCandidate(
    scopedNormalized: string,
    phrase: string,
    fuzzyConfig: Required<PhraseListFuzzyConfig>
): CandidateResult | null {
    if (
        !scopedNormalized
        || !phrase
        || phrase.length <= 3
        || phrase.length > MAX_FUZZY_PHRASE_CHARS
    ) return null;

    // Keep fuzzy matching bounded even if the user sends very long inputs.
    const fuzzyScope = trimScopeForFuzzy(scopedNormalized);
    if (!fuzzyScope) return null;

    const scopeTokens = fuzzyScope.split(' ');
    const phraseTokens = phrase.split(' ');
    const tokenCount = phraseTokens.length;
    const candidates = buildNgrams(
        scopeTokens,
        Math.max(1, tokenCount - 1),
        tokenCount + 1,
        MAX_FUZZY_CANDIDATES
    );

    let best: CandidateResult | null = null;
    const phraseLength = phrase.length;
    const allowedRatioMin = 0.7;
    const allowedRatioMax = 1.4;
    const maxDistance = maxEditsForLength(phraseLength, fuzzyConfig);

    for (const candidate of candidates) {
        if (!candidate || candidate.length <= 3) continue;
        const ratio = candidate.length / phraseLength;
        if (ratio < allowedRatioMin || ratio > allowedRatioMax) continue;

        const phraseHead = phrase[0];
        const candidateHead = candidate[0];
        if (phraseHead && candidateHead && phraseHead !== candidateHead) continue;

        const distance = damerauLevenshteinCutoff(phrase, candidate, maxDistance);
        if (distance > maxDistance) continue;

        const score = similarityFromDistance(phrase, candidate, distance);
        if (!best || score > best.score || (score === best.score && distance < best.distance)) {
            best = {
                phrase,
                phraseLength,
                score,
                distance,
                maxDistance,
            };
        }
    }

    return best;
}

export async function evaluatePhraseListTrigger(
    config: PhraseListConfig,
    context: PhraseMatchContext,
    modelFallback?: PhraseModelFallbackResolver
): Promise<PhraseMatchResult> {
    const scope = { ...DEFAULT_SCOPE, ...(config.scope || {}) };
    const fuzzyConfig = { ...DEFAULT_FUZZY, ...(config.fuzzy || {}) };
    const guardrails = { ...DEFAULT_GUARDRAILS, ...(config.guardrails || {}) };
    const modelFallbackCfg = { ...DEFAULT_MODEL_FALLBACK, ...(config.model_fallback || {}) };
    const exactMode = config.exact_mode || 'token_boundary';

    const scoped = applyScope(context.raw_message, scope);
    const normalizedPhrases = normalizePhraseList(config.phrases || []);
    const normalizedNegatives = normalizePhraseList(config.negative_phrases || []);

    if (normalizedPhrases.length === 0) {
        return {
            matched: false,
            layer: 'none',
            guardrails_applied: [],
            model_used: false,
            ambiguous: false,
            reason: 'no_phrases_configured',
            scoped_text: scoped.raw,
            scoped_text_normalized: scoped.normalized,
        };
    }

    const guardrailReasons: string[] = [];
    const hasQuestionFlag = hasQuestion(scoped.raw);
    const hasContinuationFlag = hasContinuationWord(scoped.normalized, guardrails.continuation_words);
    const flowAllowed = isFlowStateAllowed(context.current_flow_step, guardrails.allow_only_in_flow_states);

    if (guardrails.block_on_question && hasQuestionFlag) guardrailReasons.push('question_detected');
    if (guardrails.block_on_continuation_words && hasContinuationFlag) guardrailReasons.push('continuation_detected');
    if (!flowAllowed) guardrailReasons.push('flow_state_blocked');

    for (const negative of normalizedNegatives) {
        if (hasExactMatch(scoped.normalized, negative, exactMode)) {
            guardrailReasons.push(`negative_phrase:${negative}`);
            break;
        }
    }

    // Exact pass
    for (const phrase of normalizedPhrases) {
        if (hasExactMatch(scoped.normalized, phrase, exactMode)) {
            if (guardrailReasons.length > 0) {
                return {
                    matched: false,
                    layer: 'none',
                    candidate: phrase,
                    guardrails_applied: guardrailReasons,
                    model_used: false,
                    ambiguous: true,
                    reason: 'exact_match_blocked_by_guardrails',
                    scoped_text: scoped.raw,
                    scoped_text_normalized: scoped.normalized,
                };
            }
            return {
                matched: true,
                layer: 'exact',
                candidate: phrase,
                guardrails_applied: [],
                model_used: false,
                ambiguous: false,
                scoped_text: scoped.raw,
                scoped_text_normalized: scoped.normalized,
            };
        }
    }

    // Fuzzy pass
    let fuzzyBest: CandidateResult | null = null;
    let fuzzyAmbiguous = false;
    if (fuzzyConfig.enabled) {
        for (const phrase of normalizedPhrases) {
            const candidate = fuzzyBestCandidate(scoped.normalized, phrase, fuzzyConfig);
            if (!candidate) continue;

            const isLong = phrase.length > 20;
            const strongMatch = isLong
                ? (candidate.score >= fuzzyConfig.min_similarity)
                : (candidate.distance <= candidate.maxDistance);

            if (strongMatch) {
                if (!fuzzyBest || candidate.score > fuzzyBest.score) {
                    fuzzyBest = candidate;
                }
                continue;
            }

            if (candidate.score >= fuzzyConfig.gray_zone_min_similarity) {
                fuzzyAmbiguous = true;
                if (!fuzzyBest || candidate.score > fuzzyBest.score) {
                    fuzzyBest = candidate;
                }
            }
        }
    }

    if (fuzzyBest && guardrailReasons.length === 0) {
        const isStrongByScore = fuzzyBest.score >= fuzzyConfig.min_similarity;
        const isStrongByDistance = fuzzyBest.distance <= fuzzyBest.maxDistance;
        const isLongPhrase = fuzzyBest.phraseLength > 20;
        const strongMatch = isLongPhrase ? isStrongByScore : (isStrongByScore || isStrongByDistance);
        if (strongMatch) {
            return {
                matched: true,
                layer: 'fuzzy',
                candidate: fuzzyBest.phrase,
                score: fuzzyBest.score,
                distance: fuzzyBest.distance,
                max_distance: fuzzyBest.maxDistance,
                guardrails_applied: [],
                model_used: false,
                ambiguous: false,
                scoped_text: scoped.raw,
                scoped_text_normalized: scoped.normalized,
            };
        }
    }

    if (guardrailReasons.length > 0) {
        return {
            matched: false,
            layer: 'none',
            candidate: fuzzyBest?.phrase,
            score: fuzzyBest?.score,
            distance: fuzzyBest?.distance,
            max_distance: fuzzyBest?.maxDistance,
            guardrails_applied: guardrailReasons,
            model_used: false,
            ambiguous: fuzzyAmbiguous || Boolean(fuzzyBest),
            reason: 'blocked_by_guardrails',
            scoped_text: scoped.raw,
            scoped_text_normalized: scoped.normalized,
        };
    }

    const shouldUseFallback = modelFallback
        && modelFallbackCfg.mode === 'ambiguous_only'
        && (fuzzyAmbiguous || Boolean(fuzzyBest));

    if (shouldUseFallback && modelFallback) {
        const modelResult = await modelFallback({
            trigger_id: context.trigger_id || 'phrase_list',
            intent_name: config.intent_name || context.trigger_id || 'phrase_list',
            scope_mode: scope.mode,
            scoped_text: scoped.raw,
            phrases: config.phrases || [],
            guardrail_flags: {
                has_question: hasQuestionFlag,
                has_continuation: hasContinuationFlag,
                flow_state_allowed: flowAllowed,
            },
        });

        const confidence = Number(modelResult.confidence || 0);
        if (modelResult.match && confidence >= modelFallbackCfg.min_confidence) {
            return {
                matched: true,
                layer: 'model',
                candidate: fuzzyBest?.phrase,
                score: fuzzyBest?.score,
                distance: fuzzyBest?.distance,
                max_distance: fuzzyBest?.maxDistance,
                guardrails_applied: [],
                model_used: true,
                model_confidence: confidence,
                ambiguous: false,
                scoped_text: scoped.raw,
                scoped_text_normalized: scoped.normalized,
            };
        }

        return {
            matched: false,
            layer: 'none',
            candidate: fuzzyBest?.phrase,
            score: fuzzyBest?.score,
            distance: fuzzyBest?.distance,
            max_distance: fuzzyBest?.maxDistance,
            guardrails_applied: [],
            model_used: true,
            model_confidence: confidence,
            ambiguous: true,
            reason: 'model_fallback_rejected',
            scoped_text: scoped.raw,
            scoped_text_normalized: scoped.normalized,
        };
    }

    return {
        matched: false,
        layer: 'none',
        candidate: fuzzyBest?.phrase,
        score: fuzzyBest?.score,
        distance: fuzzyBest?.distance,
        max_distance: fuzzyBest?.maxDistance,
        guardrails_applied: [],
        model_used: false,
        ambiguous: fuzzyAmbiguous || Boolean(fuzzyBest),
        reason: 'no_clear_match',
        scoped_text: scoped.raw,
        scoped_text_normalized: scoped.normalized,
    };
}

export function parsePhraseListInput(rawValue: string): string[] {
    return parseCSV(rawValue)
        .map((value) => value.trim())
        .filter(Boolean);
}
