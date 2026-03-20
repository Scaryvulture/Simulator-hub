import { cookies } from 'next/headers';
import type { NextRequest } from 'next/server';

export type AppLanguage = 'es' | 'en';

export function normalizeAppLanguage(value: string | null | undefined): AppLanguage {
    return value === 'en' ? 'en' : 'es';
}

export async function getServerLanguage(): Promise<AppLanguage> {
    const cookieStore = await cookies();
    return normalizeAppLanguage(cookieStore.get('app-lang')?.value);
}

export function getRequestLanguage(request: Pick<NextRequest, 'cookies'>): AppLanguage {
    return normalizeAppLanguage(request.cookies.get('app-lang')?.value);
}

export function pickLanguageValue<T>(lang: AppLanguage, values: { es: T; en: T }): T {
    return lang === 'en' ? values.en : values.es;
}
