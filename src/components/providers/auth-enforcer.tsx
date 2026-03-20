'use client';

import { useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';

type AuthSessionStatus = {
    authenticated?: boolean;
    homePath?: string;
};

const CHECK_INTERVAL_MS = 30_000;
const LOGIN_PATH = '/login';

export function AuthEnforcer() {
    const pathname = usePathname();
    const isCheckingRef = useRef(false);

    useEffect(() => {
        let disposed = false;

        const checkSession = async () => {
            if (disposed || isCheckingRef.current) return;
            isCheckingRef.current = true;
            try {
                const response = await fetch('/api/auth/session', {
                    method: 'GET',
                    credentials: 'include',
                    cache: 'no-store',
                    headers: {
                        'cache-control': 'no-cache',
                    },
                });

                if (response.status === 401) {
                    if (pathname !== LOGIN_PATH) {
                        window.location.replace(LOGIN_PATH);
                    }
                    return;
                }

                if (!response.ok) return;
                const payload = await response.json().catch(() => ({})) as AuthSessionStatus;

                if (pathname === LOGIN_PATH && payload.authenticated) {
                    const target = typeof payload.homePath === 'string' && payload.homePath.length > 0
                        ? payload.homePath
                        : '/';
                    window.location.replace(target);
                }
            } catch {
                // Ignore transient connectivity errors; server middleware remains source of truth.
            } finally {
                isCheckingRef.current = false;
            }
        };

        const intervalId = window.setInterval(() => {
            void checkSession();
        }, CHECK_INTERVAL_MS);
        const onFocus = () => {
            void checkSession();
        };
        const onVisibilityChange = () => {
            if (document.visibilityState === 'visible') {
                void checkSession();
            }
        };

        window.addEventListener('focus', onFocus);
        document.addEventListener('visibilitychange', onVisibilityChange);
        void checkSession();

        return () => {
            disposed = true;
            window.clearInterval(intervalId);
            window.removeEventListener('focus', onFocus);
            document.removeEventListener('visibilitychange', onVisibilityChange);
        };
    }, [pathname]);

    return null;
}
