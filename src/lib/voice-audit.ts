import 'server-only';
import { incrementSessionCostAudit } from '@/lib/session-cost-audit';
import { SessionCostScope } from '@prisma/client';
import { mutateSessionMetadata } from '@/lib/session-metadata';

export type VoiceAuditChannel = 'chat_tts' | 'chat_stt' | 'realtime_tts' | 'realtime_stt';

export type VoiceAuditEvent = {
    timestamp: string;
    channel: VoiceAuditChannel;
    mode: 'normal' | 'realtime';
    model: string;
    text_chars: number;
    estimated_tokens: number;
    cost_usd: number;
    latency_ms?: number;
    cost_source?: 'provider_duration' | 'server_estimate';
};

type VoiceAuditTotals = {
    total_chars: number;
    total_estimated_tokens: number;
    total_cost_usd: number;
    events: number;
};

function parseVoiceAuditTotals(value: unknown): VoiceAuditTotals {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        return {
            total_chars: 0,
            total_estimated_tokens: 0,
            total_cost_usd: 0,
            events: 0,
        };
    }
    const source = value as Record<string, unknown>;
    return {
        total_chars: typeof source.total_chars === 'number' ? source.total_chars : 0,
        total_estimated_tokens: typeof source.total_estimated_tokens === 'number' ? source.total_estimated_tokens : 0,
        total_cost_usd: typeof source.total_cost_usd === 'number' ? source.total_cost_usd : 0,
        events: typeof source.events === 'number' ? source.events : 0,
    };
}

export async function appendVoiceAuditEvent(sessionId: string, event: VoiceAuditEvent) {
    await mutateSessionMetadata({
        sessionId,
        mutate: (metadata) => {
            const existingEvents = Array.isArray(metadata.voice_audit_events) ? metadata.voice_audit_events : [];
            const nextEvents = [...existingEvents, event].slice(-500);
            const totals = parseVoiceAuditTotals(metadata.voice_audit_totals);

            const nextTotals: VoiceAuditTotals = {
                total_chars: totals.total_chars + event.text_chars,
                total_estimated_tokens: totals.total_estimated_tokens + event.estimated_tokens,
                total_cost_usd: Number((totals.total_cost_usd + event.cost_usd).toFixed(6)),
                events: totals.events + 1,
            };

            metadata.voice_audit_events = nextEvents;
            metadata.voice_audit_totals = nextTotals;

            return { metadata };
        },
    });

    {
        await incrementSessionCostAudit({
            sessionId,
            // STT is part of chat input; provider distinguishes it from text generation.
            scope: event.channel.includes('tts') ? SessionCostScope.TTS : SessionCostScope.CHAT,
            provider: event.channel.includes('tts') ? 'openai_tts' : 'openai_stt',
            model: event.model,
            estimatedTokens: event.estimated_tokens,
            events: 1,
            costUsd: event.cost_usd,
        });
    }
}
