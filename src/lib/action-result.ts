export type ActionResult<T> =
    | { success: true; data: T }
    | { success: false; error: string };

export function actionSuccess<T>(data: T): ActionResult<T> {
    return { success: true, data };
}

export function actionFailure<T>(error: string): ActionResult<T> {
    return { success: false, error };
}

export function resolveActionErrorMessage(error: unknown, fallback: string): string {
    if (error instanceof Error) {
        const message = error.message.trim();
        if (message) return message;
    }
    return fallback;
}
