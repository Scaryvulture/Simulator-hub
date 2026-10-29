'use client';

import { Building2 } from 'lucide-react';

interface OrganizationDirectoryEmptyStateProps {
    lang: 'es' | 'en';
}

export function OrganizationDirectoryEmptyState({ lang }: OrganizationDirectoryEmptyStateProps) {
    return (
        <div className="admin-directory-empty-state">
            <div className="mb-5 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
                <Building2 className="h-9 w-9 text-slate-400" />
            </div>
            <h3 className="text-xl font-black tracking-tight text-slate-900">
                {lang === 'es' ? 'No se encontraron organizaciones' : 'No organizations found'}
            </h3>
            <p className="mt-2 max-w-md text-sm leading-6 text-slate-600">
                {lang === 'es'
                    ? 'Ajustá la búsqueda o creá una organización para continuar.'
                    : 'Adjust the search or create an organization to continue.'}
            </p>
        </div>
    );
}
