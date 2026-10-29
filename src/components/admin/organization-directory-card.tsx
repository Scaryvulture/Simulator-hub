'use client';

import Link from 'next/link';
import { Bot, Building2, Settings2, Trash2, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { AdminOrganizationListItem } from './organization-directory-types';

interface OrganizationDirectoryCardProps {
    organization: AdminOrganizationListItem;
    lang: 'es' | 'en';
    canManageCatalog: boolean;
    onDelete: (id: string) => void;
}

function getAccessLabel(
    organization: Pick<AdminOrganizationListItem, 'sso_id' | 'allow_manual_login'>,
    lang: 'es' | 'en'
) {
    if (organization.sso_id) {
        return {
            chip: 'SSO',
            detail: `SSO · ${organization.sso_id}`,
        };
    }

    if (organization.allow_manual_login) {
        return {
            chip: lang === 'es' ? 'Manual' : 'Manual',
            detail: lang === 'es' ? 'Acceso con login manual' : 'Manual login enabled',
        };
    }

    return {
        chip: lang === 'es' ? 'Interna' : 'Internal',
        detail: lang === 'es' ? 'Uso interno o de reporting' : 'Internal or reporting access',
    };
}

function getAccessTone(organization: Pick<AdminOrganizationListItem, 'sso_id' | 'allow_manual_login'>) {
    if (organization.sso_id) {
        return {
            line: 'from-primary via-primary/60 to-primary/0',
            chip: 'border-primary/15 bg-primary/10 text-primary',
        };
    }

    if (organization.allow_manual_login) {
        return {
            line: 'from-indigo-500 via-indigo-400 to-indigo-200/0',
            chip: 'border-indigo-200 bg-indigo-50 text-indigo-700',
        };
    }

    return {
        line: 'from-slate-500 via-slate-400 to-slate-200/0',
        chip: 'border-slate-200 bg-slate-50 text-slate-600',
    };
}

export function OrganizationDirectoryCard({
    organization,
    lang,
    canManageCatalog,
    onDelete,
}: OrganizationDirectoryCardProps) {
    const access = getAccessLabel(organization, lang);
    const tone = getAccessTone(organization);

    return (
        <article className="admin-directory-card">
            <div className={cn('admin-directory-card-line bg-gradient-to-r', tone.line)} />
            <div className="admin-directory-card-header">
                <div className="flex min-w-0 items-start gap-4">
                    <div className="admin-directory-logo">
                        {organization.logo ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                                src={organization.logo}
                                alt={organization.name}
                                className="h-full w-full object-contain"
                            />
                        ) : (
                            <Building2 className="h-5 w-5" />
                        )}
                    </div>

                    <div className="min-w-0 space-y-2">
                        <span className={cn('admin-directory-card-chip', tone.chip)}>
                            {access.chip}
                        </span>
                        <div className="space-y-1">
                            <h3 className="admin-directory-card-title">{organization.name}</h3>
                            <p className="admin-directory-card-meta truncate">
                                {access.detail}
                            </p>
                        </div>
                    </div>
                </div>

                {canManageCatalog ? (
                    <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => onDelete(organization.id)}
                        className="h-9 w-9 rounded-xl text-slate-400 hover:bg-red-50 hover:text-red-600"
                        aria-label={lang === 'es' ? 'Eliminar organización' : 'Delete organization'}
                    >
                        <Trash2 className="h-4 w-4" />
                    </Button>
                ) : null}
            </div>

            <div className="admin-directory-card-body">
                <div className="admin-directory-card-stats">
                    <span className="admin-directory-card-stat">
                        <Users className="h-4 w-4 text-slate-400" />
                        {organization._count.members} {lang === 'es' ? 'miembros' : 'members'}
                    </span>
                    <span className="admin-directory-card-stat">
                        <Bot className="h-4 w-4 text-slate-400" />
                        {organization._count.bots} bots
                    </span>
                </div>

                <div className="admin-directory-card-actions sm:grid-cols-1">
                    <Button asChild className="h-11 rounded-2xl font-bold shadow-sm">
                        <Link href={`/admin/organizations/${organization.id}`} prefetch={false}>
                            <Settings2 className="mr-2 h-4 w-4" />
                            {lang === 'es' ? 'Administrar' : 'Manage'}
                        </Link>
                    </Button>
                </div>
            </div>
        </article>
    );
}
