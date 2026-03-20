type LogContext = Record<string, unknown>

function serializeError(error: unknown) {
    if (error instanceof Error) {
        return {
            name: error.name,
            message: error.message,
            stack: error.stack,
        }
    }

    return {
        name: 'NonError',
        message: typeof error === 'string' ? error : JSON.stringify(error),
    }
}

export function logServerError(scope: string, error: unknown, context: LogContext = {}) {
    console.error(JSON.stringify({
        level: 'error',
        scope,
        context,
        error: serializeError(error),
        timestamp: new Date().toISOString(),
    }))
}

export function logServerWarning(scope: string, message: string, context: LogContext = {}) {
    console.warn(JSON.stringify({
        level: 'warn',
        scope,
        message,
        context,
        timestamp: new Date().toISOString(),
    }))
}
