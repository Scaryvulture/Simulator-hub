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
            <nav className="sticky top-0 z-50 w-full border-b border-slate-200 bg-white/95">
                <div className="mx-auto flex h-14 w-full items-center justify-between gap-3 px-4 md:px-6">
                    <Link href={homeHref} prefetch={false} className="flex shrink-0 items-center gap-4">
                        <Image
                            src="/logo.svg"
                            alt="Simulator Hub"
                            width={128}
                            height={34}
                            className="object-contain"
                        />
                        <div className="hidden min-w-0 border-l border-slate-200 pl-4 md:block">
                            <p className="text-[11px] font-bold uppercase tracking-[0.24em] text-slate-500">
                                {lang === 'es' ? 'Administración' : 'Administration'}
                            </p>
                            <p className="truncate text-sm font-semibold text-slate-700">
                                {isAdmin
                                    ? (lang === 'es' ? 'Bots, evaluadores y configuración' : 'Bots, evaluators and configuration')
                                    : (lang === 'es' ? 'Conversaciones y soporte' : 'Conversations and support')}
                            </p>
                        </div>
                    </Link>

                    <div className="flex items-center gap-1.5 md:gap-2">
                        {isAdmin && (
                            <>
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => setManualOpen(true)}
                                    className="h-8 rounded-xl px-3 text-xs font-bold text-slate-600 hover:bg-slate-100 hover:text-slate-950"
                                >
                                    <BookOpen className="mr-2 h-4 w-4 text-primary" />
                                    {t.nav_manual}
                                </Button>
                                <Link
                                    href="/admin/voice-settings"
                                    prefetch={false}
                                    className={cn(
                                        'rounded-xl px-3 py-1.5 text-xs font-bold transition-colors',
                                        pathname.startsWith('/admin/voice-settings')
                                            ? 'bg-primary/10 text-primary'
                                            : 'text-slate-600 hover:bg-slate-100 hover:text-slate-950'
                                    )}
                                >
                                    {lang === 'es' ? 'Voz (TTS)' : 'Voice (TTS)'}
                                </Link>
                            </>
                        )}

                        <form action={logout}>
                            <Button variant="ghost" size="sm" type="submit" className="h-8 rounded-xl px-3 text-xs font-bold text-slate-600 hover:bg-red-50 hover:text-red-600">
                                <LogOut className="mr-2 h-4 w-4" />
                                {t.nav_logout}
                            </Button>
                        </form>
                        <LanguageSwitcher />
                    </div>
                </div>
            </nav>

            {isAdmin && <TechnicalManual open={manualOpen} onOpenChange={setManualOpen} />}
        </>
    );
}
