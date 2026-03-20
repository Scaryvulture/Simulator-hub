type PublicBotChatFeatures = {
    allow_image_upload: boolean;
    allow_voice_input: boolean;
    allow_voice_output: boolean;
    tts_settings: {
        speed: number;
        voice: string;
        accent: string;
        gender: 'female' | 'male' | 'neutral' | 'random';
        style: string;
        use_archetype: boolean;
    };
};

export type PublicBot = {
    id: string;
    name: string;
    bot_type: string;
    published: boolean;
    logo: string | null;
    config: {
        logo_url: string;
        evaluator_bot_id: string;
        chat_features: PublicBotChatFeatures;
    };
};

type BotLike = {
    id: unknown;
    name: unknown;
    bot_type: unknown;
    published: unknown;
    logo?: unknown;
    config?: unknown;
};

function asRecord(value: unknown): Record<string, unknown> | null {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    return value as Record<string, unknown>;
}

function asString(value: unknown, fallback = ''): string {
    return typeof value === 'string' ? value : fallback;
}

function asBoolean(value: unknown, fallback = false): boolean {
    return typeof value === 'boolean' ? value : fallback;
}

function asNumber(value: unknown, fallback: number): number {
    return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function normalizeGender(value: unknown): 'female' | 'male' | 'neutral' | 'random' {
    if (value === 'female' || value === 'male' || value === 'neutral' || value === 'random') {
        return value;
    }
    return 'neutral';
}

function mapLogo(logoBytes: unknown): string | null {
    if (!logoBytes) return null;
    try {
        const bytes = logoBytes instanceof Uint8Array ? logoBytes : new Uint8Array(logoBytes as ArrayBuffer);
        return `data:image/png;base64,${Buffer.from(bytes).toString('base64')}`;
    } catch {
        return null;
    }
}

function buildDefaultChatFeatures(): PublicBotChatFeatures {
    return {
        allow_image_upload: false,
        allow_voice_input: true,
        allow_voice_output: true,
        tts_settings: {
            speed: 1.15,
            voice: '',
            accent: '',
            gender: 'neutral',
            style: '',
            use_archetype: false,
        },
    };
}

export function toPublicBotResponse(source: BotLike): PublicBot {
    const rawConfig = asRecord(source.config);
    const rawChatFeatures = asRecord(rawConfig?.chat_features);
    const rawTtsSettings = asRecord(rawChatFeatures?.tts_settings);
    const defaultChatFeatures = buildDefaultChatFeatures();

    return {
        id: asString(source.id),
        name: asString(source.name),
        bot_type: asString(source.bot_type),
        published: asBoolean(source.published, false),
        logo: mapLogo(source.logo),
        config: {
            logo_url: asString(rawConfig?.logo_url),
            evaluator_bot_id: asString(rawConfig?.evaluator_bot_id),
            chat_features: {
                allow_image_upload: asBoolean(
                    rawChatFeatures?.allow_image_upload,
                    defaultChatFeatures.allow_image_upload
                ),
                allow_voice_input: asBoolean(
                    rawChatFeatures?.allow_voice_input,
                    defaultChatFeatures.allow_voice_input
                ),
                allow_voice_output: asBoolean(
                    rawChatFeatures?.allow_voice_output,
                    defaultChatFeatures.allow_voice_output
                ),
                tts_settings: {
                    speed: asNumber(rawTtsSettings?.speed, defaultChatFeatures.tts_settings.speed),
                    voice: asString(rawTtsSettings?.voice),
                    accent: asString(rawTtsSettings?.accent),
                    gender: normalizeGender(rawTtsSettings?.gender),
                    style: asString(rawTtsSettings?.style),
                    use_archetype: asBoolean(rawTtsSettings?.use_archetype, false),
                },
            },
        },
    };
}
