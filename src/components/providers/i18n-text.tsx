'use client';

import { useLanguage } from '@/components/providers/i18n-context';

interface Props {
    es: string;
    en: string;
}

export function I18nText({ es, en }: Props) {
    const { lang } = useLanguage();
    return <>{lang === 'es' ? es : en}</>;
}
