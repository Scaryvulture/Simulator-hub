'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { DollarSign, Plus, RefreshCw, Save, Trash2 } from 'lucide-react';
import { useLanguage } from '@/components/providers/i18n-context';
import { getPricingConfigs, upsertPricingConfig, deletePricingConfig, seedDefaultPricing } from '@/app/actions/pricing';
import { AdminPageHeader } from '@/components/admin/admin-page-header';
import { AdminPanel } from '@/components/admin/admin-panel';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

interface PricingConfig {
    id: string;
    model_name: string;
    input_price_per_million: number;
    output_price_per_million: number;
    updated_at: Date;
}

export default function PricingPage() {
    const { lang } = useLanguage();
    const [configs, setConfigs] = useState<PricingConfig[]>([]);
    const [loading, setLoading] = useState(true);
    const [newModel, setNewModel] = useState({ model_name: '', input_price_per_million: 0, output_price_per_million: 0 });

    const copy = lang === 'es'
        ? {
            title: 'Precios',
            subtitle: 'Costos por modelo para cálculo y auditoría.',
            model: 'Modelo',
            inputPrice: 'Input ($/M)',
            outputPrice: 'Output ($/M)',
            actions: 'Acciones',
            addNew: 'Agregar modelo',
            seedDefaults: 'Cargar valores por defecto',
            save: 'Guardar',
            delete: 'Eliminar',
            noConfigs: 'No hay configuraciones de precios cargadas.',
            newRowTitle: 'Nuevo modelo',
            newRowDescription: 'Agregá una configuración adicional sin tocar las existentes.',
            saved: 'Guardado exitosamente',
            deleted: 'Configuración eliminada',
            seeded: 'Valores por defecto cargados',
            loading: 'Cargando...',
            saveError: 'Error al guardar',
            deleteError: 'Error al eliminar',
            seedError: 'Error al cargar valores por defecto',
            addError: 'Error al agregar',
        }
        : {
            title: 'Pricing',
            subtitle: 'Per-model costs for calculation and audits.',
            model: 'Model',
            inputPrice: 'Input ($/M)',
            outputPrice: 'Output ($/M)',
            actions: 'Actions',
            addNew: 'Add model',
            seedDefaults: 'Load default values',
            save: 'Save',
            delete: 'Delete',
            noConfigs: 'No pricing configurations loaded yet.',
            newRowTitle: 'New model',
            newRowDescription: 'Add another pricing row without touching the existing ones.',
            saved: 'Saved successfully',
            deleted: 'Configuration deleted',
            seeded: 'Default values loaded',
            loading: 'Loading...',
            saveError: 'Error saving',
            deleteError: 'Error deleting',
            seedError: 'Error loading default values',
            addError: 'Error adding',
        };

    useEffect(() => {
        void loadConfigs();
    }, []);

    async function loadConfigs() {
        setLoading(true);
        try {
            const data = await getPricingConfigs();
            setConfigs(data);
        } catch (error) {
            console.error('Failed to load pricing configs:', error);
        } finally {
            setLoading(false);
        }
    }

    async function handleSave(config: PricingConfig) {
        try {
            await upsertPricingConfig({
                model_name: config.model_name,
                input_price_per_million: config.input_price_per_million,
                output_price_per_million: config.output_price_per_million,
            });
            toast.success(copy.saved);
            void loadConfigs();
        } catch {
            toast.error(copy.saveError);
        }
    }

    async function handleDelete(modelName: string) {
        try {
            await deletePricingConfig(modelName);
            toast.success(copy.deleted);
            void loadConfigs();
        } catch {
            toast.error(copy.deleteError);
        }
    }

    async function handleSeedDefaults() {
        try {
            await seedDefaultPricing();
            toast.success(copy.seeded);
            void loadConfigs();
        } catch {
            toast.error(copy.seedError);
        }
    }

    async function handleAddNew() {
        if (!newModel.model_name.trim()) return;
        try {
            await upsertPricingConfig(newModel);
            toast.success(copy.saved);
            setNewModel({ model_name: '', input_price_per_million: 0, output_price_per_million: 0 });
            void loadConfigs();
        } catch {
            toast.error(copy.addError);
        }
    }

    function updateConfig(id: string, field: keyof PricingConfig, value: PricingConfig[keyof PricingConfig]) {
        setConfigs((prev) => prev.map((config) => (config.id === id ? { ...config, [field]: value } : config)));
    }

    return (
        <div className="space-y-6">
            <AdminPageHeader
                variant="directory"
                eyebrow={lang === 'es' ? 'Administración' : 'Administration'}
                title={copy.title}
                description={copy.subtitle}
                actions={(
                    <Button onClick={handleSeedDefaults} variant="outline" className="h-11 rounded-2xl border-slate-200 font-semibold">
                        <RefreshCw className="mr-2 h-4 w-4" />
                        {copy.seedDefaults}
                    </Button>
                )}
            />

            <AdminPanel
                variant="section"
                title={copy.model}
                description={loading ? undefined : `${configs.length} ${lang === 'es' ? 'modelos configurados.' : 'configured models.'}`}
                contentClassName="space-y-4"
            >
                {loading ? (
                    <div className="rounded-[22px] border border-dashed border-slate-300 bg-slate-50/70 p-20 text-center text-sm font-semibold text-slate-500">
                        {copy.loading}
                    </div>
                ) : configs.length === 0 ? (
                    <div className="admin-directory-empty-state">
                        <div className="mb-5 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
                            <DollarSign className="h-9 w-9 text-slate-400" />
                        </div>
                        <h3 className="text-xl font-black tracking-tight text-slate-900">{copy.noConfigs}</h3>
                    </div>
                ) : (
                    <div className="space-y-4">
                        <div className="grid grid-cols-1 gap-3 px-2 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500 md:grid-cols-[minmax(0,1.3fr)_minmax(150px,1fr)_minmax(150px,1fr)_auto]">
                            <div>{copy.model}</div>
                            <div>{copy.inputPrice}</div>
                            <div>{copy.outputPrice}</div>
                            <div>{copy.actions}</div>
                        </div>

                        {configs.map((config) => (
                            <div
                                key={config.id}
                                className="grid grid-cols-1 gap-3 rounded-[22px] border border-slate-200 bg-slate-50/72 p-4 md:grid-cols-[minmax(0,1.3fr)_minmax(150px,1fr)_minmax(150px,1fr)_auto]"
                            >
                                <div className="font-mono text-sm font-bold text-slate-800">{config.model_name}</div>
                                <Input
                                    type="number"
                                    step="0.01"
                                    value={config.input_price_per_million}
                                    onChange={(event) => updateConfig(config.id, 'input_price_per_million', parseFloat(event.target.value) || 0)}
                                    className="h-11 rounded-2xl border-slate-200 bg-white"
                                />
                                <Input
                                    type="number"
                                    step="0.01"
                                    value={config.output_price_per_million}
                                    onChange={(event) => updateConfig(config.id, 'output_price_per_million', parseFloat(event.target.value) || 0)}
                                    className="h-11 rounded-2xl border-slate-200 bg-white"
                                />
                                <div className="flex gap-2 md:justify-end">
                                    <Button size="sm" onClick={() => handleSave(config)} className="h-11 rounded-2xl px-4 font-semibold">
                                        <Save className="mr-2 h-4 w-4" />
                                        {copy.save}
                                    </Button>
                                    <Button size="sm" variant="destructive" onClick={() => handleDelete(config.model_name)} className="h-11 rounded-2xl px-4">
                                        <Trash2 className="h-4 w-4" />
                                    </Button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </AdminPanel>

            <AdminPanel
                variant="section"
                title={copy.newRowTitle}
                description={copy.newRowDescription}
            >
                <div className="grid grid-cols-1 gap-3 md:grid-cols-[minmax(0,1.3fr)_minmax(150px,1fr)_minmax(150px,1fr)_auto]">
                    <Input
                        placeholder="gpt-4o-new"
                        value={newModel.model_name}
                        onChange={(event) => setNewModel((prev) => ({ ...prev, model_name: event.target.value }))}
                        className="h-11 rounded-2xl border-slate-200 bg-white"
                    />
                    <Input
                        type="number"
                        step="0.01"
                        placeholder="0.00"
                        value={newModel.input_price_per_million || ''}
                        onChange={(event) => setNewModel((prev) => ({ ...prev, input_price_per_million: parseFloat(event.target.value) || 0 }))}
                        className="h-11 rounded-2xl border-slate-200 bg-white"
                    />
                    <Input
                        type="number"
                        step="0.01"
                        placeholder="0.00"
                        value={newModel.output_price_per_million || ''}
                        onChange={(event) => setNewModel((prev) => ({ ...prev, output_price_per_million: parseFloat(event.target.value) || 0 }))}
                        className="h-11 rounded-2xl border-slate-200 bg-white"
                    />
                    <Button onClick={handleAddNew} className="h-11 rounded-2xl px-5 font-semibold">
                        <Plus className="mr-2 h-4 w-4" />
                        {copy.addNew}
                    </Button>
                </div>
            </AdminPanel>
        </div>
    );
}
