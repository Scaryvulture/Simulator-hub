'use client';

import { Suspense, useEffect, useState } from 'react';
import { Copy, Eye, EyeOff, Mic, Save, Volume2 } from 'lucide-react';
import { toast } from 'sonner';
import { getTtsConfig, updateTtsConfig } from '@/app/actions/tts-config';
import { AdminPageHeader } from '@/components/admin/admin-page-header';
import { AdminPanel } from '@/components/admin/admin-panel';
import { useLanguage } from '@/components/providers/i18n-context';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

function VoiceSettingsEditor() {
    const { lang } = useLanguage();
    const copy = lang === 'es'
        ? {
            title: 'Configuracion de voz',
            subtitle: 'Parametros globales de TTS, reglas base y prueba rapida de salida.',
            save: 'Guardar cambios',
            technicalTitle: 'Parametros tecnicos',
            technicalDescription: 'Modelo, velocidad y API key usados por el TTS global.',
            audioTestTitle: 'Prueba de audio',
            audioTestDescription: 'Genera una muestra rapida con la configuracion actual.',
            rulesTitle: 'Reglas de comportamiento',
            rulesDescription: 'Prompt global de voz aplicado antes de las instrucciones particulares del bot.',
            model: 'Modelo OpenAI',
            modelHint: 'Identificador del modelo de audio.',
            speed: 'Velocidad',
            apiKey: 'OpenAI API key',
            apiKeyHint: 'Se guarda cifrada. Si la dejas vacia y guardas, se elimina.',
            reveal: 'Revelar',
            hide: 'Ocultar',
            copied: 'API key copiada',
            settingsSaved: 'Configuracion guardada',
            loading: 'Cargando configuracion...',
            testPlaceholder: 'Escribe algo para probar la voz...',
            testAction: 'Generar y escuchar',
            testing: 'Reproduciendo...',
            rulesPlaceholder: 'Habla de forma clara, pausada y profesional. Evita muletillas.',
            archetypeNote: 'Si un bot usa arquetipo, su descripcion se agrega automaticamente a estas reglas.',
            revealError: 'No se pudo revelar la API key de TTS.',
            revealEmpty: 'No hay API key de TTS configurada.',
            saveError: 'No se pudo guardar la configuracion.',
            playError: 'No se pudo reproducir el audio de prueba.',
            failedLoad: 'No se pudo cargar la configuracion de voz.',
        }
        : {
            title: 'Voice settings',
            subtitle: 'Global TTS parameters, base voice rules and quick output testing.',
            save: 'Save changes',
            technicalTitle: 'Technical parameters',
            technicalDescription: 'Model, speed and API key used by the global TTS setup.',
            audioTestTitle: 'Audio test',
            audioTestDescription: 'Generate a quick sample with the current configuration.',
            rulesTitle: 'Behavior rules',
            rulesDescription: 'Global voice prompt applied before any bot-specific instruction.',
            model: 'OpenAI model',
            modelHint: 'Audio model identifier.',
            speed: 'Speed',
            apiKey: 'OpenAI API key',
            apiKeyHint: 'Stored encrypted. If you save it empty, the key is removed.',
            reveal: 'Reveal',
            hide: 'Hide',
            copied: 'API key copied',
            settingsSaved: 'Settings saved',
            loading: 'Loading voice settings...',
            testPlaceholder: 'Type something to test the voice...',
            testAction: 'Generate and listen',
            testing: 'Playing...',
            rulesPlaceholder: 'Speak clearly, at a measured pace, with a professional tone. Avoid filler words.',
            archetypeNote: 'If a bot uses an archetype, its description is appended automatically to these rules.',
            revealError: 'Failed to reveal TTS API key.',
            revealEmpty: 'TTS API key is not configured.',
            saveError: 'Failed to save settings.',
            playError: 'Failed to play test audio.',
            failedLoad: 'Failed to load voice settings.',
        };
    const [model, setModel] = useState('tts-1');
    const [speed, setSpeed] = useState(1.0);
    const [rules, setRules] = useState('');
    const [apiKey, setApiKey] = useState('');
    const [hasStoredApiKey, setHasStoredApiKey] = useState(false);
    const [apiKeyMasked, setApiKeyMasked] = useState('');
    const [apiKeyChanged, setApiKeyChanged] = useState(false);
    const [showApiKey, setShowApiKey] = useState(false);
    const [isRevealingApiKey, setIsRevealingApiKey] = useState(false);
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [testText, setTestText] = useState('');
    const [isPlaying, setIsPlaying] = useState(false);

    useEffect(() => {
        const loadConfig = async () => {
            try {
                const config = await getTtsConfig();
                setModel(config.model);
                setSpeed(config.default_speed);
                setRules(config.voice_rules || '');
                setApiKey('');
                setHasStoredApiKey(Boolean(config.has_api_key));
                setApiKeyMasked(config.api_key_masked || '');
                setApiKeyChanged(false);
                setShowApiKey(false);
            } catch {
                toast.error(copy.failedLoad);
            } finally {
                setIsLoading(false);
            }
        };

        void loadConfig();
    }, [copy.failedLoad]);

    const handleSave = async () => {
        setIsSaving(true);
        try {
            const normalizedApiKey = apiKey.trim();
            const apiKeyAction: 'keep' | 'set' | 'clear' = apiKeyChanged
                ? (normalizedApiKey ? 'set' : 'clear')
                : 'keep';

            await updateTtsConfig({
                model,
                default_speed: speed,
                voice_rules: rules,
                openai_api_key: normalizedApiKey,
                apiKeyAction,
            });

            if (apiKeyAction === 'set') {
                setHasStoredApiKey(true);
                setApiKeyMasked(`${normalizedApiKey.slice(0, 3)}...${normalizedApiKey.slice(-4)}`);
                setApiKey('');
                setApiKeyChanged(false);
                setShowApiKey(false);
            } else if (apiKeyAction === 'clear') {
                setHasStoredApiKey(false);
                setApiKeyMasked('');
                setApiKey('');
                setApiKeyChanged(false);
                setShowApiKey(false);
            }

            toast.success(copy.settingsSaved);
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : copy.saveError;
            toast.error(message);
        } finally {
            setIsSaving(false);
        }
    };

    const fetchRevealedApiKey = async (): Promise<string> => {
        const response = await fetch('/api/admin/tts/api-key', {
            method: 'GET',
            cache: 'no-store',
            headers: { 'Cache-Control': 'no-store' },
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
            throw new Error(typeof payload?.error === 'string' ? payload.error : copy.revealError);
        }
        const key = typeof payload?.api_key === 'string' ? payload.api_key : '';
        if (!key) {
            throw new Error(copy.revealEmpty);
        }
        return key;
    };

    const handleRevealApiKey = async () => {
        try {
            setIsRevealingApiKey(true);
            const key = await fetchRevealedApiKey();
            setApiKey(key);
            setApiKeyChanged(false);
            setShowApiKey(true);
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : copy.revealError;
            toast.error(message);
        } finally {
            setIsRevealingApiKey(false);
        }
    };

    const handleCopyApiKey = async () => {
        try {
            setIsRevealingApiKey(true);
            const key = apiKey || await fetchRevealedApiKey();
            await navigator.clipboard.writeText(key);
            toast.success(copy.copied);
            if (!apiKey) {
                setApiKey(key);
                setApiKeyChanged(false);
                setShowApiKey(true);
            }
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : copy.revealError;
            toast.error(message);
        } finally {
            setIsRevealingApiKey(false);
        }
    };

    const handleTestVoice = async () => {
        if (!testText.trim()) return;
        setIsPlaying(true);
        try {
            const response = await fetch('/api/chat/tts-test', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    text: testText,
                    model,
                    speed,
                    rules,
                }),
            });

            if (!response.ok) throw new Error(copy.playError);

            const audioBlob = await response.blob();
            const url = URL.createObjectURL(audioBlob);
            const audio = new Audio(url);
            audio.onended = () => {
                setIsPlaying(false);
                URL.revokeObjectURL(url);
            };
            await audio.play();
        } catch (error) {
            console.error(error);
            toast.error(copy.playError);
            setIsPlaying(false);
        }
    };

    if (isLoading) {
        return <div className="p-20 text-center text-sm font-semibold text-slate-500">{copy.loading}</div>;
    }

    return (
        <div className="space-y-6">
            <AdminPageHeader
                variant="directory"
                eyebrow={lang === 'es' ? 'Administracion' : 'Administration'}
                title={copy.title}
                description={copy.subtitle}
                actions={(
                    <Button
                        onClick={handleSave}
                        disabled={isSaving}
                        className="h-11 rounded-2xl px-5 text-sm font-semibold shadow-sm"
                    >
                        <Save className="mr-2 h-4 w-4" />
                        {copy.save}
                    </Button>
                )}
            />

            <div className="grid gap-6 xl:grid-cols-[minmax(0,1.15fr)_360px]">
                <AdminPanel
                    variant="section"
                    title={copy.rulesTitle}
                    description={copy.rulesDescription}
                    contentClassName="space-y-4"
                >
                    <Textarea
                        value={rules}
                        onChange={(event) => setRules(event.target.value)}
                        placeholder={copy.rulesPlaceholder}
                        className="min-h-[260px] rounded-2xl border-slate-200 bg-white px-4 py-3 text-sm leading-6"
                    />
                    <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                        {copy.archetypeNote}
                    </div>
                </AdminPanel>

                <div className="space-y-6">
                    <AdminPanel
                        variant="section"
                        title={(
                            <span className="inline-flex items-center gap-2">
                                <Volume2 className="h-4 w-4 text-primary" />
                                {copy.technicalTitle}
                            </span>
                        )}
                        description={copy.technicalDescription}
                        contentClassName="space-y-5"
                    >
                        <div className="space-y-2">
                            <Label className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-500">
                                {copy.model}
                            </Label>
                            <Input
                                value={model}
                                onChange={(event) => setModel(event.target.value)}
                                className="h-11 rounded-2xl border-slate-200 bg-white font-mono text-sm"
                                placeholder="tts-1"
                            />
                            <p className="text-xs text-slate-500">{copy.modelHint}</p>
                        </div>

                        <div className="space-y-3">
                            <Label className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-500">
                                {copy.speed}
                            </Label>
                            <div className="flex items-center gap-4">
                                <Input
                                    type="range"
                                    min="0.25"
                                    max="4.0"
                                    step="0.05"
                                    value={speed}
                                    onChange={(event) => setSpeed(Number(event.target.value))}
                                    className="flex-1"
                                />
                                <span className="w-12 text-right font-mono text-sm font-semibold text-slate-700">
                                    {speed.toFixed(2)}
                                </span>
                            </div>
                        </div>

                        <div className="space-y-3 border-t border-slate-200 pt-5">
                            <Label className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-500">
                                {copy.apiKey}
                            </Label>
                            <div className="relative">
                                <Input
                                    type={showApiKey ? 'text' : 'password'}
                                    value={apiKey}
                                    onChange={(event) => {
                                        setApiKey(event.target.value);
                                        setApiKeyChanged(true);
                                    }}
                                    className="h-11 rounded-2xl border-slate-200 bg-white pr-20 font-mono text-sm"
                                    placeholder={hasStoredApiKey
                                        ? (apiKeyMasked || (lang === 'es' ? 'Guardada (oculta)' : 'Saved (hidden)'))
                                        : 'sk-...'}
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowApiKey((prev) => !prev)}
                                    className="absolute right-3 top-2.5 text-slate-400 transition-colors hover:text-slate-600"
                                    aria-label={showApiKey ? copy.hide : copy.reveal}
                                >
                                    {showApiKey ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                                </button>
                            </div>
                            <div className="flex gap-2">
                                <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    className="h-9 rounded-xl border-slate-200 px-3 text-xs font-semibold"
                                    disabled={!hasStoredApiKey || isRevealingApiKey}
                                    onClick={handleRevealApiKey}
                                >
                                    <Eye className="mr-1.5 h-3.5 w-3.5" />
                                    {copy.reveal}
                                </Button>
                                <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    className="h-9 rounded-xl border-slate-200 px-3 text-xs font-semibold"
                                    disabled={!hasStoredApiKey || isRevealingApiKey}
                                    onClick={handleCopyApiKey}
                                >
                                    <Copy className="mr-1.5 h-3.5 w-3.5" />
                                    Copy
                                </Button>
                            </div>
                            <p className="text-xs leading-5 text-slate-500">{copy.apiKeyHint}</p>
                        </div>
                    </AdminPanel>

                    <AdminPanel
                        variant="section"
                        title={(
                            <span className="inline-flex items-center gap-2">
                                <Mic className="h-4 w-4 text-primary" />
                                {copy.audioTestTitle}
                            </span>
                        )}
                        description={copy.audioTestDescription}
                        contentClassName="space-y-4"
                    >
                        <Textarea
                            value={testText}
                            onChange={(event) => setTestText(event.target.value)}
                            placeholder={copy.testPlaceholder}
                            className="min-h-[140px] rounded-2xl border-slate-200 bg-white px-4 py-3 text-sm leading-6"
                        />
                        <Button
                            onClick={handleTestVoice}
                            disabled={isPlaying || !testText.trim()}
                            className="h-11 w-full rounded-2xl px-4 text-sm font-semibold"
                        >
                            {isPlaying ? copy.testing : copy.testAction}
                        </Button>
                    </AdminPanel>
                </div>
            </div>
        </div>
    );
}

export default function VoiceSettingsPage() {
    return (
        <Suspense fallback={<div className="p-20 text-center text-sm font-semibold text-slate-500">Loading...</div>}>
            <VoiceSettingsEditor />
        </Suspense>
    );
}
