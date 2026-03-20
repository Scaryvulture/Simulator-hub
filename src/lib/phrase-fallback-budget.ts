import type { PhraseModelFallbackInput } from './trigger-matcher';

export interface PhraseFallbackBudgetOptions {
    max_per_turn?: number;
    max_per_intent_per_turn?: number;
}

const DEFAULT_MAX_PER_TURN = 2;
const DEFAULT_MAX_PER_INTENT_PER_TURN = 1;

export class PhraseFallbackBudget {
    private readonly maxPerTurn: number;
    private readonly maxPerIntentPerTurn: number;
    private totalCalls = 0;
    private callsByIntent = new Map<string, number>();

    constructor(options: PhraseFallbackBudgetOptions = {}) {
        this.maxPerTurn = Math.max(0, options.max_per_turn ?? DEFAULT_MAX_PER_TURN);
        this.maxPerIntentPerTurn = Math.max(0, options.max_per_intent_per_turn ?? DEFAULT_MAX_PER_INTENT_PER_TURN);
    }

    canConsume(input: PhraseModelFallbackInput): boolean {
        if (this.totalCalls >= this.maxPerTurn) return false;
        const intentKey = this.getIntentKey(input);
        const intentCalls = this.callsByIntent.get(intentKey) || 0;
        return intentCalls < this.maxPerIntentPerTurn;
    }

    consume(input: PhraseModelFallbackInput): boolean {
        if (!this.canConsume(input)) return false;

        const intentKey = this.getIntentKey(input);
        const intentCalls = this.callsByIntent.get(intentKey) || 0;
        this.totalCalls += 1;
        this.callsByIntent.set(intentKey, intentCalls + 1);
        return true;
    }

    private getIntentKey(input: PhraseModelFallbackInput): string {
        const intentName = (input.intent_name || '').trim();
        if (intentName) {
            return intentName.toLocaleLowerCase('es');
        }

        const triggerId = (input.trigger_id || '').trim();
        if (triggerId) {
            return triggerId.toLocaleLowerCase('es');
        }

        return 'unknown';
    }
}
