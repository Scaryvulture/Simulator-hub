'use client';

import { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { parseCSV } from '@/lib/utils';
import type { SessionVarConfig } from './flow-editor-types';

interface FlowEditorMappingEditorProps {
    mapping: Record<string, (string | number | boolean)[]>;
    onChange: (newMapping: Record<string, (string | number | boolean)[]>) => void;
    sourceVarConfig?: SessionVarConfig;
    lang: 'es' | 'en';
}

export function FlowEditorMappingEditor({
    mapping,
    onChange,
    sourceVarConfig,
    lang,
}: FlowEditorMappingEditorProps) {
    const [newKey, setNewKey] = useState('');
    const [newOptions, setNewOptions] = useState('');
    const sourceOptions = sourceVarConfig?.type === 'random' ? sourceVarConfig.options : null;

    const addMapping = () => {
        if (!newKey) return;
        const optionsList = parseCSV(newOptions);
        onChange({ ...mapping, [newKey]: optionsList });
        setNewKey('');
        setNewOptions('');
    };

    const removeMapping = (key: string) => {
        const newMapping = { ...mapping };
        delete newMapping[key];
        onChange(newMapping);
    };

    return (
        <div className="mt-3 bg-white p-3 rounded-lg border border-slate-200">
            <Label className="text-[10px] text-slate-400 uppercase mb-2 block">
                {lang === 'es'
                    ? 'Mapeo de valores (si fuente == X, opciones = Y)'
                    : 'Value mapping (if source == X, options = Y)'}
            </Label>

            <div className="space-y-2 mb-3">
                {Object.entries(mapping).map(([key, options]) => (
                    <div key={key} className="flex items-start gap-2 text-xs bg-slate-50 p-2 rounded border border-slate-100">
                        <span className="font-bold min-w-[80px] text-slate-700">{key}:</span>
                        <span className="text-slate-500 flex-1">{options.join(', ')}</span>
                        <button type="button" onClick={() => removeMapping(key)} className="text-red-400 hover:text-red-600">
                            <Trash2 className="h-3 w-3" />
                        </button>
                    </div>
                ))}
            </div>

            <div className="flex items-end gap-2">
                <div className="w-1/3">
                    <Label className="text-[9px] text-slate-400">{lang === 'es' ? 'Valor fuente' : 'Source value'}</Label>
                    {sourceOptions ? (
                        <select
                            value={newKey}
                            onChange={(e) => setNewKey(e.target.value)}
                            className="w-full h-8 rounded border border-slate-200 text-xs px-2"
                        >
                            <option value="">{lang === 'es' ? 'Seleccionar...' : 'Select...'}</option>
                            {sourceOptions.map((opt) => (
                                <option key={String(opt)} value={String(opt)}>
                                    {String(opt)}
                                </option>
                            ))}
                        </select>
                    ) : (
                        <Input
                            value={newKey}
                            onChange={(e) => setNewKey(e.target.value)}
                            className="h-8 text-xs"
                            placeholder={lang === 'es' ? 'Valor fuente' : 'Source value'}
                        />
                    )}
                </div>
                <div className="flex-1">
                    <Label className="text-[9px] text-slate-400">
                        {lang === 'es'
                            ? 'Opciones resultantes (coma separada; usa comillas para textos con comas)'
                            : 'Result options (comma-separated; use quotes for text with commas)'}
                    </Label>
                    <Input
                        value={newOptions}
                        onChange={(e) => setNewOptions(e.target.value)}
                        className="h-8 text-xs"
                        placeholder={lang === 'es' ? '"Opción, con coma", Opción B...' : '"Option, with comma", Option B...'}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                                e.preventDefault();
                                addMapping();
                            }
                        }}
                    />
                </div>
                <Button type="button" onClick={addMapping} size="sm" className="h-8 w-8 p-0" variant="outline">
                    <Plus className="h-4 w-4" />
                </Button>
            </div>
        </div>
    );
}
