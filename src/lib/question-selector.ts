// Question selection logic for EXAMINER bots
import { parseListInput } from './utils';

export interface Question {
    id: string;
    topic: string;
    type: 'teorica' | 'practica';
    question: string;
    expected_keys: string;
    media_url?: string;
    is_mandatory: boolean;
    branch_key?: string;
    max_attempts?: number;
    continue_mode?: 'ask_confirm' | 'auto_next';
    min_expected_matches?: number;
    min_answer_words?: number;
    min_answer_sentences?: number;
    retry_incomplete_template?: string;
    retry_incorrect_template?: string;
    second_fail_template?: string;
    correct_feedback_template?: string;
    continue_prompt_template?: string;
    evaluation_spec?: Record<string, unknown>;
}

export interface QuestionBankConfig {
    topics: string[];
    questions: Question[];
}

export interface EvaluationConfig {
    teoricas: { mandatory: number; random: number };
    practicas: { count: number; by_topic: boolean };
    selection?: {
        mandatory_count: number;
        random_count: number;
        by_topic: boolean;
        order_mode: 'mandatory_first' | 'random_first' | 'mixed';
        question_type_order?: 'any' | 'teorica_first' | 'practica_first';
        show_question_counter?: boolean;
        semantic_mode?: 'ambiguous_only' | 'always';
    };
}

type SequenceConfigItem = {
    type: 'specific' | 'random_pool' | 'random_topic';
    question_id?: string;
    pool_ids?: string[];
    topic?: string;
    count?: number;
};

export interface SelectedQuestions {
    teoricas: Question[];
    practicas: Question[];
    all: Question[];
}

/**
 * QuestionSelector - Handles intelligent question selection from the bank
 * 
 * Selection logic:
 * 1. Use one unified question pool.
 * 2. Select mandatory + random questions.
 * 3. Order can be mandatory-first, random-first, or mixed.
 */
export class QuestionSelector {
    private static normalizeTopic(value: string): string {
        return (value || '').trim().toLocaleLowerCase('es');
    }

    private static isCommonTopic(topic: string): boolean {
        const normalized = this.normalizeTopic(topic);
        return normalized === '' || normalized === '*' || normalized === 'all' || normalized === 'comun' || normalized === 'común' || normalized === 'general';
    }

    private static matchesBranch(question: Question, detectedTopic: string | null): boolean {
        const raw = (question.branch_key || '').trim();
        if (!raw) return true;
        if (!detectedTopic) return true;
        const target = this.normalizeTopic(detectedTopic);
        const allowed = parseListInput(raw).map((item) => this.normalizeTopic(item)).filter(Boolean);
        if (allowed.length === 0) return true;
        return allowed.includes(target);
    }

    private static isLikelyImageUrl(url: string): boolean {
        const clean = (url || '').toLowerCase().split('?')[0];
        return (
            clean.endsWith('.png')
            || clean.endsWith('.jpg')
            || clean.endsWith('.jpeg')
            || clean.endsWith('.gif')
            || clean.endsWith('.webp')
            || clean.endsWith('.svg')
            || clean.includes('/image/')
            || clean.includes('drive.google.com') // Treat Drive links as images for markdown purposes (or auto-preview if chat supports it)
        );
    }

    private static formatMediaBlock(url: string): string {
        const clean = (url || '').trim();
        if (!clean) return '';

        // Always try to render as image/embed markdown first
        // Most chat UIs will try to preview anything in an ![]() tag
        if (this.isLikelyImageUrl(clean)) {
            return `\n\n![](${clean})`;
        }

        // For other links, just show the link without "Recurso:" prefix if possible,
        // or just a cleaner label.
        return `\n\n[Ver recurso](${clean})`;
    }

    /**
     * Detect topic from user context (message content or session data)
     */
    static detectTopic(userContext: string, availableTopics: string[]): string | null {
        const normalizedContext = userContext.toLowerCase();

        for (const topic of availableTopics) {
            const topicLower = topic.toLowerCase();
            // Check if topic appears in context
            if (normalizedContext.includes(topicLower)) {
                return topic;
            }
            // Check common variations
            const variations = this.getTopicVariations(topicLower);
            for (const variation of variations) {
                if (normalizedContext.includes(variation)) {
                    return topic;
                }
            }
        }

        return null;
    }

    /**
     * Get common variations of topic names
     */
    private static getTopicVariations(topic: string): string[] {
        const variations: Record<string, string[]> = {
            'soldador': ['soldadura', 'soldar', 'sueldo'],
            'electricista': ['electricidad', 'electrico', 'eléctrico'],
            'altura': ['alturas', 'alto', 'escalera'],
            'espacios confinados': ['espacio confinado', 'confinado'],
            'permiso de trabajo': ['pt', 'permiso', 'permisos'],
            'izaje': ['izar', 'grúa', 'grua', 'izamiento'],
            'excavaciones': ['excavación', 'excavacion', 'excavar'],
            'fijo': ['fijos', 'tubular', 'multidireccional'],
            'movil': ['móvil', 'moviles', 'ruedas'],
        };

        return variations[topic] || [];
    }

    /**
     * Select questions based on configuration (Standard or Sequence Mode)
     */
    static selectQuestions(
        bank: QuestionBankConfig,
        evalConfig: EvaluationConfig & { mode?: 'standard' | 'sequence'; sequence?: SequenceConfigItem[] },
        detectedTopic: string | null,
        askedQuestionIds: string[] = []
    ): SelectedQuestions {
        const result: SelectedQuestions = {
            teoricas: [],
            practicas: [],
            all: [],
        };

        // Filter out already asked questions
        const availableQuestions = bank.questions.filter(
            q => !askedQuestionIds.includes(q.id)
        );

        // SEQUENCE MODE
        if (evalConfig.mode === 'sequence' && Array.isArray(evalConfig.sequence) && evalConfig.sequence.length > 0) {
            const playlist: Question[] = [];

            for (const item of evalConfig.sequence) {
                if (item.type === 'specific' && item.question_id) {
                    const q = availableQuestions.find(q => q.id === item.question_id);
                    if (q) playlist.push(q);
                }
                else if (item.type === 'random_pool' && Array.isArray(item.pool_ids)) {
                    // Filter pool by IDs AND by current topic context
                    const pool = availableQuestions.filter(q => {
                        const idMatch = item.pool_ids?.includes(q.id);
                        if (!idMatch) return false;

                        // If we have a detected topic, ensure question matches it or is common
                        if (detectedTopic) {
                            const normalizedQuestionTopic = this.normalizeTopic(q.topic || '');
                            const normalizedDetected = this.normalizeTopic(detectedTopic);
                            return normalizedQuestionTopic === normalizedDetected || this.isCommonTopic(q.topic || '');
                        }

                        return true;
                    });
                    const selected = this.shuffleArray(pool).slice(0, item.count || 1);
                    playlist.push(...selected);
                }
                else if (item.type === 'random_topic' && item.topic) {
                    const targetTopic = item.topic;
                    const normalizedTargetTopic = this.normalizeTopic(targetTopic);
                    const isAnyTopic = normalizedTargetTopic === 'all' || normalizedTargetTopic === '*';

                    const pool = availableQuestions.filter((q) => {
                        const matchesTopic = isAnyTopic
                            ? true
                            : (this.normalizeTopic(q.topic) === normalizedTargetTopic || this.isCommonTopic(q.topic));
                        if (!matchesTopic) return false;
                        return this.matchesBranch(q, detectedTopic);
                    });
                    const selected = this.shuffleArray(pool).slice(0, item.count || 1);
                    playlist.push(...selected);
                }
            }

            // Remove duplicates just in case
            const uniquePlaylist = Array.from(new Set(playlist.map(q => q.id)))
                .map(id => playlist.find(q => q.id === id)!)
                .filter(Boolean);

            result.all = uniquePlaylist;
            return result;
        }

        // STANDARD MODE (Legacy)
        const selection = evalConfig.selection || {
            mandatory_count: evalConfig.teoricas?.mandatory ?? 0,
            random_count: (evalConfig.teoricas?.random ?? 0) + (evalConfig.practicas?.count ?? 0),
            by_topic: evalConfig.practicas?.by_topic ?? false,
            order_mode: 'mandatory_first' as const,
            question_type_order: 'any' as const,
        };

        let scopedPool = availableQuestions;
        if (selection.by_topic && detectedTopic) {
            const normalizedDetected = this.normalizeTopic(detectedTopic);
            const topicPool = availableQuestions.filter((q) => {
                const normalizedQuestionTopic = this.normalizeTopic(q.topic || '');
                const topicMatches = normalizedQuestionTopic === normalizedDetected || this.isCommonTopic(q.topic || '');
                if (!topicMatches) return false;
                return this.matchesBranch(q, detectedTopic);
            });
            if (topicPool.length > 0) {
                scopedPool = topicPool;
            } else {
                // Fail-closed: if by_topic is active and no scoped questions exist, keep empty pool.
                scopedPool = [];
            }
        } else {
            // Even if not strict by_topic, respect branch_keys if a topic is active
            if (detectedTopic) {
                scopedPool = availableQuestions.filter((q) => this.matchesBranch(q, detectedTopic));
            }
        }

        const mandatoryPool = scopedPool.filter((q) => q.is_mandatory);
        const mandatoryCount = Math.min(
            Math.max(0, selection.mandatory_count || 0),
            mandatoryPool.length
        );
        const selectedMandatory = mandatoryPool.slice(0, mandatoryCount);

        const randomPool = scopedPool.filter((q) => !q.is_mandatory);
        const shuffledRandom = this.shuffleArray(randomPool);
        const randomCount = Math.min(
            Math.max(0, selection.random_count || 0),
            shuffledRandom.length
        );
        const selectedRandom = shuffledRandom.slice(0, randomCount);

        let ordered: Question[] = [];
        if (selection.order_mode === 'random_first') {
            ordered = [...selectedRandom, ...selectedMandatory];
        } else if (selection.order_mode === 'mixed') {
            const merged: Question[] = [];
            const maxLen = Math.max(selectedMandatory.length, selectedRandom.length);
            for (let i = 0; i < maxLen; i++) {
                if (i < selectedMandatory.length) merged.push(selectedMandatory[i]);
                if (i < selectedRandom.length) merged.push(selectedRandom[i]);
            }
            ordered = merged;
        } else {
            ordered = [...selectedMandatory, ...selectedRandom];
        }

        if (selection.question_type_order === 'teorica_first') {
            ordered = [
                ...ordered.filter((q) => q.type === 'teorica'),
                ...ordered.filter((q) => q.type === 'practica'),
            ];
        } else if (selection.question_type_order === 'practica_first') {
            ordered = [
                ...ordered.filter((q) => q.type === 'practica'),
                ...ordered.filter((q) => q.type === 'teorica'),
            ];
        }

        // Keep legacy buckets populated for compatibility.
        result.teoricas = selectedMandatory;
        result.practicas = selectedRandom;
        result.all = ordered;

        return result;
    }

    /**
     * Get the next question from a pre-selected list
     */
    static getNextQuestion(
        selectedQuestions: Question[],
        currentIndex: number
    ): { question: Question | null; nextIndex: number; isComplete: boolean } {
        if (currentIndex >= selectedQuestions.length) {
            return { question: null, nextIndex: currentIndex, isComplete: true };
        }

        return {
            question: selectedQuestions[currentIndex],
            nextIndex: currentIndex + 1,
            isComplete: false,
        };
    }

    /**
     * Format question for display
     */
    static formatQuestion(question: Question): string {
        let content = question.question;

        if (question.media_url) {
            content += this.formatMediaBlock(question.media_url);
        }

        return content;
    }

    /**
     * Fisher-Yates shuffle algorithm
     */
    private static shuffleArray<T>(array: T[]): T[] {
        const shuffled = [...array];
        for (let i = shuffled.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
        }
        return shuffled;
    }
}
