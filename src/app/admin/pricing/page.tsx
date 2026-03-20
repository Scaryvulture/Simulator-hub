'use client';

import { useEffect, useState } from 'react';
import { useLanguage } from '@/components/providers/i18n-context';
import { getPricingConfigs, upsertPricingConfig, deletePricingConfig, seedDefaultPricing } from '@/app/actions/pricing';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { DollarSign, Plus, Trash2, RefreshCw, Save, Coins } from 'lucide-react';
import { toast } from 'sonner';

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

    const translations = {
        es: {
            title: 'Configuración de Precios',
            subtitle: 'Gestiona los precios por modelo de IA para cálculo de costos',
            model: 'Modelo',
            inputPrice: 'Precio Input ($/M)',
            outputPrice: 'Precio Output ($/M)',
            actions: 'Acciones',
            addNew: 'Agregar Modelo',
            seedDefaults: 'Cargar Valores por Defecto',
            save: 'Guardar',
            delete: 'Eliminar',
            noConfigs: 'No hay configuraciones de precios. Carga los valores por defecto para comenzar.',
            saved: 'Guardado exitosamente',
            deleted: 'Configuración eliminada',
            seeded: 'Valores por defecto cargados',
            loading: 'Cargando...',
            saveError: 'Error al guardar',
            deleteError: 'Error al eliminar',
            seedError: 'Error al cargar valores por defecto',
            addError: 'Error al agregar',
        },
        en: {
            title: 'Pricing Configuration',
            subtitle: 'Manage AI model prices for cost calculation',
            model: 'Model',
            inputPrice: 'Input Price ($/M)',
            outputPrice: 'Output Price ($/M)',
            actions: 'Actions',
            addNew: 'Add Model',
            seedDefaults: 'Load Default Values',
            save: 'Save',
            delete: 'Delete',
            noConfigs: 'No pricing configurations. Load default values to get started.',
            saved: 'Saved successfully',
            deleted: 'Configuration deleted',
            seeded: 'Default values loaded',
            loading: 'Loading...',
            saveError: 'Error saving',
            deleteError: 'Error deleting',
            seedError: 'Error seeding',
            addError: 'Error adding',
        }
    }[lang];

    useEffect(() => {
        loadConfigs();
    }, []);

    async function loadConfigs() {
        setLoading(true);
        try {
            const data = await getPricingConfigs();
            setConfigs(data);
        } catch (e) {
            console.error('Failed to load pricing configs:', e);
        } finally {
            setLoading(false);
        }
    }

    async function handleSave(config: PricingConfig) {
        try {
            await upsertPricingConfig({
                model_name: config.model_name,
                input_price_per_million: config.input_price_per_million,
                output_price_per_million: config.output_price_per_million
            });
            toast.success(translations.saved);
            loadConfigs();
        } catch {
            toast.error(translations.saveError);
        }
    }

    async function handleDelete(modelName: string) {
        try {
            await deletePricingConfig(modelName);
            toast.success(translations.deleted);
            loadConfigs();
        } catch {
            toast.error(translations.deleteError);
        }
    }

    async function handleSeedDefaults() {
        try {
            await seedDefaultPricing();
            toast.success(translations.seeded);
            loadConfigs();
        } catch {
            toast.error(translations.seedError);
        }
    }

    async function handleAddNew() {
        if (!newModel.model_name.trim()) return;
        try {
            await upsertPricingConfig(newModel);
            toast.success(translations.saved);
            setNewModel({ model_name: '', input_price_per_million: 0, output_price_per_million: 0 });
            loadConfigs();
        } catch {
            toast.error(translations.addError);
        }
    }

    function updateConfig(id: string, field: keyof PricingConfig, value: PricingConfig[keyof PricingConfig]) {
        setConfigs(prev => prev.map(c => c.id === id ? { ...c, [field]: value } : c));
    }

    return (
        <div className="container max-w-5xl mx-auto py-10 px-4">
            <div className="flex items-center justify-between mb-8">
                <div>
                    <h1 className="text-3xl font-black text-slate-900 flex items-center gap-3">
                        <Coins className="h-8 w-8 text-primary" />
                        {translations.title}
                    </h1>
                    <p className="text-slate-500 mt-1">{translations.subtitle}</p>
                </div>
                <Button onClick={handleSeedDefaults} variant="outline" className="gap-2">
                    <RefreshCw className="h-4 w-4" />
                    {translations.seedDefaults}
                </Button>
            </div>

            {loading ? (
                <div className="text-center py-20 text-slate-400">{translations.loading}</div>
            ) : configs.length === 0 ? (
                <Card className="border-dashed">
                    <CardContent className="py-16 text-center text-slate-500">
                        <DollarSign className="h-12 w-12 mx-auto mb-4 text-slate-300" />
                        <p>{translations.noConfigs}</p>
                    </CardContent>
                </Card>
            ) : (
                <Card>
                    <CardHeader>
                        <CardTitle className="text-lg">{translations.model}</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="space-y-4">
                            {/* Header */}
                            <div className="grid grid-cols-4 gap-4 text-xs font-bold text-slate-500 uppercase tracking-wider px-2">
                                <div>{translations.model}</div>
                                <div>{translations.inputPrice}</div>
                                <div>{translations.outputPrice}</div>
                                <div>{translations.actions}</div>
                            </div>

                            {/* Rows */}
                            {configs.map((config) => (
                                <div key={config.id} className="grid grid-cols-4 gap-4 items-center bg-slate-50 p-3 rounded-xl">
                                    <div className="font-mono text-sm font-bold text-slate-800">{config.model_name}</div>
                                    <Input
                                        type="number"
                                        step="0.01"
                                        value={config.input_price_per_million}
                                        onChange={(e) => updateConfig(config.id, 'input_price_per_million', parseFloat(e.target.value) || 0)}
                                        className="h-9 bg-white"
                                    />
                                    <Input
                                        type="number"
                                        step="0.01"
                                        value={config.output_price_per_million}
                                        onChange={(e) => updateConfig(config.id, 'output_price_per_million', parseFloat(e.target.value) || 0)}
                                        className="h-9 bg-white"
                                    />
                                    <div className="flex gap-2">
                                        <Button size="sm" onClick={() => handleSave(config)} className="gap-1">
                                            <Save className="h-3 w-3" /> {translations.save}
                                        </Button>
                                        <Button size="sm" variant="destructive" onClick={() => handleDelete(config.model_name)}>
                                            <Trash2 className="h-3 w-3" />
                                        </Button>
                                    </div>
                                </div>
                            ))}

                            {/* Add New */}
                            <div className="grid grid-cols-4 gap-4 items-center border-2 border-dashed border-slate-200 p-3 rounded-xl mt-6">
                                <Input
                                    placeholder="gpt-4o-new"
                                    value={newModel.model_name}
                                    onChange={(e) => setNewModel(prev => ({ ...prev, model_name: e.target.value }))}
                                    className="h-9"
                                />
                                <Input
                                    type="number"
                                    step="0.01"
                                    placeholder="0.00"
                                    value={newModel.input_price_per_million || ''}
                                    onChange={(e) => setNewModel(prev => ({ ...prev, input_price_per_million: parseFloat(e.target.value) || 0 }))}
                                    className="h-9"
                                />
                                <Input
                                    type="number"
                                    step="0.01"
                                    placeholder="0.00"
                                    value={newModel.output_price_per_million || ''}
                                    onChange={(e) => setNewModel(prev => ({ ...prev, output_price_per_million: parseFloat(e.target.value) || 0 }))}
                                    className="h-9"
                                />
                                <Button onClick={handleAddNew} className="gap-2">
                                    <Plus className="h-4 w-4" /> {translations.addNew}
                                </Button>
                            </div>
                        </div>
                    </CardContent>
                </Card>
            )}
        </div>
    );
}
