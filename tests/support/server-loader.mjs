// Test-process-only boundaries. Never connects a database or a provider.
export async function resolve(specifier, context, nextResolve) {
    if (specifier === 'server-only') return { url: 'data:text/javascript,export {}', shortCircuit: true };
    if ((specifier === './prisma' || specifier === '@/lib/prisma') && context.parentURL?.includes('/src/')) {
        return { url: 'data:text/javascript,export default globalThis.__auditPrisma', shortCircuit: true };
    }
    if (specifier === './ai-client' || specifier === '@/lib/ai-client') return { url: 'data:text/javascript,export const createOpenAIClient = () => globalThis.__auditAI', shortCircuit: true };
    if (specifier === 'next/cache') return { url: 'data:text/javascript,export const revalidatePath = () => {}', shortCircuit: true };
    if (specifier === '@/lib/auth-utils') return { url: new URL('./test-auth.mjs', import.meta.url).href, shortCircuit: true };
    return nextResolve(specifier, context);
}
