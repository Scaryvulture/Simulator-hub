import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
    getEvaluationRawLogRetentionDays,
    shouldExpireEvaluationRawLog,
} from '@/lib/evaluation-log-policy';

describe('evaluation-log-policy', () => {
    it('uses secure default retention by environment', () => {
        const previousNodeEnv = process.env.NODE_ENV;
        const previousRetention = process.env.EVALUATION_RAW_LOG_RETENTION_DAYS;

        try {
            process.env.EVALUATION_RAW_LOG_RETENTION_DAYS = '';

            process.env.NODE_ENV = 'production';
            assert.equal(getEvaluationRawLogRetentionDays(), 30);

            process.env.NODE_ENV = 'development';
            assert.equal(getEvaluationRawLogRetentionDays(), 90);
        } finally {
            if (previousNodeEnv === undefined) {
                delete process.env.NODE_ENV;
            } else {
                process.env.NODE_ENV = previousNodeEnv;
            }
            if (previousRetention === undefined) {
                delete process.env.EVALUATION_RAW_LOG_RETENTION_DAYS;
            } else {
                process.env.EVALUATION_RAW_LOG_RETENTION_DAYS = previousRetention;
            }
        }
    });

    it('expires raw log when older than retention threshold', () => {
        const previousRetention = process.env.EVALUATION_RAW_LOG_RETENTION_DAYS;
        try {
            process.env.EVALUATION_RAW_LOG_RETENTION_DAYS = '30';
            const nowMs = Date.parse('2026-03-05T00:00:00.000Z');

            assert.equal(
                shouldExpireEvaluationRawLog(
                    {
                        raw_log: '{"debug":"x"}',
                        timestamp: '2026-02-01T00:00:00.000Z',
                    },
                    nowMs
                ),
                true
            );

            assert.equal(
                shouldExpireEvaluationRawLog(
                    {
                        raw_log: '{"debug":"x"}',
                        timestamp: '2026-02-20T00:00:00.000Z',
                    },
                    nowMs
                ),
                false
            );
        } finally {
            if (previousRetention === undefined) {
                delete process.env.EVALUATION_RAW_LOG_RETENTION_DAYS;
            } else {
                process.env.EVALUATION_RAW_LOG_RETENTION_DAYS = previousRetention;
            }
        }
    });

    it('fails closed when timestamp is invalid', () => {
        const previousRetention = process.env.EVALUATION_RAW_LOG_RETENTION_DAYS;
        try {
            process.env.EVALUATION_RAW_LOG_RETENTION_DAYS = '30';
            assert.equal(
                shouldExpireEvaluationRawLog({
                    raw_log: '{"debug":"x"}',
                    timestamp: 'not-a-date',
                }),
                true
            );
        } finally {
            if (previousRetention === undefined) {
                delete process.env.EVALUATION_RAW_LOG_RETENTION_DAYS;
            } else {
                process.env.EVALUATION_RAW_LOG_RETENTION_DAYS = previousRetention;
            }
        }
    });
});
