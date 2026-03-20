

const MAX_PATTERN_LENGTH = 500;
const NESTED_QUANTIFIER_REGEX = /\((?:[^()\\]|\\.)*[+*](?:[^()\\]|\\.)*\)[+*{]/;
const OVERLY_BROAD_ALTERNATION_REGEX = /\((?:[^()\\]|\\.)+\|(?:[^()\\]|\\.)+\)[+*]/;

function isBlockedRegex(pattern: string): boolean {
    if (NESTED_QUANTIFIER_REGEX.test(pattern)) return true;
    if (OVERLY_BROAD_ALTERNATION_REGEX.test(pattern)) return true;
    return false;
}

/**
 * Safely construct a RegExp from an untrusted pattern string.
 * Returns `null` when the pattern is empty, too long, or syntactically invalid
 * — preventing ReDoS from crashing the event loop.
 */
export function safeRegex(pattern: string, flags = 'i'): RegExp | null {
    if (!pattern || pattern.length > MAX_PATTERN_LENGTH) return null;
    if (isBlockedRegex(pattern)) return null;
    try {
        return new RegExp(pattern, flags);
    } catch {
        return null;
    }
}
