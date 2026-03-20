'use client';

import { Suspense, useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { HelpCircle, Save, Mic, Volume2, Eye, EyeOff, Copy } from 'lucide-react';
import { toast } from 'sonner';
import { getTtsConfig, updateTtsConfig } from '@/app/actions/tts-config';
import { useLanguage } from '@/components/providers/i18n-context';

function VoiceSettingsEditor() {
    const { lang } = useLanguage();
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
                toast.error('Failed to load voice configuration');
            } finally {
                setIsLoading(false);
            }
        };
        loadConfig();
    }, []);

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
            toast.success(lang === 'es' ? 'Configuración guardada' : 'Settings saved');
            } catch (error: unknown) {
                const message = error instanceof Error ? error.message : 'Failed to save settings';
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
            throw new Error(typeof payload?.error === 'string'
                ? payload.error
                : (lang === 'es' ? 'No se pudo revelar la API key de TTS.' : 'Failed to reveal TTS API key.'));
        }
        const key = typeof payload?.api_key === 'string' ? payload.api_key : '';
        if (!key) {
            throw new Error(lang === 'es' ? 'No hay API key de TTS configurada.' : 'TTS API key is not configured.');
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
            const message = error instanceof Error ? error.message : 'Failed to reveal API key';
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
            toast.success(lang === 'es' ? 'API key copiada' : 'API key copied');
            if (!apiKey) {
                setApiKey(key);
                setApiKeyChanged(false);
                setShowApiKey(true);
            }
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : 'Failed to copy API key';
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
                    rules
                }),
            });

            if (!response.ok) throw new Error('TTS Failed');

            const audioBlob = await response.blob();
            const url = URL.createObjectURL(audioBlob);
            const audio = new Audio(url);
            audio.onended = () => {
                setIsPlaying(false);
                URL.revokeObjectURL(url);
            };
            await audio.play();
        } catch (e) {
            console.error(e);
            toast.error('Failed to play test audio');
            setIsPlaying(false);
        }
    };

    if (isLoading) {
        return <div className="p-20 text-center text-slate-400 animate-pulse">Loading settings...</div>;
    }

    return (
        <div className="space-y-6 animate-in fade-in duration-700 max-w-4xl mx-auto pb-20">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
                <div>
                    <h1 className="text-4xl font-black tracking-tighter text-slate-900 flex items-center gap-3">
                        {lang === 'es' ? 'Configuración de Voz (TTS)' : 'Voice Settings (TTS)'}
                    </h1>
                    <p className="text-slate-500 mt-2 font-bold uppercase tracking-widest text-[10px]">
                        {lang === 'es' ? 'Control Global y Reglas de Comportamiento' : 'Global Control & Behavioral Rules'}
                    </p>
                </div>
                <Button
                    onClick={handleSave}
                    disabled={isSaving}
                    className="bg-primary hover:bg-primary/90 text-white shadow-xl shadow-primary/20 h-10 px-8 rounded-xl font-black text-sm group"
                >
                    <Save className="mr-2 h-4 w-4 group-hover:scale-110 transition-transform" />
                    {lang === 'es' ? 'Guardar Cambios' : 'Save Changes'}
                </Button>
            </div>

            <div className="grid gap-6 md:grid-cols-2">
                <Card className="bg-white shadow-sm border-slate-200 rounded-[2rem] overflow-hidden">
                    <CardHeader className="bg-slate-50 border-b border-slate-100 pb-5">
                        <CardTitle className="text-lg font-black text-slate-900 flex items-center gap-2">
                            <Volume2 className="h-5 w-5 text-primary" />
                            {lang === 'es' ? 'Parámetros Técnicos' : 'Technical Parameters'}
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="pt-6 space-y-6">
                        <div className="space-y-2">
                            <Label className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">
                                {lang === 'es' ? 'Modelo OpenAI' : 'OpenAI Model'}
                            </Label>
                            <Input
                                value={model}
                                onChange={(e) => setModel(e.target.value)}
                                className="bg-slate-50 border-slate-200 h-11 rounded-xl font-mono text-sm"
                                placeholder="Example: tts-1"
                            />
                            <p className="text-[10px] text-slate-400">
                                {lang === 'es' ? 'ID del modelo de audio a utilizar.' : 'ID of the audio model to use.'}
                            </p>
                        </div>

                        <div className="space-y-2">
                            <Label className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">
                                {lang === 'es' ? 'Velocidad de Habla' : 'Speech Speed'}
                            </Label>
                            <div className="flex items-center gap-4">
                                <Input
                                    type="range"
                                    min="0.25"
                                    max="4.0"
                                    step="0.05"
                                    value={speed}
                                    onChange={(e) => setSpeed(Number(e.target.value))}
                                    className="flex-1"
                                />
                                <span className="w-12 text-right font-mono text-sm font-bold text-slate-700">{speed.toFixed(2)}</span>
                            </div>
                        </div>

                        <div className="space-y-2 pt-4 border-t border-slate-100">
                            <Label className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">
                                {lang === 'es' ? 'OpenAI API Key' : 'OpenAI API Key'}
                            </Label>
                            <div className="relative">
                                <Input
                                    type={showApiKey ? 'text' : 'password'}
                                    value={apiKey}
                                    onChange={(e) => {
                                        setApiKey(e.target.value);
                                        setApiKeyChanged(true);
                                    }}
                                    className="bg-slate-50 border-slate-200 h-11 rounded-xl font-mono text-sm pr-20"
                                    placeholder={hasStoredApiKey
                                        ? (apiKeyMasked || (lang === 'es' ? 'Guardada (oculta)' : 'Saved (hidden)'))
                                        : 'sk-...'}
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowApiKey((prev) => !prev)}
                                    className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-600"
                                    aria-label={showApiKey
                                        ? (lang === 'es' ? 'Ocultar API key' : 'Hide API key')
                                        : (lang === 'es' ? 'Mostrar API key' : 'Show API key')}
                                >
                                    {showApiKey ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                                </button>
                            </div>
                            <div className="flex gap-2">
                                <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    className="h-8 text-[10px]"
                                    disabled={!hasStoredApiKey || isRevealingApiKey}
                                    onClick={handleRevealApiKey}
                                >
                                    <Eye className="h-3.5 w-3.5 mr-1" />
                                    {lang === 'es' ? 'Revelar' : 'Reveal'}
                                </Button>
                                <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    className="h-8 text-[10px]"
                                    disabled={!hasStoredApiKey || isRevealingApiKey}
                                    onClick={handleCopyApiKey}
                                >
                                    <Copy className="h-3.5 w-3.5 mr-1" />
                                    Copy
                                </Button>
                            </div>
                            <p className="text-[10px] text-slate-400">
                                {lang === 'es'
                                    ? 'Se guarda encriptada. Si la dejas vacía y guardas, se borra.'
                                    : 'Stored encrypted. If left empty and saved, the key is cleared.'}
                            </p>
                        </div>
                    </CardContent>
                </Card>

                <Card className="bg-white shadow-sm border-slate-200 rounded-[2rem] overflow-hidden">
                    <CardHeader className="bg-slate-50 border-b border-slate-100 pb-5">
                        <CardTitle className="text-lg font-black text-slate-900 flex items-center gap-2">
                            <Mic className="h-5 w-5 text-primary" />
                            {lang === 'es' ? 'Prueba de Audio' : 'Audio Test'}
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="pt-6 space-y-4">
                        <Textarea
                            value={testText}
                            onChange={(e) => setTestText(e.target.value)}
                            placeholder={lang === 'es' ? 'Escribe algo para probar la voz...' : 'Type something to test the voice...'}
                            className="bg-slate-50 border-slate-200 min-h-[100px] rounded-xl resize-none"
                        />
                        <Button
                            onClick={handleTestVoice}
                            disabled={isPlaying || !testText.trim()}
                            className="w-full bg-slate-900 text-white hover:bg-slate-800 h-11 rounded-xl font-bold text-xs"
                        >
                            {isPlaying
                                ? (lang === 'es' ? 'Reproduciendo...' : 'Playing...')
                                : (lang === 'es' ? 'Generar y Escuchar' : 'Generate & Listen')}
                        </Button>
                    </CardContent>
                </Card>
            </div>

            <Card className="bg-white shadow-sm border-slate-200 rounded-[2rem] overflow-hidden">
                <CardHeader className="bg-slate-50 border-b border-slate-100 pb-5">
                    <CardTitle className="text-lg font-black text-slate-900 flex items-center gap-2">
                        <HelpCircle className="h-5 w-5 text-primary" />
                        {lang === 'es' ? 'Reglas de Comportamiento' : 'Behavioral Rules'}
                    </CardTitle>
                    <CardDescription className="text-xs text-slate-500">
                        {lang === 'es'
                            ? 'Instrucciones naturales para definir el estilo de habla general (System Prompt para TTS).'
                            : 'Natural instructions to define the general speaking style (System Prompt for TTS).'}
                    </CardDescription>
                </CardHeader>
                <CardContent className="pt-6">
                    <Textarea
                        value={rules}
                        onChange={(e) => setRules(e.target.value)}
                        placeholder="Example: Speak slowly and clearly. Use a warm and professional tone. Avoid filler words."
                        className="bg-slate-50 border-slate-200 min-h-[200px] rounded-xl font-mono text-sm leading-relaxed p-4"
                    />
                    <div className="mt-4 p-4 bg-yellow-50 border border-yellow-100 rounded-xl text-yellow-800 text-xs">
                        <strong>Note:</strong>
                        {lang === 'es'
                            ? ' Si un bot tiene activado "Usar Arquetipo", la descripción de su personaje se añadirá automáticamente a estas reglas.'
                            : ' If a bot has "Use Archetype" enabled, its character description will be automatically appended to these rules.'}
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}

export default function VoiceSettingsPage() {
    return (
        <Suspense fallback={<div className="p-20 text-center animate-pulse">Loading...</div>}>
            <VoiceSettingsEditor />
        </Suspense>
    );
}
