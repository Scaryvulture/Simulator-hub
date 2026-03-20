'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Bot, Users, Coins, MessageSquare, BookOpen, FileSignature, FlaskConical, PlugZap } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ComponentType } from 'react';
import { useLanguage } from '@/components/providers/i18n-context';

interface AdminSidebarProps {
    role: string;
    hasOrgAdminAccess: boolean;
}

type SidebarItem = {
    href: string;
    label: string;
    icon: ComponentType<{ className?: string }>;
};

export function AdminSidebar({ role, hasOrgAdminAccess }: AdminSidebarProps) {
    const pathname = usePathname();
    const { t, lang } = useLanguage();
    const isAdmin = role === 'ADMIN';
    const canViewOrgAdminSections = isAdmin || hasOrgAdminAccess;

    const items: SidebarItem[] = [
        ...(isAdmin
            ? [
                { href: '/admin', label: t.nav_bots, icon: Bot },
                { href: '/admin/users', label: t.nav_users, icon: Users },
                { href: '/admin/pricing', label: t.nav_pricing, icon: Coins },
            ]
            : []),
        ...(canViewOrgAdminSections
            ? [
                { href: '/admin/conversations', label: t.nav_conversations, icon: MessageSquare },
                { href: '/admin/organizations', label: t.nav_organizations, icon: BookOpen },
            ]
            : []),
        ...(isAdmin
            ? [
                { href: '/admin/lti', label: t.nav_lti || 'LTI', icon: PlugZap },
                { href: '/admin/evaluators', label: t.nav_evaluators, icon: FileSignature },
                { href: '/admin/qa-lab', label: t.nav_qa_lab, icon: FlaskConical },
            ]
            : []),
    ];

    const isActive = (href: string) => {
        if (href === '/admin') return pathname === '/admin';
        if (href === '/') return pathname === '/';
        return pathname === href || pathname.startsWith(`${href}/`);
    };

    return (
        <aside className="md:sticky md:top-16 md:h-[calc(100vh-4.5rem)] md:overflow-y-auto">
            <nav className="rounded-xl border border-slate-200 bg-white shadow-sm p-2">
                <p className="px-2 pb-1 text-[10px] font-black uppercase tracking-widest text-slate-500">
                    {lang === 'es' ? 'Navegacion' : 'Navigation'}
                </p>
                <div className="flex md:flex-col gap-1.5 overflow-x-auto md:overflow-visible pb-1 md:pb-0">
                    {items.map((item) => {
                        const Icon = item.icon;
                        const active = isActive(item.href);
                        return (
                            <Link key={item.href} href={item.href} prefetch={false} className="shrink-0">
                                <span
                                    className={cn(
                                        "inline-flex h-9 items-center gap-2 rounded-lg px-3 text-sm font-bold transition-colors",
                                        active
                                            ? "bg-primary/10 text-primary border border-primary/25"
                                            : "text-slate-600 hover:bg-slate-50 border border-transparent hover:border-slate-200"
                                    )}
                                >
                                    <Icon className={cn("h-4 w-4", active ? "text-primary" : "text-slate-400")} />
                                    {item.label}
                                </span>
                            </Link>
                        );
                    })}
                </div>
            </nav>
        </aside>
    );
}
