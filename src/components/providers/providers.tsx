'use client';

import { Toaster } from "@/components/ui/sonner";
import { LanguageProvider } from "@/components/providers/i18n-context";
import { ThemeProvider } from "next-themes";
import { AuthEnforcer } from "@/components/providers/auth-enforcer";
import { usePathname } from "next/navigation";
import { isWorkspaceThemeForcedPath } from "@/lib/theme-routing";

export function Providers({ children, nonce }: { children: React.ReactNode; nonce?: string }) {
    const pathname = usePathname();
    const forcedTheme = isWorkspaceThemeForcedPath(pathname) ? 'light' : undefined;

    return (
        <ThemeProvider
            nonce={nonce}
            attribute="class"
            defaultTheme="dark"
            enableSystem={false}
            disableTransitionOnChange
            forcedTheme={forcedTheme}
        >
            <LanguageProvider>
                <AuthEnforcer />
                {children}
                <Toaster position="top-right" />
            </LanguageProvider>
        </ThemeProvider>
    );
}
