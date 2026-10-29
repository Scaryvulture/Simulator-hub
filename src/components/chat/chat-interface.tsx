'use client';

import { useState, useEffect, useRef, useCallback, useMemo, memo, type PointerEvent as ReactPointerEvent, type SyntheticEvent } from 'react';
import dynamic from 'next/dynamic';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Send, RefreshCcw, Sparkles, User, Play, FileSignature, Mic, MicOff, Volume2, VolumeX, ImagePlus, Camera, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { runEvaluation } from '@/app/actions/evaluation';
import { toast } from 'sonner';
import { useLanguage } from '@/components/providers/i18n-context';
import { isEvaluationResult, type PublicEvaluationResult } from '@/lib/evaluation-result';
import { resolveChatPrimaryAction } from '@/lib/chat-primary-action';
import {
    classifyVoiceInputStartFailure,
    detectVoiceInputUnavailableReason,
    type VoiceInputEnvironment,
    type VoiceInputStartFailureReason,
    type VoiceInputUnavailableReason,
} from '@/lib/voice-input-support';

interface Props {
    bot: PublicChatBot;
    organizations?: Array<{ id: string; name: string }>;
    userId?: string;
    viewerRole: 'ADMIN' | 'ORG_ADMIN' | 'USER';
    requireAuth?: boolean;
    forceNewSession?: boolean;
    displayMode?: 'standard' | 'lti_embedded';
}

interface ChatMessage {
    role: 'user' | 'assistant' | 'system';
    content: string;
    images?: ChatImage[];
    timestamp: string;
}

interface ChatImage {
    mime_type: string;
    data_url?: string;
}

interface PublicChatBot {
    id: string;
    name: string;
    bot_type?: string;
    logo?: string | null;
    config?: {
        logo_url?: string;
        evaluator_bot_id?: string;
        chat_features?: {
            allow_image_upload?: boolean;
            allow_voice_input?: boolean;
            allow_voice_output?: boolean;
            tts_settings?: {
                speed?: number;
                voice?: string;
                accent?: string;
                gender?: 'female' | 'male' | 'neutral' | 'random';
                style?: string;
                use_archetype?: boolean;
            };
        };
    } | null;
}

type RunEvaluationActionResult = Awaited<ReturnType<typeof runEvaluation>>;
type EvaluationResult = PublicEvaluationResult;
type SttApiResponse = {
    transcript?: string;
    error?: string;
};
type SessionMessageResponse = {
    messages?: Array<{ role?: string; content?: string; images?: ChatImage[]; created_at?: string }>;
    ended?: boolean;
    evaluation?: PublicEvaluationResult | null;
    bot?: PublicChatBot;
};

const MAX_IMAGES_PER_MESSAGE = 3;
const MAX_IMAGE_BYTES = 5_000_000;
const ALLOWED_IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp']);
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const LEGACY_ID_REGEX = /^[A-Za-z0-9][A-Za-z0-9_-]{7,63}$/;
const DEFAULT_BOT_AVATAR = '/icons/assistant.svg';

const EvaluationResultModal = dynamic(
    () => import('./evaluation-result-modal').then((mod) => mod.EvaluationResultModal),
    { loading: () => null }
);
const CameraCaptureModal = dynamic(
    () => import('./camera-capture-modal').then((mod) => mod.CameraCaptureModal),
    { ssr: false, loading: () => null }
);

function getErrorMessage(error: unknown): string {
    return error instanceof Error ? error.message : 'Unknown error';
}

function isExpectedAudioPlaybackError(error: unknown): boolean {
    if (!(error instanceof Error)) return false;
    const domName = (error as { name?: string }).name;
    const message = error.message?.toLowerCase?.() || '';
    return domName === 'AbortError'
        || domName === 'NotAllowedError'
        || message.includes('play() request was interrupted')
        || message.includes('notallowederror')
        || message.includes('the element has no supported sources');
}

function readFileAsDataUrl(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ''));
        reader.onerror = () => reject(new Error('Failed to read file'));
        reader.readAsDataURL(file);
    });
}

function cleanTextForSpeech(text: string): string {
    return (text || '')
        .replace(/!\[[^\]]*]\([^)]+\)/g, ' ')
        .replace(/\[[^\]]+]\([^)]+\)/g, ' ')
        .replace(/[`*_>#]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function isValidUuid(value: string): boolean {
    return UUID_REGEX.test(value);
}

function isValidEntityId(value: string): boolean {
    return UUID_REGEX.test(value) || LEGACY_ID_REGEX.test(value);
}

async function readApiError(response: Response, fallback: string): Promise<string> {
    const payload = await response.json().catch(() => ({}));
    return typeof payload?.error === 'string' ? payload.error : fallback;
}

function isEmbeddedWindow(): boolean {
    if (typeof window === 'undefined') return false;
    try {
        return window.self !== window.top;
    } catch {
        return true;
    }
}

function getMicrophonePolicyAllowance(): boolean | null {
    if (typeof document === 'undefined') return null;

    const docWithPolicy = document as Document & {
        permissionsPolicy?: { allowsFeature?: (feature: string) => boolean };
        featurePolicy?: { allowsFeature?: (feature: string) => boolean };
    };
    const policy = docWithPolicy.permissionsPolicy ?? docWithPolicy.featurePolicy;
    if (!policy || typeof policy.allowsFeature !== 'function') {
        return null;
    }

    try {
        return policy.allowsFeature('microphone');
    } catch {
        return null;
    }
}

function getVoiceInputEnvironment(): VoiceInputEnvironment {
    if (typeof window === 'undefined') {
        return {
            hasMediaDevicesApi: false,
            hasMediaRecorder: false,
            isSecureContext: false,
            isEmbedded: false,
            policyAllowsMicrophone: null,
        };
    }

    return {
        hasMediaDevicesApi: Boolean(navigator.mediaDevices?.getUserMedia),
        hasMediaRecorder: typeof window.MediaRecorder !== 'undefined',
        isSecureContext: window.isSecureContext,
        isEmbedded: isEmbeddedWindow(),
        policyAllowsMicrophone: getMicrophonePolicyAllowance(),
    };
}

function getGoogleDriveId(url: string): string | null {
    const patterns = [
        /\/file\/d\/([a-zA-Z0-9_-]+)/,
        /\/uc\?id=([a-zA-Z0-9_-]+)/,
        /\/open\?id=([a-zA-Z0-9_-]+)/
    ];
    for (const pattern of patterns) {
        const match = url.match(pattern);
        if (match && match[1]) return match[1];
    }
    return null;
}

function isLikelyMediaUrl(url: string): boolean {
    if (getGoogleDriveId(url)) return true;
    return /\.(png|jpe?g|webp|gif|bmp|svg|mp4|webm|mov)(\?.*)?$/i.test(url);
}

function sanitizeMessageForUi(content: string): string {
    const normalized = String(content || '');
    const lines = normalized.split('\n').filter((line) => {
        const plain = line
            .replace(/[*_`>#-]/g, ' ')
            .replace(/\s+/g, ' ')
            .trim()
            .toLowerCase();
        if (!plain) return true;
        if (plain.startsWith('referencia visual')) return false;
        if (plain.startsWith('imagen de ejemplo')) return false;
        if (plain.startsWith('ejemplo de imagen')) return false;
        return true;
    });

    return lines
        .join('\n')
        .replace(/(^|\n)\s*referencia\s*:\s*/gi, '$1')
        .replace(/\[(CR[ÍI]TICO\s*[-–]\s*BLOQUEA|ADVERTENCIA\s*[-–]\s*REVISAR|OK\s*[-–]\s*HABILITADO|INFO(?:RMACI[ÓO]N)?\s*INSUFICIENTE)\]/gi, '$1')
        .replace(/\[(\d+)\]/g, '')
        .replace(/\((ref|source|fuente)\)/gi, '')
        .replace(/\s+\n/g, '\n');
}

const RenderedMessage = memo(function RenderedMessage({ content }: { content: string }) {
    const safeContent = sanitizeMessageForUi(content);
    const mdImageRegex = /(!\[.*?\]\((https?:\/\/[^\s\)]+)\))/g;
    const parts = safeContent.split(mdImageRegex);

    const elements: JSX.Element[] = [];
    let i = 0;
    while (i < parts.length) {
        const part = parts[i];

        if (i % 3 === 0) {
            if (part) {
                const urlRegex = /(https?:\/\/[^\s]+)/g;
                const subParts = part.split(urlRegex);

                subParts.forEach((subPart, j) => {
                    if (subPart.match(urlRegex)) {
                        const url = subPart;
                        const driveId = getGoogleDriveId(url);
                        if (driveId || isLikelyMediaUrl(url)) {
                            const previewUrl = `https://drive.google.com/file/d/${driveId}/preview`;
                            elements.push(
                                <span key={`${i}-${j}`} className="block my-2">
                                    {driveId ? (
                                        <iframe
                                            src={previewUrl}
                                            className="w-full max-w-sm h-64 rounded-xl border border-white/10 bg-black/50"
                                            allow="autoplay"
                                            sandbox="allow-scripts allow-same-origin allow-popups"
                                            referrerPolicy="no-referrer"
                                            loading="lazy"
                                        />
                                    ) : (
                                        // eslint-disable-next-line @next/next/no-img-element
                                        <img
                                            src={url}
                                            alt="Referencia"
                                            className="max-w-sm rounded-lg border border-white/10 shadow-lg"
                                            loading="lazy"
                                        />
                                    )}
                                </span>
                            );
                        } else {
                            elements.push(
                                <a key={`${i}-${j}`} href={url} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                                    {url}
                                </a>
                            );
                        }
                    } else {
                        elements.push(<span key={`${i}-${j}`}>{subPart}</span>);
                    }
                });
            }
        } else if (i % 3 === 2) {
            const url = part;
            const driveId = getGoogleDriveId(url);

            if (driveId) {
                const previewUrl = `https://drive.google.com/file/d/${driveId}/preview`;
                elements.push(
                    <span key={i} className="block my-2">
                        <iframe
                            src={previewUrl}
                            className="w-full max-w-sm h-64 rounded-xl border border-white/10 bg-black/50 shadow-lg"
                            allow="autoplay"
                            sandbox="allow-scripts allow-same-origin allow-popups"
                            referrerPolicy="no-referrer"
                            loading="lazy"
                        />
                    </span>
                );
            } else {
                elements.push(
                    <span key={i} className="block my-2">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                            src={url}
                            alt="Chat attachment"
                            className="max-w-sm rounded-lg border border-white/10 shadow-lg"
                            loading="lazy"
                        />
                    </span>
                );
            }
        }

        i++;
    }

    return (
        <span className="whitespace-pre-wrap leading-relaxed">
            {elements}
        </span>
    );
});

type ChatMessageRowProps = {
    msg: ChatMessage;
    botName: string;
    botLogo?: string | null;
    lang: 'es' | 'en';
};

const ChatMessageRow = memo(function ChatMessageRow({ msg, botName, botLogo, lang }: ChatMessageRowProps) {
    const formattedTime = useMemo(() => (
        new Intl.DateTimeFormat(lang === 'es' ? 'es-AR' : 'en-US', {
            hour: '2-digit',
            minute: '2-digit',
            hour12: false,
        }).format(new Date(msg.timestamp))
    ), [lang, msg.timestamp]);

    const assistantLogo = botLogo || DEFAULT_BOT_AVATAR;
    const renderableImages = (msg.images || []).filter((img) => typeof img.data_url === 'string' && img.data_url.length > 0);

    return (
        <div
            className={cn(
                'flex w-full animate-in fade-in slide-in-from-bottom-2 duration-300',
                msg.role === 'user' ? 'justify-end' : 'justify-start'
            )}
        >
            <div className={cn(
                'flex max-w-[85%] gap-3',
                msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'
            )}>
                <div className={cn(
                    'mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border shadow-sm',
                    msg.role === 'user'
                        ? 'border-primary/20 bg-primary/10 text-primary'
                        : 'border-slate-200 bg-slate-100 text-slate-500'
                )}>
                    {msg.role === 'user' ? (
                        <User className="w-4 h-4" />
                    ) : (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                            src={assistantLogo}
                            alt={botName}
                            className="w-4 h-4 object-contain"
                            onError={(e) => { (e.target as HTMLImageElement).src = DEFAULT_BOT_AVATAR; }}
                        />
                    )}
                </div>
                <div
                    className={cn(
                        'flex flex-col gap-1 rounded-2xl px-5 py-3 text-sm shadow-sm',
                        msg.role === 'user'
                            ? 'rounded-tr-none bg-primary text-primary-foreground'
                            : 'rounded-tl-none border border-slate-200 bg-white text-slate-800'
                    )}
                >
                    {renderableImages.length > 0 && (
                        <div className="grid grid-cols-2 gap-2 mb-2">
                            {renderableImages.map((img, idx) => (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img
                                    key={`${idx}-${(img.data_url || '').slice(0, 12)}`}
                                    src={img.data_url}
                                    alt="Attachment"
                                    className="h-24 w-full rounded-lg border border-slate-200 object-cover"
                                    loading="lazy"
                                />
                            ))}
                        </div>
                    )}
                    <RenderedMessage content={msg.content} />
                    <span className={cn(
                        'mt-1 self-end font-mono text-[9px] uppercase tracking-tighter',
                        msg.role === 'user' ? 'opacity-70' : 'text-slate-400'
                    )}>
                        {formattedTime}
                    </span>
                </div>
            </div>
        </div>
    );
});

type ChatMessagesListProps = {
    messages: ChatMessage[];
    isLoading: boolean;
    botName: string;
    botLogo?: string | null;
    lang: 'es' | 'en';
};

const ChatMessagesList = memo(function ChatMessagesList({
    messages,
    isLoading,
    botName,
    botLogo,
    lang,
}: ChatMessagesListProps) {
    const assistantLogo = botLogo || DEFAULT_BOT_AVATAR;

    return (
        <>
            {messages.map((msg, i) => (
                <ChatMessageRow
                    key={`${msg.timestamp}-${msg.role}-${i}`}
                    msg={msg}
                    botName={botName}
                    botLogo={assistantLogo}
                    lang={lang}
                />
            ))}
            {isLoading && (
                <div className="flex justify-start animate-in fade-in">
                    <div className="flex gap-3 max-w-[85%]">
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-slate-100">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                                src={assistantLogo}
                                alt={botName}
                                className="w-4 h-4 object-contain animate-pulse"
                                onError={(e) => { (e.target as HTMLImageElement).src = DEFAULT_BOT_AVATAR; }}
                            />
                        </div>
                        <div className="rounded-2xl rounded-tl-none border border-slate-200 bg-white px-5 py-4">
                            <span className="flex space-x-1.5 h-2 items-center">
                                <span className="w-2 h-2 bg-primary/40 rounded-full animate-bounce [animation-delay:-0.3s]" />
                                <span className="w-2 h-2 bg-primary/40 rounded-full animate-bounce [animation-delay:-0.15s]" />
                                <span className="w-2 h-2 bg-primary/40 rounded-full animate-bounce" />
                            </span>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
});

export function ChatInterface({
    bot: initialBot,
    organizations = [],
    userId,
    viewerRole,
    requireAuth = false,
    forceNewSession = false,
    displayMode = 'standard',
}: Props) {
    const { lang } = useLanguage();
    const [bot, setBot] = useState(initialBot);
    const [organizationId, setOrganizationId] = useState(organizations.length === 1 ? organizations[0].id : '');
    const pendingSendRef = useRef<{ id: string; message: string; images: ChatImage[] } | null>(null);
    const [sendError, setSendError] = useState<string | null>(null);
    const sendingRef = useRef(false);
    const preferredBotLogo = bot.logo || bot.config?.logo_url || DEFAULT_BOT_AVATAR;
    const isLtiEmbedded = displayMode === 'lti_embedded';
    const sessionStorageKey = useMemo(() => `session_${userId || "anonymous"}_${bot.id}`, [bot.id, userId]);

    const chatFeatures = {
        allow_image_upload: Boolean(bot.config?.chat_features?.allow_image_upload),
        allow_voice_input: bot.config?.chat_features?.allow_voice_input !== false,
        allow_voice_output: bot.config?.chat_features?.allow_voice_output !== false,
    };
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [input, setInput] = useState('');
    const [selectedImages, setSelectedImages] = useState<ChatImage[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [sessionId, setSessionId] = useState<string | null>(null);
    const [sessionEnded, setSessionEnded] = useState(false);
    const [hasStarted, setHasStarted] = useState(false);
    const [ttsEnabled, setTtsEnabled] = useState(false);
    const [sttSupported, setSttSupported] = useState(false);
    const [voiceInputUnavailableReason, setVoiceInputUnavailableReason] = useState<VoiceInputUnavailableReason | null>(null);
    const [isEndingSession, setIsEndingSession] = useState(false);
    const [isListening, setIsListening] = useState(false);
    const [isTranscribing, setIsTranscribing] = useState(false);
    const scrollRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement | null>(null);
    const initCalledRef = useRef(false);
    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const mediaStreamRef = useRef<MediaStream | null>(null);
    const audioChunksRef = useRef<BlobPart[]>([]);
    const recordingStartedAtRef = useRef<number>(0);
    const skipTranscriptionRef = useRef(false);
    const audioRef = useRef<HTMLAudioElement | null>(null);
    const audioUrlRef = useRef<string | null>(null);
    const ttsRequestIdRef = useRef(0);
    const ttsAutoplayWarnedRef = useRef(false);
    const galleryInputRef = useRef<HTMLInputElement>(null);
    const voicePressActiveRef = useRef(false);
    const activeVoicePointerIdRef = useRef<number | null>(null);
    const ltiOutcomeRetrySessionRef = useRef<string | null>(null);
    const [headerBotLogoSrc, setHeaderBotLogoSrc] = useState(preferredBotLogo);
    const focusTextInput = useCallback(() => {
        if (!hasStarted || sessionEnded) return;
        inputRef.current?.focus();
    }, [hasStarted, sessionEnded]);

    const [isEvaluating, setIsEvaluating] = useState(false);
    const [showEvaluation, setShowEvaluation] = useState(false);
    const [evaluationResult, setEvaluationResult] = useState<EvaluationResult | null>(null);

    const [showCamera, setShowCamera] = useState(false);
    const copy = lang === 'es'
        ? {
            eval_done: 'Evaluación completada',
            eval_error: 'Error al evaluar: ',
            fallback_hello: '¡Hola! ¿En qué puedo ayudarte?',
            session_ended: 'Sesión finalizada',
            session_active: 'Sesión activa',
            evaluating: 'Evaluando...',
            evaluate: 'Evaluar',
            reevaluate: 'Reevaluar',
            view_evaluation: 'Ver evaluación',
            reset_session: 'Reiniciar sesión',
            end_session: 'Finalizar',
            end_session_confirm: 'Esto cerrará la sesión actual y bloqueará nuevos mensajes. ¿Quieres continuar?',
            evaluate_and_end_confirm: 'Esto finalizará la sesión actual y lanzará la evaluación. ¿Quieres continuar?',
            end_session_done: 'Sesión finalizada.',
            end_session_error: 'No se pudo finalizar la sesión.',
            manager: 'Práctica guiada',
            start_hint: 'Presioná el botón para iniciar la conversación.',
            starting: 'Iniciando...',
            start_chat: 'Iniciar conversación',
            eval_already_done: 'Esta conversación ya estaba evaluada.',
            eval_rerun_done: 'Reevaluación completada.',
            lti_grade_synced: 'La nota se guardó en la LMS.',
            lti_grade_sync_failed: 'La evaluación se guardó, pero no se pudo enviar la nota a la LMS.',
            input_ended: 'Sesión finalizada. Presioná reiniciar para comenzar otra.',
            input_active: 'Escribí tu respuesta al simulador...',
            image_only: '',
            upload_gallery: 'Galería',
            upload_camera: 'Cámara',
            image_limit: 'Máximo 3 imágenes por mensaje.',
            image_type_error: 'Formato no soportado. Usa PNG, JPG o WEBP.',
            image_size_error: 'Imagen demasiado grande. Máximo 5 MB.',
            voice_not_supported: 'Tu navegador no soporta grabación de voz.',
            voice_embed_blocked: 'El micrófono está bloqueado dentro del contenido embebido. En LTI/Totara hay que abrir la actividad en una ventana nueva o permitir `microphone` en el iframe.',
            voice_https_required: 'El micrófono solo funciona desde una conexión segura (HTTPS).',
            voice_permission_denied: 'El navegador bloqueó el permiso del micrófono. Revísalo desde el candado de la barra de direcciones.',
            voice_no_microphone: 'No encontramos un micrófono disponible en este dispositivo.',
            voice_requires_session: 'Primero inicia la conversación para usar voz.',
            hold_to_talk: 'Mantén presionado para hablar',
            stt_error: 'No se pudo transcribir el audio.',
            listening: 'Escuchando...',
            transcribing: 'Transcribiendo...',
            speak_on: 'Voz ON',
            speak_off: 'Voz OFF',
            tts_error: 'No se pudo generar el audio de respuesta.',
            flow_engine: 'Motor de flujo',
        }
        : {
            eval_done: 'Evaluation completed',
            eval_error: 'Evaluation error: ',
            fallback_hello: 'Hi! How can I help you?',
            session_ended: 'Session ended',
            session_active: 'Active session',
            evaluating: 'Evaluating...',
            evaluate: 'Evaluate',
            reevaluate: 'Re-evaluate',
            view_evaluation: 'View evaluation',
            reset_session: 'Reset session',
            end_session: 'End session',
            end_session_confirm: 'This will close the current session and block new messages. Do you want to continue?',
            evaluate_and_end_confirm: 'This will close the current session and start the evaluation. Do you want to continue?',
            end_session_done: 'Session ended.',
            end_session_error: 'Unable to end the session.',
            manager: 'Guided practice',
            start_hint: 'Press the button to start the conversation.',
            starting: 'Starting...',
            start_chat: 'Start conversation',
            eval_already_done: 'This conversation had already been evaluated.',
            eval_rerun_done: 'Re-evaluation completed.',
            lti_grade_synced: 'The grade was saved to the LMS.',
            lti_grade_sync_failed: 'The evaluation was saved, but the grade could not be sent to the LMS.',
            input_ended: 'Session ended. Press reset to start over.',
            input_active: 'Type your response to the simulator...',
            image_only: '[Attached image]',
            upload_gallery: 'Gallery',
            upload_camera: 'Camera',
            image_limit: 'Maximum 3 images per message.',
            image_type_error: 'Unsupported format. Use PNG, JPG, or WEBP.',
            image_size_error: 'Image too large. Max 5 MB.',
            voice_not_supported: 'Your browser does not support voice recording.',
            voice_embed_blocked: 'Microphone access is blocked inside this embedded view. In LTI/LMS launches, open the activity in a new window or allow `microphone` on the iframe.',
            voice_https_required: 'Microphone access only works from a secure HTTPS connection.',
            voice_permission_denied: 'The browser blocked microphone permission. Check the site permission in the address bar.',
            voice_no_microphone: 'No microphone was found on this device.',
            voice_requires_session: 'Start the conversation first to use voice.',
            hold_to_talk: 'Hold to talk',
            stt_error: 'Unable to transcribe audio.',
            listening: 'Listening...',
            transcribing: 'Transcribing...',
            speak_on: 'Voice ON',
            speak_off: 'Voice OFF',
            tts_error: 'Unable to generate response audio.',
            flow_engine: 'Flow engine',
        };

    const readStoredSessionId = useCallback(() => {
        if (typeof window === 'undefined') return null;
        try {
            return sessionStorage.getItem(sessionStorageKey);
        } catch {
            return null;
        }
    }, [sessionStorageKey]);

    const persistSessionId = useCallback((nextSessionId: string) => {
        if (typeof window === 'undefined') return;
        try {
            sessionStorage.setItem(sessionStorageKey, nextSessionId);
        } catch {
            // Keep the current session if browser storage is unavailable.
        }
    }, [sessionStorageKey]);

    const clearStoredSessionId = useCallback(() => {
        if (typeof window === 'undefined') return;
        try {
            sessionStorage.removeItem(sessionStorageKey);
        } catch {
            // Keep the UI usable if browser storage is unavailable.
        }
    }, [sessionStorageKey]);

    const stopAudioPlayback = useCallback(() => {
        if (audioRef.current) {
            audioRef.current.pause();
            audioRef.current = null;
        }
        if (audioUrlRef.current) {
            URL.revokeObjectURL(audioUrlRef.current);
            audioUrlRef.current = null;
        }
    }, []);

    const redirectToLogin = useCallback(() => {
        if (typeof window === 'undefined') return;
        clearStoredSessionId();
        window.location.replace('/login');
    }, [clearStoredSessionId]);

    const handleAuthError = useCallback((message?: string, status?: number): boolean => {
        if (!requireAuth) return false;
        const normalized = (message || '').toLowerCase();
        const isAuthMessage = normalized.includes('authentication required')
            || normalized.includes('unauthorized')
            || normalized.includes('session expired')
            || normalized.includes('session timeout')
            || (normalized.includes('sesion') && normalized.includes('expir'));
        if (status === 401 || isAuthMessage) {
            redirectToLogin();
            return true;
        }
        return false;
    }, [requireAuth, redirectToLogin]);

    useEffect(() => {
        setTtsEnabled(false);
    }, [bot.id]);

    useEffect(() => {
        setHeaderBotLogoSrc(preferredBotLogo);
    }, [bot.id, preferredBotLogo]);

    const handleBotLogoError = useCallback((event: SyntheticEvent<HTMLImageElement>) => {
        const image = event.currentTarget;
        if (image.src.includes(DEFAULT_BOT_AVATAR)) return;
        image.onerror = null;
        setHeaderBotLogoSrc(DEFAULT_BOT_AVATAR);
    }, []);

    const getVoiceInputErrorMessage = useCallback((
        reason: VoiceInputUnavailableReason | VoiceInputStartFailureReason | null
    ): string => {
        switch (reason) {
            case 'embed_permission_policy':
                return copy.voice_embed_blocked;
            case 'insecure_context':
                return copy.voice_https_required;
            case 'permission_denied':
                return copy.voice_permission_denied;
            case 'no_microphone':
                return copy.voice_no_microphone;
            case 'browser_unsupported':
            case 'unknown':
            case null:
            default:
                return copy.voice_not_supported;
        }
    }, [
        copy.voice_embed_blocked,
        copy.voice_https_required,
        copy.voice_permission_denied,
        copy.voice_no_microphone,
        copy.voice_not_supported,
    ]);

    const getVoiceInputEnvironmentState = useCallback(() => getVoiceInputEnvironment(), []);

    const speakAssistantMessage = useCallback(async (text: string, mode: 'normal' | 'realtime', sessionIdOverride?: string) => {
        const requestId = ++ttsRequestIdRef.current;
        const targetSessionId = sessionIdOverride || sessionId;
        if (!chatFeatures.allow_voice_output || !ttsEnabled || !targetSessionId) return;
        if (!isValidUuid(targetSessionId) || !isValidEntityId(bot.id)) return;
        const cleaned = cleanTextForSpeech(text);
        if (!cleaned) return;

        try {
            const response = await fetch('/api/chat/tts', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    sessionId: targetSessionId,
                    botId: bot.id,
                    text: cleaned,
                    mode,
                }),
            });
            if (!response.ok) {
                const payload = await response.json().catch(() => ({}));
                if (handleAuthError(payload?.error, response.status)) return;
                throw new Error(payload?.error || copy.tts_error);
            }
            const audioBlob = await response.blob();
            const nextUrl = URL.createObjectURL(audioBlob);
            if (requestId !== ttsRequestIdRef.current) {
                URL.revokeObjectURL(nextUrl);
                return;
            }

            if (audioRef.current) {
                audioRef.current.pause();
                audioRef.current = null;
            }
            if (audioUrlRef.current) {
                URL.revokeObjectURL(audioUrlRef.current);
                audioUrlRef.current = null;
            }

            const audio = new Audio(nextUrl);
            audioRef.current = audio;
            audioUrlRef.current = nextUrl;
            audio.onended = () => {
                if (audioUrlRef.current) {
                    URL.revokeObjectURL(audioUrlRef.current);
                    audioUrlRef.current = null;
                }
                audioRef.current = null;
            };
            try {
                await audio.play();
            } catch (playbackError: unknown) {
                if (requestId !== ttsRequestIdRef.current) return;
                if (isExpectedAudioPlaybackError(playbackError)) {
                    if ((playbackError as { name?: string }).name === 'NotAllowedError' && !ttsAutoplayWarnedRef.current) {
                        ttsAutoplayWarnedRef.current = true;
                        toast.error(
                            lang === 'es'
                                ? 'El navegador bloqueó el audio automático. Vuelve a activar voz si quieres escuchar respuestas.'
                                : 'Browser blocked autoplay audio. Re-enable voice if you want spoken responses.'
                        );
                    }
                    return;
                }
                throw playbackError;
            }
        } catch (error: unknown) {
            if (isExpectedAudioPlaybackError(error)) return;
            console.error('TTS playback error:', error);
            toast.error(getErrorMessage(error));
        }
    }, [chatFeatures.allow_voice_output, ttsEnabled, sessionId, bot.id, copy.tts_error, lang, handleAuthError]);

    useEffect(() => {
        if (typeof window === 'undefined' || !chatFeatures.allow_voice_input) {
            setSttSupported(false);
            setVoiceInputUnavailableReason(null);
            return;
        }

        const environment = getVoiceInputEnvironmentState();
        const unavailableReason = detectVoiceInputUnavailableReason(environment);
        setSttSupported(unavailableReason === null);
        setVoiceInputUnavailableReason(unavailableReason);
    }, [chatFeatures.allow_voice_input, getVoiceInputEnvironmentState]);

    const cleanupVoiceCapture = useCallback(() => {
        if (mediaStreamRef.current) {
            mediaStreamRef.current.getTracks().forEach((track) => track.stop());
            mediaStreamRef.current = null;
        }
        mediaRecorderRef.current = null;
        audioChunksRef.current = [];
        recordingStartedAtRef.current = 0;
    }, []);

    const transcribeRecordedAudio = useCallback(async (audioBlob: Blob, mode: 'normal' | 'realtime', durationMs: number) => {
        if (!sessionId) {
            throw new Error(copy.voice_requires_session);
        }
        const payload = new FormData();
        payload.append('sessionId', sessionId);
        payload.append('botId', bot.id);
        payload.append('mode', mode);
        payload.append('duration_ms', String(Math.max(1, durationMs)));
        payload.append('audio', audioBlob, 'speech.webm');

        const response = await fetch('/api/chat/stt', {
            method: 'POST',
            body: payload,
        });
        const body = await response.json().catch(() => ({})) as SttApiResponse;
        if (!response.ok) {
            if (handleAuthError(body.error, response.status)) {
                throw new Error(copy.voice_requires_session);
            }
            throw new Error(body.error || copy.stt_error);
        }
        const transcript = typeof body.transcript === 'string' ? body.transcript.trim() : '';
        if (!transcript) {
            throw new Error(copy.stt_error);
        }
        return transcript;
    }, [sessionId, bot.id, copy.stt_error, copy.voice_requires_session, handleAuthError]);

    useEffect(() => {
        return () => {
            voicePressActiveRef.current = false;
            activeVoicePointerIdRef.current = null;
            if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
                skipTranscriptionRef.current = true;
                mediaRecorderRef.current.stop();
            }
            cleanupVoiceCapture();
            stopAudioPlayback();
        };
    }, [cleanupVoiceCapture, stopAudioPlayback]);

    const stopVoiceInputCapture = useCallback(() => {
        if (!mediaRecorderRef.current || mediaRecorderRef.current.state === 'inactive') {
            setIsListening(false);
            return;
        }
        skipTranscriptionRef.current = false;
        mediaRecorderRef.current.stop();
        setIsListening(false);
    }, []);

    const startVoiceInputCapture = async () => {
        if (!chatFeatures.allow_voice_input) return;
        if (isListening) return;
        if (!sessionId || !hasStarted) {
            toast.error(copy.voice_requires_session);
            return;
        }
        if (!sttSupported) {
            toast.error(getVoiceInputErrorMessage(voiceInputUnavailableReason));
            return;
        }

        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            const preferredMimeTypes = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus'];
            const mimeType = preferredMimeTypes.find((candidate) => (
                typeof window.MediaRecorder !== 'undefined'
                && typeof window.MediaRecorder.isTypeSupported === 'function'
                && window.MediaRecorder.isTypeSupported(candidate)
            ));
            const recorder = mimeType
                ? new MediaRecorder(stream, { mimeType })
                : new MediaRecorder(stream);

            mediaStreamRef.current = stream;
            mediaRecorderRef.current = recorder;
            audioChunksRef.current = [];
            recordingStartedAtRef.current = Date.now();

            recorder.ondataavailable = (event) => {
                if (event.data.size > 0) {
                    audioChunksRef.current.push(event.data);
                }
            };
            recorder.onerror = () => {
                setIsListening(false);
                setIsTranscribing(false);
                cleanupVoiceCapture();
                toast.error(getVoiceInputErrorMessage(voiceInputUnavailableReason));
            };
            recorder.onstop = () => {
                const shouldSkip = skipTranscriptionRef.current;
                skipTranscriptionRef.current = false;
                const recordedChunks = [...audioChunksRef.current];
                const finalMime = recorder.mimeType || mimeType || 'audio/webm';
                const recordedDurationMs = Math.max(1, Date.now() - recordingStartedAtRef.current);
                cleanupVoiceCapture();

                if (shouldSkip) return;
                if (recordedChunks.length === 0) {
                    if (recordedDurationMs < 350) {
                        return;
                    }
                    toast.error(copy.stt_error);
                    return;
                }

                const recordedBlob = new Blob(recordedChunks, { type: finalMime });
                setIsTranscribing(true);
                (async () => {
                    try {
                        const transcript = await transcribeRecordedAudio(recordedBlob, 'normal', recordedDurationMs);
                        setInput(transcript);
                        await handleSend(transcript);
                    } catch (error: unknown) {
                        toast.error(getErrorMessage(error));
                    } finally {
                        setIsTranscribing(false);
                    }
                })();
            };

            recorder.start();
            setIsListening(true);
            if (!voicePressActiveRef.current) {
                stopVoiceInputCapture();
            }
        } catch (error: unknown) {
            setIsListening(false);
            setIsTranscribing(false);
            cleanupVoiceCapture();
            const failureReason = classifyVoiceInputStartFailure({
                error,
                environment: getVoiceInputEnvironmentState(),
            });
            toast.error(getVoiceInputErrorMessage(failureReason));
        }
    };

    const handleVoicePointerDown = (event: ReactPointerEvent<HTMLButtonElement>) => {
        event.preventDefault();
        voicePressActiveRef.current = true;
        activeVoicePointerIdRef.current = event.pointerId;
        try {
            event.currentTarget.setPointerCapture(event.pointerId);
        } catch {
            // Pointer capture can fail on some browsers; press-to-talk should still work.
        }
        void startVoiceInputCapture();
    };

    const handleVoicePointerUp = useCallback((event: ReactPointerEvent<HTMLButtonElement>) => {
        event.preventDefault();
        if (activeVoicePointerIdRef.current !== null && event.pointerId !== activeVoicePointerIdRef.current) {
            return;
        }
        voicePressActiveRef.current = false;
        if (event.currentTarget.hasPointerCapture(event.pointerId)) {
            event.currentTarget.releasePointerCapture(event.pointerId);
        }
        activeVoicePointerIdRef.current = null;
        stopVoiceInputCapture();
    }, [stopVoiceInputCapture]);

    const handleVoicePointerCancel = useCallback((event: ReactPointerEvent<HTMLButtonElement>) => {
        event.preventDefault();
        voicePressActiveRef.current = false;
        if (event.currentTarget.hasPointerCapture(event.pointerId)) {
            event.currentTarget.releasePointerCapture(event.pointerId);
        }
        activeVoicePointerIdRef.current = null;
        stopVoiceInputCapture();
    }, [stopVoiceInputCapture]);

    const handleVoiceLostPointerCapture = useCallback(() => {
        if (!voicePressActiveRef.current) return;
        voicePressActiveRef.current = false;
        activeVoicePointerIdRef.current = null;
        stopVoiceInputCapture();
    }, [stopVoiceInputCapture]);

    const handleImageSelection = async (files: FileList | File[] | null) => {
        if (!files || files.length === 0) return;
        const currentCount = selectedImages.length;
        const room = MAX_IMAGES_PER_MESSAGE - currentCount;
        if (room <= 0) {
            toast.error(copy.image_limit);
            return;
        }
        const fileBatch = Array.from(files).slice(0, room);
        const nextImages: ChatImage[] = [];

        for (const file of fileBatch) {
            if (!ALLOWED_IMAGE_TYPES.has(file.type)) {
                toast.error(copy.image_type_error);
                continue;
            }
            if (file.size > MAX_IMAGE_BYTES) {
                toast.error(copy.image_size_error);
                continue;
            }
            try {
                const dataUrl = await readFileAsDataUrl(file);
                nextImages.push({
                    mime_type: file.type === 'image/jpg' ? 'image/jpeg' : file.type,
                    data_url: dataUrl,
                });
            } catch {
                toast.error(getErrorMessage(new Error('Failed to process selected image')));
            }
        }

        if (nextImages.length > 0) {
            setSelectedImages((prev) => [...prev, ...nextImages].slice(0, MAX_IMAGES_PER_MESSAGE));
        }
    };

    const requestSessionEnd = useCallback(async (showSuccessToast: boolean): Promise<boolean> => {
        if (!sessionId || !hasStarted || sessionEnded || isEndingSession) return false;

        setIsEndingSession(true);
        try {
            if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
                skipTranscriptionRef.current = true;
                mediaRecorderRef.current.stop();
            }
            cleanupVoiceCapture();
            setIsListening(false);
            setIsTranscribing(false);

            const response = await fetch(`/api/sessions/${encodeURIComponent(sessionId)}/end`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ botId: bot.id }),
            });
            const payload = await response.json().catch(() => ({})) as { error?: string };
            if (!response.ok) {
                if (handleAuthError(payload.error, response.status)) {
                    return false;
                }
                throw new Error(payload.error || copy.end_session_error);
            }

            setSessionEnded(true);
            if (showSuccessToast) {
                toast.success(copy.end_session_done);
            }
            return true;
        } catch (error: unknown) {
            console.error('Failed to end session:', error);
            const message = getErrorMessage(error);
            toast.error(message === 'Unknown error' ? copy.end_session_error : message);
            return false;
        } finally {
            setIsEndingSession(false);
        }
    }, [
        sessionId,
        hasStarted,
        sessionEnded,
        isEndingSession,
        cleanupVoiceCapture,
        bot.id,
        handleAuthError,
        copy.end_session_done,
        copy.end_session_error,
    ]);

    const runEvaluationFlow = useCallback(async (): Promise<boolean> => {
        if (!sessionId) return false;

        setIsEvaluating(true);
        try {
            const hadEvaluation = Boolean(evaluationResult);
            const result: RunEvaluationActionResult = await runEvaluation(sessionId);
            if (!result.success) {
                toast.error(result.error);
                return false;
            }

            setEvaluationResult(result.data.evaluation);
            setShowEvaluation(true);
            if (result.data.reused) {
                toast.success(copy.eval_already_done);
            } else if (hadEvaluation && viewerRole === 'ADMIN') {
                toast.success(copy.eval_rerun_done);
            } else {
                toast.success(copy.eval_done);
            }
            ltiOutcomeRetrySessionRef.current = sessionId;

            if (result.data.ltiOutcomeSync?.status === 'synced') {
                toast.success(copy.lti_grade_synced);
            } else if (result.data.ltiOutcomeSync?.status === 'failed') {
                toast.error(copy.lti_grade_sync_failed);
            }
            return true;
        } catch (error: unknown) {
            console.error(error);
            toast.error(copy.eval_error + getErrorMessage(error));
            return false;
        } finally {
            setIsEvaluating(false);
        }
    }, [
        sessionId,
        evaluationResult,
        viewerRole,
        copy.eval_already_done,
        copy.eval_rerun_done,
        copy.eval_done,
        copy.lti_grade_synced,
        copy.lti_grade_sync_failed,
        copy.eval_error,
    ]);

    useEffect(() => {
        if (!isLtiEmbedded || !sessionId || !sessionEnded || !evaluationResult) return;
        if (ltiOutcomeRetrySessionRef.current === sessionId) return;

        ltiOutcomeRetrySessionRef.current = sessionId;
        void fetch(`/api/sessions/${encodeURIComponent(sessionId)}/lti-outcome-sync`, {
            method: 'POST',
            credentials: 'include',
        }).catch((error: unknown) => {
            console.warn('Unable to retry LTI outcome sync:', error);
        });
    }, [evaluationResult, isLtiEmbedded, sessionEnded, sessionId]);

    const initSession = useCallback(async (newSessionId: string) => {
        if (initCalledRef.current) return;
        initCalledRef.current = true;
        setIsLoading(true);

        try {
            const createSessionResponse = await fetch('/api/sessions', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    sessionId: newSessionId,
                    botId: bot.id,
                    organizationId: organizationId || undefined,
                }),
            });
            if (!createSessionResponse.ok) {
                const createSessionError = await readApiError(
                    createSessionResponse,
                    lang === 'es' ? 'No se pudo crear la sesión.' : 'Failed to create session.'
                );
                if (handleAuthError(createSessionError, createSessionResponse.status)) {
                    initCalledRef.current = false;
                    return;
                }
                throw new Error(createSessionError);
            }

            setIsLoading(true);
            const resp = await fetch('/api/chat/init', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    sessionId: newSessionId,
                    botId: bot.id,
                }),
            });
            if (!resp.ok) {
                const initError = await readApiError(
                    resp,
                    lang === 'es' ? 'No se pudo inicializar el chat.' : 'Failed to initialize chat.'
                );
                if (handleAuthError(initError, resp.status)) {
                    setIsLoading(false);
                    initCalledRef.current = false;
                    return;
                }
                throw new Error(initError);
            }

            const data = await resp.json() as { introMessage?: string };
            if (data.introMessage) {
                setMessages([{
                    role: 'assistant',
                    content: data.introMessage,
                    timestamp: new Date().toISOString(),
                }]);
                await speakAssistantMessage(data.introMessage, 'normal', newSessionId);
            } else {
                setMessages([{
                    role: 'assistant',
                    content: copy.fallback_hello,
                    timestamp: new Date().toISOString(),
                }]);
                await speakAssistantMessage(copy.fallback_hello, 'normal', newSessionId);
            }
            setIsLoading(false);
        } catch (e) {
            console.error('Failed to init session:', e);
            clearStoredSessionId();
            initCalledRef.current = false;
            setSessionId(null);
            setHasStarted(false);
            setMessages([]);
            setIsLoading(false);
            toast.error(getErrorMessage(e));
        }
    }, [bot.id, organizationId, copy.fallback_hello, speakAssistantMessage, lang, handleAuthError, clearStoredSessionId]);

    const handleStartChat = async () => {
        if (typeof window === 'undefined' || (organizations.length > 1 && !organizationId)) return;
        setBot(initialBot);
        setSendError(null);
        pendingSendRef.current = null;
        const newSessionId = crypto.randomUUID();
        persistSessionId(newSessionId);
        setSessionId(newSessionId);
        setHasStarted(true);
        await initSession(newSessionId);
    };

    useEffect(() => {
        if (typeof window === 'undefined') return;

        if (forceNewSession) {
            clearStoredSessionId();
            const url = new URL(window.location.href);
            if (url.searchParams.has('new')) {
                url.searchParams.delete('new');
                window.history.replaceState({}, '', url.toString());
            }
        }

        initCalledRef.current = false;
        setMessages([]);
        setInput('');
        setSelectedImages([]);
        setSessionEnded(false);
        setEvaluationResult(null);
        setShowEvaluation(false);
        setIsLoading(false);
        setIsEndingSession(false);
        setIsListening(false);
        setIsTranscribing(false);
        if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
            skipTranscriptionRef.current = true;
            mediaRecorderRef.current.stop();
        }
        cleanupVoiceCapture();
        stopAudioPlayback();

        const storedSession = readStoredSessionId();
        if (storedSession) {
            if (!isValidUuid(storedSession)) {
                clearStoredSessionId();
                setSessionId(null);
                setHasStarted(false);
                return;
            }
            setSessionId(storedSession);
            setHasStarted(true);
            const controller = new AbortController();
            fetch(`/api/sessions/${encodeURIComponent(storedSession)}/messages`, { signal: controller.signal })
                .then(async (res) => {
                    if (res.ok) {
                        return {
                            state: 'ok' as const,
                            data: await res.json() as SessionMessageResponse,
                        };
                    }
                    const apiError = await readApiError(res, lang === 'es' ? 'No se pudieron cargar mensajes.' : 'Failed to load messages.');
                    if (handleAuthError(apiError, res.status)) {
                        return { state: 'auth_redirect' as const };
                    }
                    return { state: 'reset' as const };
                })
                .then((result) => {
                    if (!result || result.state === 'auth_redirect') return;
                    if (result.state === 'reset') {
                        clearStoredSessionId();
                        initCalledRef.current = false;
                        setSessionId(null);
                        setHasStarted(false);
                        setMessages([]);
                        setSessionEnded(false);
                        setEvaluationResult(null);
                        return;
                    }

                    const data = result.data;
                    if (data.bot) setBot(data.bot);
                    if (data.messages && data.messages.length > 0) {
                        setMessages(data.messages.map((m) => ({
                            role: m.role === 'assistant' || m.role === 'system' ? m.role : 'user',
                            content: m.content || '',
                            images: m.images || [],
                            timestamp: typeof m.created_at === 'string' ? m.created_at : new Date().toISOString(),
                        })));
                    }
                    setSessionEnded(Boolean(data.ended));
                    setEvaluationResult(isEvaluationResult(data.evaluation) ? data.evaluation : null);
                })
                .catch((error: unknown) => {
                    if (error instanceof DOMException && error.name === 'AbortError') return;
                    clearStoredSessionId();
                    initCalledRef.current = false;
                    setSessionId(null);
                    setHasStarted(false);
                });
            return () => controller.abort();
        } else {
            setSessionId(null);
            setHasStarted(false);
        }
        return;
    }, [
        cleanupVoiceCapture,
        clearStoredSessionId,
        forceNewSession,
        handleAuthError,
        lang,
        readStoredSessionId,
        stopAudioPlayback,
    ]);

    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [messages]);

    useEffect(() => {
        if (!hasStarted || isLoading || sessionEnded) return;
        const timer = window.setTimeout(() => focusTextInput(), 0);
        return () => window.clearTimeout(timer);
    }, [hasStarted, isLoading, sessionEnded, focusTextInput]);

    const handleSend = async (messageOverride?: string) => {
        const composedMessage = typeof messageOverride === 'string' ? messageOverride : input;
        if ((!composedMessage.trim() && selectedImages.length === 0) || sendingRef.current || isLoading || sessionEnded || !sessionId) return;
        const userMsg = composedMessage.trim();
        const payloadImages = selectedImages.map(({ mime_type, data_url }) => ({ mime_type, data_url }));
        const previous = pendingSendRef.current;
        const samePayload = previous?.message === userMsg && JSON.stringify(previous.images) === JSON.stringify(payloadImages);
        const requestId = samePayload ? previous!.id : crypto.randomUUID();
        pendingSendRef.current = { id: requestId, message: userMsg, images: payloadImages };
        sendingRef.current = true;
        setSendError(null);
        setIsLoading(true);
        setIsListening(false);
        voicePressActiveRef.current = false;
        activeVoicePointerIdRef.current = null;
        if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
            skipTranscriptionRef.current = true;
            mediaRecorderRef.current.stop();
        }
        try {
            const resp = await fetch('/api/chat', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ sessionId, botId: bot.id, requestId, message: userMsg, images: payloadImages, input_mode: 'normal' }),
            });
            const data = await resp.json().catch(() => ({})) as { error?: string; content?: string; ended?: boolean; end_reason?: string };
            if (!resp.ok || data.error) {
                if (handleAuthError(data.error, resp.status)) return;
                throw new Error(data.error || (lang === 'es' ? 'No se pudo enviar el mensaje.' : 'Failed to send message.'));
            }
            const assistantText = data.content || '';
            // Only confirmed messages enter the transcript. Retry keeps its original ID.
            if (!data.end_reason) setMessages((prev) => [...prev,
                { role: 'user', content: userMsg || copy.image_only, images: payloadImages, timestamp: new Date().toISOString() },
                { role: 'assistant', content: assistantText, timestamp: new Date().toISOString() },
            ]);
            setInput('');
            setSelectedImages([]);
            pendingSendRef.current = null;
            if (data.ended) setSessionEnded(true);
            await speakAssistantMessage(assistantText, 'normal');
        } catch (error: unknown) {
            setInput(userMsg);
            setSendError(getErrorMessage(error));
        } finally {
            sendingRef.current = false;
            setIsLoading(false);
            focusTextInput();
        }
    };

    const handleReset = () => {
        setSendError(null);
        pendingSendRef.current = null;
        clearStoredSessionId();
        initCalledRef.current = false;
        setSessionId(null);
        setHasStarted(false);
        setMessages([]);
        setInput('');
        setSessionEnded(false);
        setSelectedImages([]);
        setShowCamera(false);
        setShowEvaluation(false);
        setEvaluationResult(null);
        setIsLoading(false);
        setIsEndingSession(false);
        setIsListening(false);
        setIsTranscribing(false);
        setTtsEnabled(false);
        ltiOutcomeRetrySessionRef.current = null;
        voicePressActiveRef.current = false;
        activeVoicePointerIdRef.current = null;
        if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
            skipTranscriptionRef.current = true;
            mediaRecorderRef.current.stop();
        }
        cleanupVoiceCapture();
        stopAudioPlayback();
    };

    const primaryActionMode = resolveChatPrimaryAction({
        hasStarted,
        sessionEnded,
        hasEvaluator: Boolean(bot.config?.evaluator_bot_id),
        hasEvaluationResult: Boolean(evaluationResult),
        viewerRole,
    });

    const primaryActionLabel = (() => {
        switch (primaryActionMode) {
            case 'evaluate':
                return copy.evaluate;
            case 'reevaluate':
                return copy.reevaluate;
            case 'view_evaluation':
                return copy.view_evaluation;
            case 'end':
                return copy.end_session;
            default:
                return '';
        }
    })();

    const handlePrimaryAction = useCallback(async () => {
        if (!sessionId || !primaryActionMode) return;

        if (primaryActionMode === 'view_evaluation') {
            setShowEvaluation(true);
            return;
        }

        if (primaryActionMode === 'reevaluate') {
            await runEvaluationFlow();
            return;
        }

        if (primaryActionMode === 'end') {
            if (typeof window !== 'undefined' && !window.confirm(copy.end_session_confirm)) {
                return;
            }
            await requestSessionEnd(true);
            return;
        }

        if (!sessionEnded) {
            if (typeof window !== 'undefined' && !window.confirm(copy.evaluate_and_end_confirm)) {
                return;
            }
            const endedSuccessfully = await requestSessionEnd(false);
            if (!endedSuccessfully) return;
        }

        await runEvaluationFlow();
    }, [
        sessionId,
        primaryActionMode,
        sessionEnded,
        copy.end_session_confirm,
        copy.evaluate_and_end_confirm,
        requestSessionEnd,
        runEvaluationFlow,
    ]);

    const PrimaryActionIcon = primaryActionMode === 'end'
        ? X
        : FileSignature;
    const primaryActionPending = isEndingSession || isEvaluating;
    const showPrimaryAction = Boolean(sessionId && primaryActionMode);
    const primaryActionClassName = cn(
        "h-10 rounded-2xl border font-semibold text-xs gap-2",
        primaryActionMode === 'end'
            ? "border-amber-300 text-amber-700 hover:bg-amber-50"
            : "border-primary/20 text-primary hover:bg-primary/10"
    );
    const surfaceClassName = cn(
        "flex h-full w-full flex-col overflow-hidden border",
        isLtiEmbedded
            ? "rounded-[22px] border-slate-200 bg-white shadow-[0_8px_24px_rgba(15,23,42,0.05)]"
            : "rounded-[24px] border-slate-200 bg-white shadow-[0_10px_28px_rgba(15,23,42,0.05)]"
    );
    const headerClassName = cn(
        "flex items-center justify-between border-b",
        isLtiEmbedded
            ? "border-slate-200 bg-slate-50/72 px-4 py-3"
            : "border-slate-200 bg-slate-50/72 px-5 py-4"
    );
    const messagesClassName = cn(
        "custom-scroll flex-1 space-y-5 overflow-y-auto bg-slate-50/38",
        isLtiEmbedded
            ? "p-4"
            : "p-5"
    );
    const inputAreaClassName = cn(
        "border-t",
        isLtiEmbedded
            ? "border-slate-200 bg-white px-4 pb-4 pt-3"
            : "border-slate-200 bg-white px-5 pb-5 pt-4"
    );
    const startScreenClassName = cn(
        "flex h-full flex-col items-center justify-center animate-in fade-in duration-500",
        isLtiEmbedded ? "gap-4" : "gap-6"
    );
    const startCardClassName = cn(
        "flex items-center justify-center overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-sm",
        isLtiEmbedded ? "h-20 w-20 p-2" : "h-24 w-24 p-3"
    );
    const showResetAction = !isLtiEmbedded;
    const showFlowEngineBadge = false;

    return (
        <div className={surfaceClassName}>
            <div className={headerClassName}>
                <div className="flex items-center space-x-4">
                    <div className="relative">
                        <div className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                                src={headerBotLogoSrc}
                                alt={bot.name}
                                className="w-8 h-8 object-contain"
                                loading="eager"
                                onError={handleBotLogoError}
                            />
                        </div>
                        <div className={cn(
                            "absolute -bottom-1 -right-1 h-4 w-4 rounded-full border-2 border-white",
                            sessionEnded ? "bg-red-500" : "bg-green-500 animate-pulse"
                        )} />
                    </div>
                    <div>
                        <h2 className="text-base font-bold leading-tight text-slate-900">{bot.name}</h2>
                        <div className="flex items-center gap-2">
                            <span className={cn(
                                "text-[10px] font-bold uppercase tracking-[0.16em]",
                                sessionEnded ? "text-red-500" : "text-primary"
                            )}>
                                {sessionEnded ? copy.session_ended : copy.session_active}
                            </span>

                            <div className="h-1 w-1 rounded-full bg-primary/40" />
                            <span className="font-mono text-[10px] text-slate-400">{sessionId?.slice(0, 8)}</span>
                        </div>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    {showPrimaryAction && (
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => void handlePrimaryAction()}
                            disabled={primaryActionPending || isLoading}
                            className={primaryActionClassName}
                        >
                            {primaryActionPending ? (
                                <>
                                    <RefreshCcw className="w-3.5 h-3.5 animate-spin" />
                                    {primaryActionMode === 'evaluate' || primaryActionMode === 'reevaluate'
                                        ? copy.evaluating
                                        : copy.end_session}
                                </>
                            ) : (
                                <>
                                    <PrimaryActionIcon className="w-3.5 h-3.5" />
                                    {primaryActionLabel}
                                </>
                            )}
                        </Button>
                    )}
                    {showResetAction && (
                        <Button
                            variant="outline"
                            size="sm"
                            className="h-10 rounded-2xl border-slate-200 px-4 text-xs font-semibold text-slate-600 hover:bg-slate-100"
                            onClick={handleReset}
                            title={copy.reset_session}
                        >
                            <RefreshCcw className="w-3.5 h-3.5" />
                            {copy.reset_session}
                        </Button>
                    )}
                </div>
            </div>

            <div className={messagesClassName} ref={scrollRef}>
                {!hasStarted ? (
                    <div className={startScreenClassName}>
                        <div className={startCardClassName}>
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                                src={headerBotLogoSrc}
                                alt={bot.name}
                                className="w-full h-full object-contain"
                                loading="eager"
                                onError={handleBotLogoError}
                            />
                        </div>
                        <div className="text-center space-y-2">
                            <h3 className="text-xl font-bold text-slate-900">{bot.name}</h3>
                            {!isLtiEmbedded && (
                                <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">
                                    {copy.manager}
                                </p>
                            )}
                            <p className="max-w-xs text-sm text-slate-500">
                                {copy.start_hint}
                            </p>
                        </div>
                        {organizations.length > 1 && !isLtiEmbedded && (
                            <label className="flex w-full max-w-xs flex-col gap-2 text-sm">
                                {lang === 'es' ? 'Organización de esta práctica' : 'Organization for this practice'}
                                <select value={organizationId} onChange={(event) => setOrganizationId(event.target.value)} className="rounded-xl border bg-white p-3">
                                    <option value="">{lang === 'es' ? 'Elegí una organización' : 'Choose an organization'}</option>
                                    {organizations.map((org) => <option key={org.id} value={org.id}>{org.name}</option>)}
                                </select>
                            </label>
                        )}
                        <Button
                            onClick={handleStartChat}
                            disabled={isLoading || (organizations.length > 1 && !organizationId)}
                            className="h-12 rounded-2xl px-6 text-sm font-semibold shadow-sm group"
                        >
                            {isLoading ? (
                                <span className="flex items-center gap-2">
                                    <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                    {copy.starting}
                                </span>
                            ) : (
                                <>
                                    <Play className="w-5 h-5 group-hover:scale-110 transition-transform" />
                                    {copy.start_chat}
                                </>
                            )}
                        </Button>
                    </div>
                ) : (
                    <>
                        <ChatMessagesList
                            messages={messages}
                            isLoading={isLoading}
                            botName={bot.name}
                            botLogo={bot.logo || bot.config?.logo_url}
                            lang={lang}
                        />
                    </>
                )}
            </div>

            <div className={inputAreaClassName}>
                {selectedImages.length > 0 && (
                    <div className="mb-3 rounded-2xl border border-slate-200 bg-slate-50 p-3">
                        <div className="grid grid-cols-3 gap-2">
                            {selectedImages.map((img, idx) => (
                                <div key={`${idx}-${(img.data_url || '').slice(0, 10)}`} className="relative">
                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                    <img
                                        src={img.data_url || ''}
                                        alt="Selected"
                                        className="h-auto max-h-48 w-full rounded-lg border border-slate-200 bg-white object-contain"
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setSelectedImages((prev) => prev.filter((_, i) => i !== idx))}
                                        className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-slate-900/80 text-white"
                                    >
                                        <X className="h-3 w-3" />
                                    </button>
                                </div>
                            ))}
                        </div>
                    </div>
                )}



                <div className="flex items-end gap-2">
                    {chatFeatures.allow_voice_input && (
                        <Button
                            type="button"
                            variant="outline"
                            size="icon"
                            onPointerDown={handleVoicePointerDown}
                            onPointerUp={handleVoicePointerUp}
                            onPointerCancel={handleVoicePointerCancel}
                            onLostPointerCapture={handleVoiceLostPointerCapture}
                            onClick={(event) => event.preventDefault()}
                            disabled={isLoading || sessionEnded || isTranscribing || !sessionId || !hasStarted}
                            className={cn(
                                "h-12 w-12 rounded-xl border-slate-200 bg-white",
                                (isListening || isTranscribing) && "border-primary text-primary"
                            )}
                            title={sttSupported ? copy.hold_to_talk : getVoiceInputErrorMessage(voiceInputUnavailableReason)}
                        >
                            {isTranscribing
                                ? <RefreshCcw className="w-4 h-4 animate-spin" />
                                : (isListening ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />)}
                        </Button>
                    )}

                    {chatFeatures.allow_image_upload && (
                        <>
                            <input
                                ref={galleryInputRef}
                                type="file"
                                accept="image/png,image/jpeg,image/webp"
                                multiple
                                className="hidden"
                                onChange={(e) => {
                                    void handleImageSelection(e.target.files);
                                    e.target.value = '';
                                }}
                            />

                            <Button
                                type="button"
                                variant="outline"
                                size="icon"
                                disabled={isLoading || sessionEnded}
                                className="h-12 w-12 rounded-xl border-slate-200 bg-white"
                                onClick={() => galleryInputRef.current?.click()}
                                title={copy.upload_gallery}
                            >
                                <ImagePlus className="w-4 h-4" />
                            </Button>
                            <Button
                                type="button"
                                variant="outline"
                                size="icon"
                                disabled={isLoading || sessionEnded}
                                className="h-12 w-12 rounded-xl border-slate-200 bg-white"
                                onClick={() => setShowCamera(true)}
                                title={copy.upload_camera}
                            >
                                <Camera className="w-4 h-4" />
                            </Button>

                            {showCamera && (
                                <CameraCaptureModal
                                    open={showCamera}
                                    onOpenChange={setShowCamera}
                                    onCapture={(file) => void handleImageSelection([file])}
                                />
                            )}
                        </>
                    )}

                    {sendError && <div role="alert" className="text-sm text-red-700">
                        {sendError} {lang === 'es' ? 'Tu respuesta se conservó. Volvé a enviar para reintentar.' : 'Your reply was kept. Send again to retry.'}
                    </div>}
                    <form
                        onSubmit={(e) => {
                            e.preventDefault();
                            void handleSend();
                        }}
                        className="relative group flex-1"
                    >
                        <Input
                            aria-label={lang === 'es' ? 'Tu mensaje' : 'Your message'}
                            ref={inputRef}
                            value={input}
                            onChange={(e) => {
                                setInput(e.target.value);
                            }}
                            placeholder={sessionEnded
                                ? (isLtiEmbedded ? copy.session_ended : copy.input_ended)
                                : copy.input_active}
                            className="h-14 w-full rounded-2xl border-slate-200 bg-slate-50 pl-6 pr-16 text-base text-slate-900 transition-all placeholder:text-slate-400 focus:border-primary/50 focus:ring-primary/20"
                            disabled={isLoading || sessionEnded}
                        />
                        <Button
                            type="submit"
                            aria-label={lang === 'es' ? 'Enviar mensaje' : 'Send message'}
                            size="icon"
                            className="absolute right-2 top-1/2 h-10 w-10 -translate-y-1/2 rounded-xl shadow-sm transition-all group-hover:scale-105 active:scale-95"
                            disabled={isLoading || (!input.trim() && selectedImages.length === 0) || sessionEnded}
                        >
                            <Send className="w-5 h-5" />
                        </Button>
                    </form>

                    {chatFeatures.allow_voice_output && (
                        <Button
                            type="button"
                            variant="outline"
                            size="icon"
                            onClick={() => setTtsEnabled((prev) => !prev)}
                            className={cn(
                                "h-12 w-12 rounded-xl border-slate-200 bg-white",
                                ttsEnabled && "border-primary text-primary"
                            )}
                            title={ttsEnabled ? copy.speak_on : copy.speak_off}
                        >
                            {ttsEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
                        </Button>
                    )}
                </div>
                {(isListening || isTranscribing) && (
                    <p className="mt-2 text-[10px] font-semibold text-primary">
                        {isTranscribing
                            ? copy.transcribing
                            : copy.listening}
                    </p>
                )}
                {showFlowEngineBadge && (
                    <div className="flex items-center justify-center gap-6 mt-4 opacity-30 grayscale hover:grayscale-0 transition-all duration-500">
                        <div className="flex items-center gap-1.5 text-[10px] uppercase font-bold tracking-widest text-muted-foreground group">
                            <Sparkles className="h-3 w-3 text-primary group-hover:scale-125 transition-transform" />
                            {copy.flow_engine}
                        </div>
                    </div>
                )}
            </div>

            {(showEvaluation || Boolean(evaluationResult)) && (
                <EvaluationResultModal
                    open={showEvaluation}
                    onOpenChange={setShowEvaluation}
                    result={evaluationResult}
                    sessionId={sessionId}
                    userId={userId}
                />
            )}
        </div>
    );
}
