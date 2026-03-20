import 'server-only'
import { cookies } from 'next/headers'
import {
    getLtiAccessScopeCookieName,
    verifyLtiAccessScopeToken,
    createLtiAccessScopeToken,
    type LtiAccessScope,
} from '@/lib/lti-access-core'

export async function getCurrentLtiAccessScope(): Promise<LtiAccessScope | null> {
    const cookieStore = await cookies()
    const token = cookieStore.get(getLtiAccessScopeCookieName())?.value
    if (!token) return null
    return await verifyLtiAccessScopeToken(token)
}

export {
    createLtiAccessScopeToken,
    getLtiAccessScopeCookieName,
    verifyLtiAccessScopeToken,
}
export type { LtiAccessScope }
