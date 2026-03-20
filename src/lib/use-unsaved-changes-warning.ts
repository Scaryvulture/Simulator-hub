'use client';

import { useEffect } from 'react';

const DEFAULT_CONFIRM_MESSAGE = 'Hay cambios sin guardar. Si sales ahora, los perderás. ¿Deseas continuar?';

export function useUnsavedChangesWarning(enabled: boolean, message: string = DEFAULT_CONFIRM_MESSAGE) {
    useEffect(() => {
        if (!enabled) return;

        const handleBeforeUnload = (event: BeforeUnloadEvent) => {
            event.preventDefault();
            event.returnValue = '';
        };

        const handleDocumentClick = (event: MouseEvent) => {
            if (event.defaultPrevented) return;
            if (event.button !== 0) return;
            if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;

            const target = event.target;
            if (!(target instanceof Element)) return;

            const anchor = target.closest('a[href]') as HTMLAnchorElement | null;
            if (!anchor) return;
            if (anchor.target === '_blank') return;
            if (anchor.hasAttribute('download')) return;

            const nextUrl = new URL(anchor.href, window.location.href);
            const currentUrl = new URL(window.location.href);
            if (nextUrl.href === currentUrl.href) return;

            const shouldLeave = window.confirm(message);
            if (!shouldLeave) {
                event.preventDefault();
                event.stopPropagation();
            }
        };

        window.addEventListener('beforeunload', handleBeforeUnload);
        document.addEventListener('click', handleDocumentClick, true);

        return () => {
            window.removeEventListener('beforeunload', handleBeforeUnload);
            document.removeEventListener('click', handleDocumentClick, true);
        };
    }, [enabled, message]);
}
