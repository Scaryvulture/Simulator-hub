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
        <aside className="admin-rail px-4 py-4 md:px-0 md:py-0">
            <nav className="admin-rail-surface">
                <div className="admin-rail-header">
                    <p className="admin-rail-title">
                        {lang === 'es' ? 'Navegación' : 'Navigation'}
                    </p>
                    <p className="admin-rail-caption">
                        {lang === 'es' ? 'Accesos del panel' : 'Workspace sections'}
                    </p>
                </div>
                <div className="admin-rail-nav">
                    {items.map((item) => {
                        const Icon = item.icon;
                        const active = isActive(item.href);
                        return (
                            <Link key={item.href} href={item.href} prefetch={false} className="shrink-0">
                                <span
                                    className={cn(
                                        'admin-rail-link',
                                        active
                                            ? 'admin-rail-link-active'
                                            : 'admin-rail-link-idle'
                                    )}
                                >
                                    <Icon className={cn('h-4 w-4', active ? 'text-primary' : 'text-slate-400')} />
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
