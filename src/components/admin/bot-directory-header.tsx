'use client';

import { Plus, Search } from 'lucide-react';
import { AdminPageHeader } from '@/components/admin/admin-page-header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

interface BotDirectoryHeaderProps {
    lang: 'es' | 'en';
    title: string;
    description: string;
    searchTerm: string;
    onSearchTermChange: (value: string) => void;
    onCreate: () => void;
    disabled?: boolean;
}

export function BotDirectoryHeader({
    lang,
    title,
    description,
    searchTerm,
    onSearchTermChange,
    onCreate,
    disabled = false,
}: BotDirectoryHeaderProps) {
    return (
        <AdminPageHeader
            variant="directory"
            eyebrow={lang === 'es' ? 'Administración' : 'Administration'}
            title={title}
            description={description}
            actions={(
                <>
                    <div className="relative w-full min-w-0 sm:w-[320px]">
                        <Search className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-slate-400" />
                        <Input
                            value={searchTerm}
                            onChange={(event) => onSearchTermChange(event.target.value)}
                            placeholder={lang === 'es' ? 'Buscar bots...' : 'Search bots...'}
                            className="h-11 rounded-2xl border-slate-200 bg-white pl-10 shadow-sm"
                        />
                    </div>
                    <div className="flex items-center gap-2">
                        <Button
                            onClick={onCreate}
                            disabled={disabled}
                            className="h-11 rounded-2xl px-5 text-sm font-bold shadow-sm"
                        >
                            <Plus className="mr-2 h-4 w-4" />
                            {lang === 'es' ? 'Nuevo bot' : 'New bot'}
                        </Button>
                    </div>
                </>
            )}
        />
    );
}
