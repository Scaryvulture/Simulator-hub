'use client';

import { useEffect, useState } from 'react';
import { Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { parseCSV } from '@/lib/utils';
import { FlowEditorMappingEditor } from './flow-editor-mapping-editor';
import type { SessionVarConfig } from './flow-editor-types';

interface FlowEditorSessionVarRowProps {
    varName: string;
    config: SessionVarConfig;
    allVars: Record<string, SessionVarConfig>;
    onUpdate: (newName: string, newConfig: SessionVarConfig) => void;
    onDelete: () => void;
    lang: 'es' | 'en';
}

export function FlowEditorSessionVarRow({
    varName,
    config,
    allVars,
    onUpdate,
    onDelete,
    lang,
}: FlowEditorSessionVarRowProps) {
    const [localName, setLocalName] = useState(varName);
    const [localOptions, setLocalOptions] = useState((config.options || []).join(', '));
    const [localValue, setLocalValue] = useState(String(config.value ?? ''));
    const [localFormula, setLocalFormula] = useState(config.formula || '');
    const [localSourceVar, setLocalSourceVar] = useState(config.source_var || '');

    useEffect(() => {
        setLocalName(varName);
    }, [varName]);

    useEffect(() => {
        setLocalOptions((config.options || []).join(', '));
        setLocalValue(String(config.value ?? ''));
        setLocalFormula(config.formula || '');
        setLocalSourceVar(config.source_var || '');
    }, [config.options, config.value, config.formula, config.source_var]);

    const handleOptionsBlur = () => {
        const newOptions = parseCSV(localOptions);
        onUpdate(varName, { ...config, options: newOptions });
    };

    const availableSourceVars = Object.keys(allVars).filter((name) => name !== varName);

    return (
        <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
            <div className="flex items-start gap-3">
                <div className="flex-1 grid grid-cols-3 gap-3">
                    <div>
                        <Label className="text-[10px] text-slate-400 uppercase">{lang === 'es' ? 'Nombre' : 'Name'}</Label>
                        <Input
                            value={localName}
                            onChange={(e) => setLocalName(e.target.value)}
                            onBlur={() => {
                                if (localName !== varName) {
                                    onUpdate(localName, config);
                                }
                            }}
                            className="h-9 text-sm font-mono"
                            placeholder={lang === 'es' ? 'nombre_variable' : 'variable_name'}
                        />
                    </div>
                    <div>
                        <Label className="text-[10px] text-slate-400 uppercase">{lang === 'es' ? 'Tipo' : 'Type'}</Label>
                        <select
                            value={config.type}
                            onChange={(e) => onUpdate(varName, { ...config, type: e.target.value as SessionVarConfig['type'] })}
                            className="w-full h-9 rounded-lg border border-slate-200 text-sm px-2"
                        >
                            <option value="random">{lang === 'es' ? 'Aleatorio de lista' : 'Random from list'}</option>
                            <option value="random_by">{lang === 'es' ? 'Según otra variable' : 'Based on another variable'}</option>
                            <option value="fixed">{lang === 'es' ? 'Valor fijo' : 'Fixed value'}</option>
                            <option value="computed">{lang === 'es' ? 'Calculado' : 'Computed'}</option>
                        </select>
                    </div>
                    <div>
                        <Label className="text-[10px] text-slate-400 uppercase">
                            {config.type === 'random' && (lang === 'es' ? 'Opciones (coma separada)' : 'Options (comma-separated)')}
                            {config.type === 'fixed' && (lang === 'es' ? 'Valor' : 'Value')}
                            {config.type === 'computed' && (lang === 'es' ? 'Formula' : 'Formula')}
                            {config.type === 'random_by' && (lang === 'es' ? 'Variable fuente' : 'Source variable')}
                        </Label>
                        {config.type === 'random' && (
                            <Input
                                value={localOptions}
                                onChange={(e) => setLocalOptions(e.target.value)}
                                onBlur={handleOptionsBlur}
                                className="h-9 text-sm"
                                placeholder={lang === 'es' ? 'opcion1, opcion2, opcion3' : 'option1, option2, option3'}
                            />
                        )}
                        {config.type === 'fixed' && (
                            <Input
                                value={localValue}
                                onChange={(e) => setLocalValue(e.target.value)}
                                onBlur={() => onUpdate(varName, { ...config, value: localValue })}
                                className="h-9 text-sm"
                            />
                        )}
                        {config.type === 'computed' && (
                            <Input
                                value={localFormula}
                                onChange={(e) => setLocalFormula(e.target.value)}
                                onBlur={() => onUpdate(varName, { ...config, formula: localFormula })}
                                className="h-9 text-sm font-mono"
                                placeholder="random(18, 55)"
                            />
                        )}
                        {config.type === 'random_by' && (
                            <select
                                value={localSourceVar}
                                onChange={(e) => {
                                    setLocalSourceVar(e.target.value);
                                    onUpdate(varName, { ...config, source_var: e.target.value });
                                }}
                                className="w-full h-9 rounded-lg border border-slate-200 text-sm px-2 font-mono"
                            >
                                <option value="">{lang === 'es' ? 'Seleccionar variable...' : 'Select variable...'}</option>
                                {availableSourceVars.map((name) => (
                                    <option key={name} value={name}>
                                        {name}
                                    </option>
                                ))}
                            </select>
                        )}
                    </div>
                </div>
                <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-red-400 hover:text-red-600 hover:bg-red-50"
                    onClick={onDelete}
                >
                    <Trash2 className="h-4 w-4" />
                </Button>
            </div>

            {config.type === 'random_by' && config.source_var && (
                <FlowEditorMappingEditor
                    mapping={config.mapping || {}}
                    onChange={(newMapping) => onUpdate(varName, { ...config, mapping: newMapping })}
                    sourceVarConfig={allVars[config.source_var]}
                    lang={lang}
                />
            )}
        </div>
    );
}
