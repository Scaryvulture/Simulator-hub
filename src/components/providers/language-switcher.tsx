'use client';

import { useLanguage } from '@/components/providers/i18n-context';

interface Props {
    className?: string;
}

export function LanguageSwitcher({ className = '' }: Props) {
    const { lang, setLang } = useLanguage();

    return (
        <div className={`flex items-center bg-muted rounded-lg p-0.5 border border-border ${className}`}>
            <button
                onClick={() => setLang('es')}
                className={`px-3 py-1 rounded-md text-[9px] font-black transition-all ${lang === 'es' ? 'bg-background text-primary shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
            >
                ES
            </button>
            <button
                onClick={() => setLang('en')}
                className={`px-3 py-1 rounded-md text-[9px] font-black transition-all ${lang === 'en' ? 'bg-background text-primary shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
            >
                EN
            </button>
        </div>
    );
}
