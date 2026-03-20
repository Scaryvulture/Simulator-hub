import { BotConfig, BotConfigSchema } from './schemas/bot-config'
import prisma from './prisma'
import type { Bot } from '@prisma/client'
import type { ZodError } from 'zod'
import { collectBotConfigCompatibilityWarningMessages } from './bot-config-compat'

export type BotConfigValidation = {
    valid: boolean;
    block_runtime: boolean;
    mode: 'strict' | 'compat';
    issues: string[];
    warnings: string[];
};

function summarizeConfigIssues(error: ZodError): string[] {
    return error.issues.slice(0, 10).map((issue) => {
        const path = issue.path.length > 0 ? issue.path.join('.') : 'config';
        return `${path}: ${issue.message}`;
    });
}

export class BotService {
    /**
   * Retrieves the bot and its validated configuration.
   */
    static async getBot(botId: string): Promise<{ bot: Bot, config: BotConfig, validation: BotConfigValidation }> {
        const bot = await prisma.bot.findFirst({
            where: { id: botId, deleted_at: null },
        })

        if (!bot) {
            throw new Error(`Bot with ID ${botId} not found`)
        }

        // Handle string or object config
        let configData = bot.config
        let parseIssue: string | null = null;
        if (typeof configData === 'string') {
            try {
                configData = JSON.parse(configData)
            } catch (e) {
                console.error(`Failed to parse config for bot ${botId}`, e)
                parseIssue = 'config: Invalid JSON string.';
                configData = {}
            }
        }

        // Validate with Zod
        const result = BotConfigSchema.safeParse(configData || {})
        const isValid = parseIssue === null && result.success;

        // Runtime-safe fallback: if invalid, do not execute arbitrary malformed config.
        const strictRuntimeEnabled = process.env.BOT_CONFIG_RUNTIME_STRICT_PUBLISHED === 'true';
        const strictRuntime = strictRuntimeEnabled && process.env.NODE_ENV === 'production' && bot.published === true;
        const mode: BotConfigValidation['mode'] = strictRuntime ? 'strict' : 'compat';
        const issues = [
            ...(parseIssue ? [parseIssue] : []),
            ...(!result.success ? summarizeConfigIssues(result.error) : []),
        ];
        const warnings = collectBotConfigCompatibilityWarningMessages(configData || {});
        if (!isValid) {
            console.warn(
                `[bot-config] validation failed bot=${botId} mode=${mode} block_runtime=${strictRuntime} issues=${issues.join(' | ')}`
            )
        }
        if (warnings.length > 0) {
            console.warn(
                `[bot-config] compatibility warnings bot=${botId} mode=${mode} warnings=${warnings.slice(0, 20).join(' | ')}`
            )
        }

        const config = (isValid && result.success ? result.data : {}) as BotConfig;
        const validation: BotConfigValidation = {
            valid: isValid,
            block_runtime: !isValid && strictRuntime,
            mode,
            issues,
            warnings,
        };

        return { bot, config, validation }
    }
}
