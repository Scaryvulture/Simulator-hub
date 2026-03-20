import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { toPublicBotResponse } from '@/lib/public-bot-contract';

describe('public-bot-contract', () => {
    it('projects only allowlisted public fields', () => {
        const safe = toPublicBotResponse({
            id: 'bot_1',
            name: 'Bot Publico',
            bot_type: 'STANDARD',
            published: true,
            logo: Buffer.from([1, 2, 3]),
            api_key: 'sk-secret',
            openai_prompt_id: 'pmpt-secret',
            openai_vector_store_id: 'vs-secret',
            config: {
                logo_url: 'https://example.com/logo.png',
                evaluator_bot_id: 'eval_1',
                system_prompt: 'never expose',
                api_key: 'sk-config-secret',
                chat_features: {
                    allow_image_upload: true,
                    allow_voice_input: false,
                    allow_voice_output: false,
                    extra_private_toggle: true,
                    tts_settings: {
                        speed: 1.5,
                        voice: 'alloy',
                        accent: 'rioplatense',
                        gender: 'male',
                        style: 'formal',
                        use_archetype: true,
                        internal_token: 'should-not-exist',
                    },
                },
            },
        } as unknown as Record<string, unknown>);

        assert.deepEqual(Object.keys(safe).sort(), ['bot_type', 'config', 'id', 'logo', 'name', 'published']);
        assert.equal((safe as unknown as { api_key?: string }).api_key, undefined);
        assert.equal((safe as unknown as { openai_prompt_id?: string }).openai_prompt_id, undefined);
        assert.equal((safe as unknown as { openai_vector_store_id?: string }).openai_vector_store_id, undefined);

        assert.deepEqual(Object.keys(safe.config).sort(), ['chat_features', 'evaluator_bot_id', 'logo_url']);
        assert.deepEqual(Object.keys(safe.config.chat_features).sort(), ['allow_image_upload', 'allow_voice_input', 'allow_voice_output', 'tts_settings']);
        assert.deepEqual(Object.keys(safe.config.chat_features.tts_settings).sort(), ['accent', 'gender', 'speed', 'style', 'use_archetype', 'voice']);
    });

    it('applies safe defaults for malformed or missing config', () => {
        const safe = toPublicBotResponse({
            id: 'bot_2',
            name: 'Bot Defaults',
            bot_type: 'STANDARD',
            published: false,
            config: {
                chat_features: {
                    allow_image_upload: 'yes',
                    tts_settings: {
                        speed: 'fast',
                        gender: 'unknown',
                    },
                },
            },
        } as unknown as Record<string, unknown>);

        assert.equal(safe.config.chat_features.allow_image_upload, false);
        assert.equal(safe.config.chat_features.allow_voice_input, true);
        assert.equal(safe.config.chat_features.allow_voice_output, true);
        assert.equal(safe.config.chat_features.tts_settings.speed, 1.15);
        assert.equal(safe.config.chat_features.tts_settings.gender, 'neutral');
    });
});
