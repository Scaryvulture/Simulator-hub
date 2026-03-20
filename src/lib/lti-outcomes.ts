import 'server-only';

import { randomUUID } from 'crypto';
import { importJWK, SignJWT, type JWK } from 'jose';

import prisma from '@/lib/prisma';
import { mutateSessionMetadata, toSessionMetadataObject } from '@/lib/session-metadata';
import type { LtiAgsEndpoint } from '@/lib/lti-claims';
import type { StoredEvaluationResult } from '@/lib/evaluation-result';
import type { LtiOutcomeSyncResult, LtiOutcomeSyncStatus } from '@/lib/lti-outcome-result';
import {
    buildLtiScorePayload,
    pickLineitemUrlForResourceLink,
    type LtiLineitemSummary,
} from '@/lib/lti-outcomes-core';

const LTI_AGS_SCOPE_SCORE = 'https://purl.imsglobal.org/spec/lti-ags/scope/score';
const LTI_AGS_SCOPE_LINEITEM = 'https://purl.imsglobal.org/spec/lti-ags/scope/lineitem';
const LTI_AGS_SCOPE_LINEITEM_READONLY = 'https://purl.imsglobal.org/spec/lti-ags/scope/lineitem.readonly';
const LTI_DEPLOYMENT_ID_CLAIM = 'https://purl.imsglobal.org/spec/lti/claim/deployment_id';
const OAUTH_CLIENT_ASSERTION_TYPE = 'urn:ietf:params:oauth:client-assertion-type:jwt-bearer';
const LINEITEM_ACCEPT_HEADER = 'application/vnd.ims.lis.v2.lineitemcontainer+json';
const SCORE_CONTENT_TYPE = 'application/vnd.ims.lis.v1.score+json';

type LtiLaunchMetadata = {
    issuer: string | null;
    deploymentId: string | null;
    resourceLinkId: string | null;
    ags: LtiAgsEndpoint | null;
};

type LtiServicesConfig = {
    clientId: string;
    accessTokenUrl: string;
    privateJwk: JWK;
    algorithm: string;
    keyId: string | null;
};

function parseJsonObject(value: string | undefined, name: string): Record<string, unknown> {
    if (!value?.trim()) {
        throw new Error(`${name} is not configured.`);
    }

    try {
        const parsed = JSON.parse(value) as unknown;
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
            throw new Error(`${name} must be a JSON object.`);
        }
        return parsed as Record<string, unknown>;
    } catch (error) {
        const message = error instanceof Error ? error.message : `Invalid ${name}.`;
        throw new Error(message);
    }
}

function getLtiServicesConfig(): LtiServicesConfig {
    const clientId = process.env.LTI_CLIENT_ID?.trim();
    const accessTokenUrl = process.env.LTI_ACCESS_TOKEN_URL?.trim();

    if (!clientId) {
        throw new Error('LTI_CLIENT_ID is not configured.');
    }
    if (!accessTokenUrl) {
        throw new Error('LTI_ACCESS_TOKEN_URL is not configured.');
    }

    const privateJwk = parseJsonObject(process.env.LTI_TOOL_PRIVATE_JWK, 'LTI_TOOL_PRIVATE_JWK') as JWK;
    const algorithm = typeof privateJwk.alg === 'string' && privateJwk.alg.trim()
        ? privateJwk.alg.trim()
        : 'RS256';
    const keyId = typeof privateJwk.kid === 'string' && privateJwk.kid.trim()
        ? privateJwk.kid.trim()
        : null;

    return {
        clientId,
        accessTokenUrl,
        privateJwk,
        algorithm,
        keyId,
    };
}

function parseAgsEndpoint(value: unknown): LtiAgsEndpoint | null {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        return null;
    }

    const source = value as Record<string, unknown>;
    const lineitem = typeof source.lineitem === 'string' && source.lineitem.trim()
        ? source.lineitem.trim()
        : null;
    const lineitems = typeof source.lineitems === 'string' && source.lineitems.trim()
        ? source.lineitems.trim()
        : null;
    const scope = Array.isArray(source.scope)
        ? source.scope
            .filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0)
            .map((entry) => entry.trim())
        : [];

    if (!lineitem && !lineitems && scope.length === 0) {
        return null;
    }

    return {
        lineitem,
        lineitems,
        scope: [...new Set(scope)],
    };
}

function parseLtiLaunchMetadata(value: unknown): LtiLaunchMetadata | null {
    const metadata = toSessionMetadataObject(value);
    const ltiLaunch = metadata.lti_launch;
    if (!ltiLaunch || typeof ltiLaunch !== 'object' || Array.isArray(ltiLaunch)) {
        return null;
    }

    const source = ltiLaunch as Record<string, unknown>;
    return {
        issuer: typeof source.issuer === 'string' && source.issuer.trim() ? source.issuer.trim() : null,
        deploymentId: typeof source.deployment_id === 'string' && source.deployment_id.trim()
            ? source.deployment_id.trim()
            : null,
        resourceLinkId: typeof source.resource_link_id === 'string' && source.resource_link_id.trim()
            ? source.resource_link_id.trim()
            : null,
        ags: parseAgsEndpoint(source.ags),
    };
}

function parseOutcomeSyncResult(value: unknown): LtiOutcomeSyncResult | null {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        return null;
    }

    const source = value as Record<string, unknown>;
    const status = source.status;
    const attemptedAt = source.attemptedAt;
    if ((status !== 'synced' && status !== 'skipped' && status !== 'failed') || typeof attemptedAt !== 'string') {
        return null;
    }

    return {
        status,
        scoreGiven: typeof source.scoreGiven === 'number' ? source.scoreGiven : null,
        scoreMaximum: typeof source.scoreMaximum === 'number' ? source.scoreMaximum : null,
        lineitemUrl: typeof source.lineitemUrl === 'string' && source.lineitemUrl.trim()
            ? source.lineitemUrl.trim()
            : null,
        error: typeof source.error === 'string' && source.error.trim() ? source.error.trim() : null,
        attemptedAt,
    };
}

function buildOutcomeResult(params: {
    status: LtiOutcomeSyncStatus;
    scoreGiven?: number | null;
    scoreMaximum?: number | null;
    lineitemUrl?: string | null;
    error?: string | null;
}): LtiOutcomeSyncResult {
    return {
        status: params.status,
        scoreGiven: typeof params.scoreGiven === 'number' ? params.scoreGiven : null,
        scoreMaximum: typeof params.scoreMaximum === 'number' ? params.scoreMaximum : null,
        lineitemUrl: typeof params.lineitemUrl === 'string' && params.lineitemUrl.trim()
            ? params.lineitemUrl.trim()
            : null,
        error: typeof params.error === 'string' && params.error.trim() ? params.error.trim() : null,
        attemptedAt: new Date().toISOString(),
    };
}

async function persistOutcomeResult(sessionId: string, result: LtiOutcomeSyncResult): Promise<LtiOutcomeSyncResult> {
    await mutateSessionMetadata({
        sessionId,
        mutate: (metadata) => {
            metadata.lti_outcome_sync = result;
            return { metadata };
        },
    });

    return result;
}

async function createServiceAccessToken(params: {
    scopes: string[];
    deploymentId: string | null;
}): Promise<string> {
    const config = getLtiServicesConfig();
    const key = await importJWK(config.privateJwk, config.algorithm);
    const payload: Record<string, unknown> = {};
    if (params.deploymentId) {
        payload[LTI_DEPLOYMENT_ID_CLAIM] = params.deploymentId;
    }

    const clientAssertion = await new SignJWT(payload)
        .setProtectedHeader({
            alg: config.algorithm,
            ...(config.keyId ? { kid: config.keyId } : {}),
        })
        .setIssuedAt()
        .setIssuer(config.clientId)
        .setSubject(config.clientId)
        .setAudience(config.accessTokenUrl)
        .setExpirationTime('5m')
        .setJti(randomUUID())
        .sign(key);

    const body = new URLSearchParams({
        grant_type: 'client_credentials',
        client_assertion_type: OAUTH_CLIENT_ASSERTION_TYPE,
        client_assertion: clientAssertion,
        scope: params.scopes.join(' '),
    });

    const response = await fetch(config.accessTokenUrl, {
        method: 'POST',
        headers: {
            'content-type': 'application/x-www-form-urlencoded',
        },
        body: body.toString(),
        cache: 'no-store',
    });

    const payloadResponse = await response.json().catch(() => ({})) as { access_token?: unknown; error?: unknown; error_description?: unknown };
    if (!response.ok) {
        const detail = typeof payloadResponse.error_description === 'string'
            ? payloadResponse.error_description
            : (typeof payloadResponse.error === 'string' ? payloadResponse.error : `HTTP ${response.status}`);
        throw new Error(`LTI access token request failed: ${detail}`);
    }

    if (typeof payloadResponse.access_token !== 'string' || !payloadResponse.access_token.trim()) {
        throw new Error('LTI access token response did not include access_token.');
    }

    return payloadResponse.access_token.trim();
}

function buildScoresUrl(lineitemUrl: string): string {
    const url = new URL(lineitemUrl);
    url.pathname = url.pathname.endsWith('/')
        ? `${url.pathname}scores`
        : `${url.pathname}/scores`;
    return url.toString();
}

function readResourceLinkId(lineitem: unknown): string | null {
    if (!lineitem || typeof lineitem !== 'object' || Array.isArray(lineitem)) {
        return null;
    }
    const source = lineitem as Record<string, unknown>;
    return typeof source.resourceLinkId === 'string' && source.resourceLinkId.trim()
        ? source.resourceLinkId.trim()
        : null;
}

function parseLineitemSummaries(value: unknown): LtiLineitemSummary[] {
    if (!Array.isArray(value)) return [];

    return value
        .map((entry) => {
            if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
                return null;
            }
            const source = entry as Record<string, unknown>;
            const id = typeof source.id === 'string' && source.id.trim()
                ? source.id.trim()
                : null;
            if (!id) return null;

            return {
                id,
                resourceLinkId: readResourceLinkId(source),
            } satisfies LtiLineitemSummary;
        })
        .filter((entry): entry is LtiLineitemSummary => Boolean(entry));
}

async function resolveLineitemUrl(params: {
    ags: LtiAgsEndpoint;
    resourceLinkId: string;
    accessToken: string;
}): Promise<string> {
    if (params.ags.lineitem) {
        return params.ags.lineitem;
    }

    if (!params.ags.lineitems) {
        throw new Error('LTI AGS launch did not include a lineitem or lineitems endpoint.');
    }

    const canReadLineitems = params.ags.scope.includes(LTI_AGS_SCOPE_LINEITEM)
        || params.ags.scope.includes(LTI_AGS_SCOPE_LINEITEM_READONLY);
    if (!canReadLineitems) {
        throw new Error('LTI AGS launch can score but cannot resolve lineitems for this resource.');
    }

    const lineitemsUrl = new URL(params.ags.lineitems);
    lineitemsUrl.searchParams.set('resource_link_id', params.resourceLinkId);

    const response = await fetch(lineitemsUrl, {
        method: 'GET',
        headers: {
            authorization: `Bearer ${params.accessToken}`,
            accept: LINEITEM_ACCEPT_HEADER,
        },
        cache: 'no-store',
    });

    const responsePayload = await response.json().catch(() => null);
    if (!response.ok) {
        throw new Error(`LTI lineitems lookup failed with HTTP ${response.status}.`);
    }

    return pickLineitemUrlForResourceLink(
        parseLineitemSummaries(responsePayload),
        params.resourceLinkId
    );
}

async function publishScore(params: {
    lineitemUrl: string;
    accessToken: string;
    ltiUserId: string;
    scoreGiven: number;
    scoreMaximum: number;
}): Promise<void> {
    const response = await fetch(buildScoresUrl(params.lineitemUrl), {
        method: 'POST',
        headers: {
            authorization: `Bearer ${params.accessToken}`,
            'content-type': SCORE_CONTENT_TYPE,
        },
        body: JSON.stringify(buildLtiScorePayload({
            ltiUserId: params.ltiUserId,
            scoreGiven: params.scoreGiven,
            scoreMaximum: params.scoreMaximum,
        })),
        cache: 'no-store',
    });

    if (!response.ok) {
        const errorText = await response.text().catch(() => '');
        const detail = errorText.trim() || `HTTP ${response.status}`;
        throw new Error(`LTI score publish failed: ${detail}`);
    }
}

function selectRequiredScopes(ags: LtiAgsEndpoint): string[] {
    const scopes = new Set<string>();
    if (ags.scope.includes(LTI_AGS_SCOPE_SCORE)) {
        scopes.add(LTI_AGS_SCOPE_SCORE);
    }
    if (!ags.lineitem) {
        if (ags.scope.includes(LTI_AGS_SCOPE_LINEITEM_READONLY)) {
            scopes.add(LTI_AGS_SCOPE_LINEITEM_READONLY);
        } else if (ags.scope.includes(LTI_AGS_SCOPE_LINEITEM)) {
            scopes.add(LTI_AGS_SCOPE_LINEITEM);
        }
    }
    return Array.from(scopes);
}

export async function syncEvaluationToLtiOutcome(params: {
    sessionId: string;
    evaluation: StoredEvaluationResult;
}): Promise<LtiOutcomeSyncResult> {
    const session = await prisma.session.findUnique({
        where: { id: params.sessionId },
        select: {
            id: true,
            metadata: true,
            external_user_id: true,
        },
    });

    if (!session) {
        throw new Error('Session not found.');
    }

    const metadata = toSessionMetadataObject(session.metadata);
    const existingResult = parseOutcomeSyncResult(metadata.lti_outcome_sync);
    if (existingResult && (existingResult.status === 'synced' || existingResult.status === 'skipped')) {
        return existingResult;
    }

    if (params.evaluation.source === 'admin_manual') {
        return existingResult || buildOutcomeResult({
            status: 'skipped',
            error: 'Latest evaluation was produced by an admin reevaluation.',
        });
    }

    const launch = parseLtiLaunchMetadata(metadata);
    if (!launch) {
        return existingResult || await persistOutcomeResult(params.sessionId, buildOutcomeResult({
            status: 'skipped',
            error: 'Session is not associated with an LTI launch.',
        }));
    }

    if (!launch.ags || launch.ags.scope.length === 0) {
        return await persistOutcomeResult(params.sessionId, buildOutcomeResult({
            status: 'skipped',
            error: 'LTI launch did not include Assignment and Grade Services.',
        }));
    }

    if (!launch.ags.scope.includes(LTI_AGS_SCOPE_SCORE)) {
        return await persistOutcomeResult(params.sessionId, buildOutcomeResult({
            status: 'skipped',
            error: 'LTI launch does not grant score publishing scope.',
        }));
    }

    if (!launch.resourceLinkId) {
        return await persistOutcomeResult(params.sessionId, buildOutcomeResult({
            status: 'failed',
            error: 'LTI launch is missing resource_link_id.',
        }));
    }

    const user = session.external_user_id
        ? await prisma.appUser.findUnique({
            where: { id: session.external_user_id },
            select: {
                lti_subject: true,
            },
        })
        : null;
    const ltiUserId = typeof user?.lti_subject === 'string' && user.lti_subject.trim()
        ? user.lti_subject.trim()
        : null;
    if (!ltiUserId) {
        return await persistOutcomeResult(params.sessionId, buildOutcomeResult({
            status: 'failed',
            error: 'User is missing lti_subject required for score publishing.',
        }));
    }

    const requiredScopes = selectRequiredScopes(launch.ags);
    if (requiredScopes.length === 0) {
        return await persistOutcomeResult(params.sessionId, buildOutcomeResult({
            status: 'failed',
            error: 'LTI launch does not provide the scopes required to resolve and publish the score.',
        }));
    }

    try {
        const accessToken = await createServiceAccessToken({
            scopes: requiredScopes,
            deploymentId: launch.deploymentId,
        });
        const lineitemUrl = await resolveLineitemUrl({
            ags: launch.ags,
            resourceLinkId: launch.resourceLinkId,
            accessToken,
        });

        await publishScore({
            lineitemUrl,
            accessToken,
            ltiUserId,
            scoreGiven: params.evaluation.percentage,
            scoreMaximum: 100,
        });

        return await persistOutcomeResult(params.sessionId, buildOutcomeResult({
            status: 'synced',
            scoreGiven: params.evaluation.percentage,
            scoreMaximum: 100,
            lineitemUrl,
        }));
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown LTI score sync error.';
        return await persistOutcomeResult(params.sessionId, buildOutcomeResult({
            status: 'failed',
            scoreGiven: params.evaluation.percentage,
            scoreMaximum: 100,
            error: message,
        }));
    }
}
