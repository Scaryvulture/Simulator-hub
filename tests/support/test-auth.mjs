export class AuthorizationError extends Error { constructor() { super('Forbidden'); this.status = 403; } }
export const getCurrentUser = async () => globalThis.__auditActor;
export const getSessionActor = getCurrentUser;
export const verifyAdmin = async () => {
    const actor = await getCurrentUser();
    if (actor?.role !== 'ADMIN') throw new AuthorizationError();
    return actor;
};
export const verifyAdminOrOrgAdmin = async () => {
    const actor = await getCurrentUser();
    if (!actor || (actor.role !== 'ADMIN' && !actor.hasOrgAdminAccess)) throw new AuthorizationError();
    return actor;
};
export const isAuthorizationError = (error) => error instanceof AuthorizationError;
