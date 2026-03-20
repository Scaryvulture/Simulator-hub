'use client';

import { Toaster } from "@/components/ui/sonner";
import { LanguageProvider } from "@/components/providers/i18n-context";
import { ThemeProvider } from "next-themes";
import { AuthEnforcer } from "@/components/providers/auth-enforcer";

export function Providers({ children }: { children: React.ReactNode }) {
    return (
        <ThemeProvider attribute="class" defaultTheme="dark" enableSystem={false} disableTransitionOnChange>
            <LanguageProvider>
                <AuthEnforcer />
                {children}
                <Toaster position="top-right" />
            </LanguageProvider>
        </ThemeProvider>
    );
}
