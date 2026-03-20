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

// Helper to extract file ID from Google Drive URL
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
    // Regex to find Markdown images: ![Alt text](URL)
    const mdImageRegex = /(!\[.*?\]\((https?:\/\/[^\s\)]+)\))/g;

    // First, split by Markdown images
    const parts = safeContent.split(mdImageRegex);

    // The split result will look like: 
    // [text_before, full_match, url, text_after, ...]
    // Because of capturing groups, 'full_match' and 'url' are included.
    // We need to process this carefully.

    const elements: JSX.Element[] = [];
    let i = 0;
    while (i < parts.length) {
        const part = parts[i];

        // If part matches the full markdown syntax (roughly), it might be the captured group from split?
        // Actually, split with capturing groups includes the captures.
        // Index i: text
        // Index i+1: full match (e.g. ![Alt](url))
        // Index i+2: url (e.g. http://...)

        // Let's refine the loop logic. 
        // If we found a match, the next parts are the captures.

        // Wait, split behavior:
        // "A ![B](C) D".split(...) -> ["A ", "![B](C)", "C", " D"]

        // So:
        // elements[i] = text
        // elements[i+1] = full match (skip/use for key)
        // elements[i+2] = url (use for rendering)

        if (i % 3 === 0) {
            // This is a text part. It might STILL contain raw URLs that are not images.
            if (part) {
                // Parse raw URLs in this text segment
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
            // This is the URL captured from the markdown image
            const url = part;
            const driveId = getGoogleDriveId(url);

            if (driveId) {
                const previewUrl = `https://drive.google.com/file/d/${driveId}/preview`;
                elements.push(
                    <span key={i} className="block my-2">
                        {/* We hide the text and only show the iframe/image for Markdown Images */}
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
                // Standard image
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
        // i % 3 === 1 is the full match string, we skip it as we rendered the URL in step 2

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
                    'w-8 h-8 rounded-xl flex items-center justify-center shrink-0 mt-1 shadow-md',
                    msg.role === 'user' ? 'bg-primary/20 text-primary border border-primary/20' : 'bg-white/10 text-muted-foreground border border-white/5'
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
                        'rounded-2xl px-5 py-3 text-sm flex flex-col gap-1 shadow-xl backdrop-blur-sm',
                        msg.role === 'user'
                            ? 'bg-primary text-primary-foreground rounded-tr-none shadow-primary/10'
                            : 'bg-white/5 text-foreground rounded-tl-none border border-white/10 shadow-black/20'
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
                                    className="h-24 w-full object-cover rounded-lg border border-white/20"
                                    loading="lazy"
                                />
                            ))}
                        </div>
                    )}
                    <RenderedMessage content={msg.content} />
                    <span className="text-[9px] opacity-40 self-end mt-1 font-mono uppercase tracking-tighter">
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
                        <div className="w-8 h-8 rounded-xl bg-white/10 flex items-center justify-center shrink-0 border border-white/5">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                                src={assistantLogo}
                                alt={botName}
                                className="w-4 h-4 object-contain animate-pulse"
                                onError={(e) => { (e.target as HTMLImageElement).src = DEFAULT_BOT_AVATAR; }}
                            />
                        </div>
                        <div className="bg-white/5 border border-white/10 rounded-2xl rounded-tl-none px-5 py-4 backdrop-blur-sm">
                            <span className="flex space-x-1.5 h-2 items-center">
                                <span className="w-2 h-2 bg-primary/40 rounded-full animate-bounce [animation-delay:-0.3s]"></span>
                                <span className="w-2 h-2 bg-primary/40 rounded-full animate-bounce [animation-delay:-0.15s]"></span>
                                <span className="w-2 h-2 bg-primary/40 rounded-full animate-bounce"></span>
                            </span>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
});

export function ChatInterface({
    bot,
    userId,
    viewerRole,
    requireAuth = false,
    forceNewSession = false,
    displayMode = 'standard',
}: Props) {
    const { lang } = useLanguage();
    const preferredBotLogo = bot.logo || bot.config?.logo_url || DEFAULT_BOT_AVATAR;
    const isLtiEmbedded = displayMode === 'lti_embedded';
    const sessionStorageKey = useMemo(() => `session_${bot.id}`, [bot.id]);

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

    // Evaluation State
    const [isEvaluating, setIsEvaluating] = useState(false);
    const [showEvaluation, setShowEvaluation] = useState(false);
    const [evaluationResult, setEvaluationResult] = useState<EvaluationResult | null>(null);

    // Camera State
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
            manager: 'Gestor del Simulador',
            start_hint: 'Presioná el botón para iniciar la conversación con el simulador',
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
            flow_engine: 'Motor de flujo V1',
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
            manager: 'Simulator Manager',
            start_hint: 'Press the button to start the conversation with the simulator',
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
            flow_engine: 'Flow Engine V1',
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
            // Ignore storage failures and keep the in-memory session alive.
        }
    }, [sessionStorageKey]);

    const clearStoredSessionId = useCallback(() => {
        if (typeof window === 'undefined') return;
        try {
            sessionStorage.removeItem(sessionStorageKey);
        } catch {
            // Ignore storage failures and keep the UI recoverable.
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
            // Some browsers may throw when pointer capture is unavailable.
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

    // Initialize session - ALWAYS calls init API, backend handles everything
    const initSession = useCallback(async (newSessionId: string) => {
        if (initCalledRef.current) return;
        initCalledRef.current = true;
        let sessionCreated = false;

        try {
            // First, create the session in the database
            const createSessionResponse = await fetch('/api/sessions', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    sessionId: newSessionId,
                    botId: bot.id,
                    externalUserId: userId,
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
            sessionCreated = true;

            // ALWAYS call init to get intro message (works for ALL bot types now)
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
                // Fallback if no intro configured
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
            if (!sessionCreated) {
                clearStoredSessionId();
                initCalledRef.current = false;
                setSessionId(null);
                setHasStarted(false);
                setMessages([]);
                setIsLoading(false);
                toast.error(getErrorMessage(e));
                return;
            }
            setMessages([{
                role: 'assistant',
                content: copy.fallback_hello,
                timestamp: new Date().toISOString(),
            }]);
            toast.error(getErrorMessage(e));
            setIsLoading(false);
        }
    }, [bot.id, userId, copy.fallback_hello, speakAssistantMessage, lang, handleAuthError, clearStoredSessionId]);

    // Handler for manual chat start
    const handleStartChat = async () => {
        if (typeof window === 'undefined') return;

        const newSessionId = crypto.randomUUID();
        persistSessionId(newSessionId);
        setSessionId(newSessionId);
        setHasStarted(true);
        await initSession(newSessionId);
    };

    useEffect(() => {
        // Only access sessionStorage on client side
        if (typeof window === 'undefined') return;

        // Force new session if requested
        if (forceNewSession) {
            clearStoredSessionId();
            // Clean up the URL to avoid re-triggering on refresh
            const url = new URL(window.location.href);
            if (url.searchParams.has('new')) {
                url.searchParams.delete('new');
                window.history.replaceState({}, '', url.toString());
            }
        }

        // Reset state when bot changes
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

        // Check for existing session (resumed session in same tab)
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
            // Load existing messages from database
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
                    // If error loading messages, reset session
                    clearStoredSessionId();
                    initCalledRef.current = false;
                    setSessionId(null);
                    setHasStarted(false);
                });
            return () => controller.abort();
        } else {
            // No stored session, ensure we show start button
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
        if ((!composedMessage.trim() && selectedImages.length === 0) || isLoading || sessionEnded || !sessionId) return;

        const userMsg = composedMessage.trim();
        const payloadImages = selectedImages.map((img) => ({
            mime_type: img.mime_type,
            data_url: img.data_url,
        }));
        setInput('');
        setSelectedImages([]);
        setIsListening(false);
        voicePressActiveRef.current = false;
        activeVoicePointerIdRef.current = null;
        if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
            skipTranscriptionRef.current = true;
            mediaRecorderRef.current.stop();
        }
        setMessages((prev) => [...prev, {
            role: 'user',
            content: userMsg || copy.image_only,
            images: payloadImages,
            timestamp: new Date().toISOString(),
        }]);
        setIsLoading(true);

        try {
            const resp = await fetch('/api/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    sessionId,
                    botId: bot.id,
                    message: userMsg,
                    images: payloadImages,
                    input_mode: 'normal',
                }),
            });

            const data = await resp.json().catch(() => ({})) as { error?: string; content?: string; ended?: boolean };
            if (!resp.ok || data.error) {
                if (handleAuthError(data.error, resp.status)) return;
                throw new Error(data.error || (lang === 'es' ? 'No se pudo enviar el mensaje.' : 'Failed to send message.'));
            }
            const assistantText = data.content || '';
            setMessages((prev) => [...prev, {
                role: 'assistant',
                content: assistantText,
                timestamp: new Date().toISOString(),
            }]);
            await speakAssistantMessage(assistantText, 'normal');

            // Check if session ended (from flow engine)
            if (data.ended) {
                setSessionEnded(true);
            }
        } catch (e: unknown) {
            console.error(e);
            setMessages((prev) => [...prev, {
                role: 'assistant',
                content: "Error: " + getErrorMessage(e),
                timestamp: new Date().toISOString(),
            }]);
        } finally {
            setIsLoading(false);
            focusTextInput();
        }
    };

    const handleReset = () => {
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
        "font-bold text-xs gap-2",
        primaryActionMode === 'end'
            ? "border-amber-300 text-amber-700 hover:bg-amber-50"
            : "border-primary/20 text-primary hover:bg-primary/10"
    );
    const surfaceClassName = cn(
        "flex flex-col h-full w-full overflow-hidden border-white/10",
        isLtiEmbedded
            ? "rounded-2xl border bg-background/95 shadow-lg"
            : "glass shadow-2xl rounded-3xl"
    );
    const headerClassName = cn(
        "border-b border-white/5 flex justify-between items-center",
        isLtiEmbedded
            ? "px-4 py-3 bg-background/90"
            : "p-4 bg-white/5 backdrop-blur-md"
    );
    const messagesClassName = cn(
        "flex-1 overflow-y-auto space-y-6 custom-scroll bg-gradient-to-b from-transparent to-black/5",
        isLtiEmbedded ? "p-4" : "p-6"
    );
    const inputAreaClassName = cn(
        "border-t border-white/5",
        isLtiEmbedded
            ? "px-4 pb-4 pt-3 bg-background/90"
            : "p-6 pt-2 bg-white/5 backdrop-blur-md"
    );
    const startScreenClassName = cn(
        "flex flex-col items-center justify-center h-full animate-in fade-in duration-500",
        isLtiEmbedded ? "gap-4" : "gap-6"
    );
    const startCardClassName = cn(
        "rounded-3xl bg-white/10 flex items-center justify-center border border-white/10 shadow-lg overflow-hidden",
        isLtiEmbedded ? "w-20 h-20 p-2" : "w-28 h-28 p-3"
    );
    const showResetAction = !isLtiEmbedded;
    const showFlowEngineBadge = !isLtiEmbedded;

    return (
        <div className={surfaceClassName}>
            {/* Chat Header */}
            <div className={headerClassName}>
                <div className="flex items-center space-x-4">
                    <div className="relative">
                        <div className="w-10 h-10 rounded-2xl bg-white flex items-center justify-center shadow-lg overflow-hidden">
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
                            "absolute -bottom-1 -right-1 w-4 h-4 rounded-full border-2 border-slate-900",
                            sessionEnded ? "bg-red-500" : "bg-green-500 animate-pulse"
                        )} />
                    </div>
                    <div>
                        <h2 className="font-bold text-lg leading-tight">{bot.name}</h2>
                        <div className="flex items-center gap-2">
                            <span className={cn(
                                "text-[10px] font-bold uppercase tracking-widest",
                                sessionEnded ? "text-red-400" : "text-primary"
                            )}>
                                {sessionEnded ? copy.session_ended : copy.session_active}
                            </span>

                            <div className="w-1 h-1 rounded-full bg-primary/40" />
                            <span className="text-[10px] text-muted-foreground font-mono">{sessionId?.slice(0, 8)}</span>
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
                            className="font-bold text-xs gap-2 border-slate-300 text-slate-600 hover:bg-slate-100"
                            onClick={handleReset}
                            title={copy.reset_session}
                        >
                            <RefreshCcw className="w-3.5 h-3.5" />
                            {copy.reset_session}
                        </Button>
                    )}
                </div>
            </div>

            {/* Chat Messages */}
            <div className={messagesClassName} ref={scrollRef}>
                {!hasStarted ? (
                    /* Start Button - Shown before conversation begins */
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
                            <h3 className="text-xl font-bold">{bot.name}</h3>
                            {!isLtiEmbedded && (
                                <p className="text-[10px] text-muted-foreground/60 font-bold uppercase tracking-widest">
                                    {copy.manager}
                                </p>
                            )}
                            <p className="text-sm text-muted-foreground max-w-xs">
                                {copy.start_hint}
                            </p>
                        </div>
                        <Button
                            onClick={handleStartChat}
                            disabled={isLoading}
                            className="h-14 px-8 rounded-2xl bg-primary hover:bg-primary/90 shadow-lg shadow-primary/30 text-lg font-bold gap-3 group"
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
                    /* Chat messages - Shown after conversation starts */
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

            {/* Chat Input */}
            <div className={inputAreaClassName}>
                {selectedImages.length > 0 && (
                    <div className="mb-3 p-3 rounded-xl border border-white/10 bg-black/10">
                        <div className="grid grid-cols-3 gap-2">
                            {selectedImages.map((img, idx) => (
                                <div key={`${idx}-${(img.data_url || '').slice(0, 10)}`} className="relative">
                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                    <img
                                        src={img.data_url || ''}
                                        alt="Selected"
                                        className="w-full h-auto max-h-48 object-contain rounded-lg border border-white/10 bg-black/40"
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setSelectedImages((prev) => prev.filter((_, i) => i !== idx))}
                                        className="absolute top-1 right-1 h-5 w-5 rounded-full bg-black/70 text-white flex items-center justify-center"
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
                                "h-12 w-12 rounded-xl border-white/20",
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
                                className="h-12 w-12 rounded-xl border-white/20"
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
                                className="h-12 w-12 rounded-xl border-white/20"
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

                    <form
                        onSubmit={(e) => {
                            e.preventDefault();
                            void handleSend();
                        }}
                        className="relative group flex-1"
                    >
                        <Input
                            ref={inputRef}
                            value={input}
                            onChange={(e) => {
                                setInput(e.target.value);
                            }}
                            placeholder={sessionEnded
                                ? (isLtiEmbedded ? copy.session_ended : copy.input_ended)
                                : copy.input_active}
                            className="w-full h-14 pl-6 pr-16 rounded-2xl bg-background/50 border-white/10 focus:border-primary/50 focus:ring-primary/20 transition-all text-base placeholder:text-muted-foreground/30"
                            disabled={isLoading || sessionEnded}
                        />
                        <Button
                            type="submit"
                            size="icon"
                            className="absolute right-2 top-1/2 -translate-y-1/2 rounded-xl h-10 w-10 shadow-lg shadow-primary/20 group-hover:scale-105 active:scale-95 transition-all"
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
                                "h-12 w-12 rounded-xl border-white/20",
                                ttsEnabled && "border-primary text-primary"
                            )}
                            title={ttsEnabled ? copy.speak_on : copy.speak_off}
                        >
                            {ttsEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
                        </Button>
                    )}
                </div>
                {(isListening || isTranscribing) && (
                    <p className="text-[10px] text-primary mt-2 font-semibold">
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
