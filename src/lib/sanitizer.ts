/**
 * Sanitizes the output from the LLM to prevent meta-prompt leakage
 * or unwanted formatting.
 */
export function sanitizeResponse(text: string): string {
    if (!text) return '';

    let clean = text;

    // Remove potential system instruction leaks (e.g. "I am a helpful assistant...")
    // This is hard to do perfectly without specific patterns, but we can 
    // remove common meta-tags if the prompt uses them (e.g. [SYSTEM] ...)

    // Example: Remove [META] tags
    clean = clean.replace(/\[META:.*?\]/g, '');

    // Remove citation artifacts that should never be exposed to end users.
    // Examples: [1], [2], [ref], (ref)
    clean = clean.replace(/\[(?:\d{1,3}|ref|refs?)\]/gi, '');
    clean = clean.replace(/\((?:ref|refs?|reference|references|fuente|fuentes)\)/gi, '');

    // Ensure no <script> tags (basic XSS prevention, though React handles this mostly)
    clean = clean.replace(/<script\b[^>]*>([\s\S]*?)<\/script>/gm, "");

    // Normalize accidental spacing after cleanup.
    clean = clean.replace(/\s{2,}/g, ' ');
    clean = clean.replace(/\s+([,.;:!?])/g, '$1');

    return clean.trim();
}
