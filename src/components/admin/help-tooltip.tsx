'use client';

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { HelpCircle, BookOpen } from "lucide-react";
import { useLanguage } from "@/components/providers/i18n-context";

interface Props {
    title: string;
    content: string;
}

export function HelpTooltip({ title, content }: Props) {
    const { lang } = useLanguage();
    const translatedTitle = (() => {
        if (lang !== 'es') return title;
        const dictionary: Record<string, string> = {
            identity: 'Identidad',
            security: 'Seguridad',
            users: 'Usuarios',
            user: 'Usuario',
            bots: 'Bots',
            organizations: 'Organizaciones',
            creation: 'Creación',
            preview: 'Vista previa',
            rag: 'RAG',
            instruction: 'Instrucción',
            instructions: 'Instrucciones',
            'boolean criteria': 'Criterios booleanos',
            'qualitative criteria': 'Criterios cualitativos',
            booleanos: 'Booleanos',
            cualitativos: 'Cualitativos',
            pro: 'Modo Pro',
        };
        return dictionary[title.toLowerCase()] || title;
    })();

    return (
        <Popover>
            <PopoverTrigger asChild>
                <button
                    className="ml-2 text-primary/40 hover:text-primary transition-colors focus:outline-none shrink-0 group"
                    aria-label={lang === 'es' ? 'Ayuda de esta sección' : 'Section help'}
                >
                    <HelpCircle className="h-3.5 w-3.5 group-hover:scale-110 transition-transform" />
                </button>
            </PopoverTrigger>
            <PopoverContent className="w-80 rounded-[1.5rem] border border-slate-200 bg-white p-5 text-slate-900 shadow-2xl animate-in zoom-in-95 duration-200">
                <div className="space-y-3">
                    <h4 className="flex items-center gap-2 border-b border-slate-200 pb-2 text-[10px] font-black uppercase tracking-[0.2em] text-slate-900">
                        <BookOpen className="h-3 w-3" /> {lang === 'es' ? 'Guía rápida' : 'Quick guide'}: {translatedTitle.toUpperCase()}
                    </h4>
                    <p className="text-[11px] font-medium leading-relaxed text-slate-700">
                        {content}
                    </p>
                </div>
            </PopoverContent>
        </Popover>
    );
}
