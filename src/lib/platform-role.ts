export type PlatformRole = 'ADMIN' | 'USER'

export function normalizePlatformRole(role: string | null | undefined): PlatformRole {
    return role === 'ADMIN' ? 'ADMIN' : 'USER'
}
