'use client';

import type { ReactNode } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { AdminPanel } from '@/components/admin/admin-panel';
import { Button } from '@/components/ui/button';

interface BotEditorToolsCardProps {
    lang: 'es' | 'en';
    open: boolean;
    value: string;
    error: string | null;
    helpTrigger: ReactNode;
    onToggle: () => void;
    onChange: (value: string) => void;
    onBlur: () => void;
}

export function BotEditorToolsCard({
    lang,
    open,
    value,
    error,
    helpTrigger,
    onToggle,
    onChange,
    onBlur,
}: BotEditorToolsCardProps) {
    return (
        <AdminPanel
            variant="subtle"
            title={(
                <span className="inline-flex items-center gap-2">
                    {lang === 'es' ? 'Herramientas runtime' : 'Runtime tools'}
                    {helpTrigger}
                </span>
            )}
            description={lang === 'es'
                ? 'Este bloque controla las tools que se envían al runtime sin tocar el contrato existente.'
                : 'This block controls the tools sent to runtime without changing the current contract.'}
            actions={(
                <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-500 hover:bg-slate-100 hover:text-slate-700"
                    onClick={onToggle}
                >
                    {open
                        ? (lang === 'es' ? 'Ocultar' : 'Hide')
                        : (lang === 'es' ? 'Editar' : 'Edit')}
                    {open ? <ChevronDown className="ml-1 h-3.5 w-3.5" /> : <ChevronRight className="ml-1 h-3.5 w-3.5" />}
                </Button>
            )}
            contentClassName="p-0"
        >
            {open ? (
                <>
                    <div className="px-6 pb-2 pt-4 text-[11px] font-medium text-slate-500">
                        {lang === 'es'
                            ? 'Si este campo queda vacío, no se envía ningún tool a la API.'
                            : 'If this field is empty, no tools are sent to the API.'}
                    </div>
                    <textarea
                        className="min-h-[220px] w-full border-none bg-transparent px-6 pb-6 font-mono text-[11px] text-slate-700 outline-none"
                        value={value}
                        onChange={(event) => onChange(event.target.value)}
                        onBlur={onBlur}
                        placeholder={lang === 'es'
                            ? '[\n  {\n    "type": "function",\n    "function": {\n      "name": "runtime.now",\n      "description": "Devuelve la fecha/hora actual",\n      "parameters": {\n        "type": "object",\n        "properties": {}\n      }\n    }\n  }\n]'
                            : '[\n  {\n    "type": "function",\n    "function": {\n      "name": "runtime.now",\n      "description": "Returns current datetime",\n      "parameters": {\n        "type": "object",\n        "properties": {}\n      }\n    }\n  }\n]'}
                    />
                    {error ? (
                        <div className="px-6 pb-5 text-[11px] font-semibold text-red-600">
                            {error}
                        </div>
                    ) : null}
                </>
            ) : (
                <div className="px-6 py-5 text-sm text-slate-600">
                    {lang === 'es'
                        ? 'Tools ocultas. El runtime actual se conserva hasta que abras y edites este bloque.'
                        : 'Tools hidden. The current runtime is preserved until you open and edit this block.'}
                </div>
            )}
        </AdminPanel>
    );
}
