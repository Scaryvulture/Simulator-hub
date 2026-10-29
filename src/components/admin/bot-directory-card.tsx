'use client';

import Link from 'next/link';
import { MessageSquare, Settings2, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { AdminBotListItem } from './bot-directory-types';

interface BotDirectoryCardProps {
    bot: AdminBotListItem;
    lang: 'es' | 'en';
    onDelete: (id: string) => void;
}

function getTypeLabel(botType: string | null | undefined, lang: 'es' | 'en') {
    const normalized = (botType || '').trim().toUpperCase();
    switch (normalized) {
        case 'SIMULATOR':
            return lang === 'es' ? 'Simulador' : 'Simulator';
        case 'EXAMINER':
            return lang === 'es' ? 'Examinador' : 'Examiner';
        case 'DETECTOR':
            return lang === 'es' ? 'Detector' : 'Detector';
        case 'GENERIC':
            return lang === 'es' ? 'Asistente genérico' : 'Generic assistant';
        default:
            return botType || (lang === 'es' ? 'Asistente' : 'Assistant');
    }
}

function getTypeTone(botType: string | null | undefined) {
    const normalized = (botType || '').trim().toUpperCase();
    switch (normalized) {
        case 'SIMULATOR':
            return {
                line: 'from-indigo-500 via-indigo-400 to-indigo-200/0',
                chip: 'border-indigo-200 bg-indigo-50 text-indigo-700',
            };
        case 'EXAMINER':
            return {
                line: 'from-primary via-primary/70 to-primary/0',
                chip: 'border-primary/15 bg-primary/10 text-primary',
            };
        case 'DETECTOR':
            return {
                line: 'from-emerald-500 via-emerald-400 to-emerald-200/0',
                chip: 'border-emerald-200 bg-emerald-50 text-emerald-700',
            };
        default:
            return {
                line: 'from-slate-500 via-slate-400 to-slate-200/0',
                chip: 'border-slate-200 bg-slate-100 text-slate-700',
            };
    }
}

export function BotDirectoryCard({ bot, lang, onDelete }: BotDirectoryCardProps) {
    const tone = getTypeTone(bot.bot_type);

    return (
        <article className="admin-directory-card">
            <div className={cn('admin-directory-card-line bg-gradient-to-r', tone.line)} />

            <div className="admin-directory-card-header">
                <div className="min-w-0 space-y-3">
                    <div className="flex flex-wrap items-center gap-2">
                        <span className="admin-directory-card-chip admin-directory-card-chip-muted">
                            <span
                                className={cn(
                                    'h-2 w-2 rounded-full',
                                    bot.published ? 'bg-emerald-500' : 'bg-amber-500'
                                )}
                            />
                            {bot.published
                                ? (lang === 'es' ? 'Publicado' : 'Published')
                                : (lang === 'es' ? 'Borrador' : 'Draft')}
                        </span>
                        <span className={cn('admin-directory-card-chip', tone.chip)}>
                            {getTypeLabel(bot.bot_type, lang)}
                        </span>
                    </div>

                    <div className="space-y-1">
                        <h3 className="admin-directory-card-title">{bot.name}</h3>
                        <p className="admin-directory-card-meta">
                            ID {bot.id}
                        </p>
                    </div>
                </div>

                <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => onDelete(bot.id)}
                    className="h-9 w-9 rounded-xl text-slate-400 hover:bg-red-50 hover:text-red-600"
                    aria-label={lang === 'es' ? 'Eliminar bot' : 'Delete bot'}
                >
                    <Trash2 className="h-4 w-4" />
                </Button>
            </div>

            <div className="admin-directory-card-body">
                <div className="admin-directory-card-actions">
                    <Button asChild className="h-11 rounded-2xl font-bold shadow-sm">
                        <Link href={`/admin/bots/${bot.id}`} prefetch={false}>
                            <Settings2 className="mr-2 h-4 w-4" />
                            {lang === 'es' ? 'Editar' : 'Edit'}
                        </Link>
                    </Button>
                    <Button asChild variant="outline" className="h-11 rounded-2xl border-slate-200 font-bold">
                        <Link href={`/chat/${bot.id}?new=true`} prefetch={false}>
                            <MessageSquare className="mr-2 h-4 w-4 text-primary" />
                            Chat
                        </Link>
                    </Button>
                </div>
            </div>
        </article>
    );
}
