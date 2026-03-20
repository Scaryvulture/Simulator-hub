'use client';

import { Button } from "@/components/ui/button";
import { LogOut, BookOpen } from "lucide-react";
import Link from "next/link";
import Image from "next/image";
import { logout } from "@/app/actions/auth";
import { useLanguage } from "@/components/providers/i18n-context";
import { useState } from "react";
import { TechnicalManual } from "./technical-manual";
import { LanguageSwitcher } from "@/components/providers/language-switcher";
import { ThemeToggle } from "@/components/providers/theme-toggle";

import { cn } from "@/lib/utils";
import { usePathname } from "next/navigation";

interface Props {
    role: string;
    hasOrgAdminAccess: boolean;
}

export function AdminNav({ role, hasOrgAdminAccess }: Props) {
    const { t, lang } = useLanguage();
    const pathname = usePathname();
    const [manualOpen, setManualOpen] = useState(false);
    const isAdmin = role === 'ADMIN';
    const homeHref = isAdmin ? '/admin' : hasOrgAdminAccess ? '/conversations' : '/';

    return (
        <>
            <nav className="sticky top-0 z-50 w-full border-b border-border bg-card shadow-sm">
                <div className="w-full h-14 px-3 md:px-4 lg:px-5 flex items-center justify-between gap-3">
                    <Link href={homeHref} prefetch={false} className="shrink-0 flex items-center">
                        <Image
                            src="/logo.svg"
                            alt="Simulator Hub"
                            width={140}
                            height={38}
                            className="object-contain dark:hidden"
                        />
                        <Image
                            src="/logo.svg"
                            alt="Simulator Hub"
                            width={140}
                            height={38}
                            className="hidden object-contain dark:block"
                        />
                    </Link>

                    <div className="flex items-center gap-1.5 md:gap-2.5">
                        {isAdmin && (
                            <>
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => setManualOpen(true)}
                                    className="h-9 text-foreground hover:text-primary hover:bg-muted font-bold text-xs"
                                >
                                    <BookOpen className="mr-2 h-4 w-4 text-primary" /> {t.nav_manual}
                                </Button>
                                <Link href="/admin/voice-settings" prefetch={false} className={cn("text-sm font-bold transition-colors hover:text-primary", pathname.startsWith('/admin/voice-settings') ? "text-primary" : "text-muted-foreground")}>
                                    {lang === 'es' ? 'Voz (TTS)' : 'Voice (TTS)'}
                                </Link>
                            </>
                        )}

                        <form action={logout}>
                            <Button variant="ghost" size="sm" type="submit" className="h-9 text-muted-foreground hover:text-destructive hover:bg-destructive/10 font-bold text-xs">
                                <LogOut className="mr-2 h-4 w-4" /> {t.nav_logout}
                            </Button>
                        </form>
                        <LanguageSwitcher />
                        <ThemeToggle className="h-9 w-9 rounded-full shadow-sm" />
                    </div>
                </div>
            </nav>

            {isAdmin && <TechnicalManual open={manualOpen} onOpenChange={setManualOpen} />}
        </>
    );
}
