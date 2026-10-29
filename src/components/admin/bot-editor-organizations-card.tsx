'use client';

import { Building, Check, ChevronsUpDown } from 'lucide-react';
import { AdminPanel } from '@/components/admin/admin-panel';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { cn } from '@/lib/utils';
import { BotOrgImportDialog } from '@/components/admin/bot-org-import-dialog';

type AvailableOrganization = {
    id: string;
    name: string;
};

interface BotEditorOrganizationsCardProps {
    botId: string;
    lang: 'es' | 'en';
    open: boolean;
    selectedOrgIds: string[];
    availableOrganizations: AvailableOrganization[];
    onOpenChange: (open: boolean) => void;
    onToggleOrg: (orgId: string) => void;
}

export function BotEditorOrganizationsCard({
    botId,
    lang,
    open,
    selectedOrgIds,
    availableOrganizations,
    onOpenChange,
    onToggleOrg,
}: BotEditorOrganizationsCardProps) {
    return (
        <AdminPanel
            variant="subtle"
            title={(
                <span className="inline-flex items-center gap-2">
                    <Building className="h-5 w-5 text-primary" />
                    {lang === 'es' ? 'Distribución organizacional' : 'Organization distribution'}
                </span>
            )}
            description={lang === 'es'
                ? 'Controla qué organizaciones pueden acceder al bot sin alterar el esquema multi-tenant actual.'
                : 'Controls which organizations can access the bot without changing the current multi-tenant model.'}
            actions={<BotOrgImportDialog botId={botId} onSuccess={() => undefined} />}
            contentClassName="space-y-6"
        >
            <div className="space-y-4">
                <label className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">
                    {lang === 'es' ? 'Organizaciones autorizadas' : 'Authorized organizations'}
                </label>
                <Popover open={open} onOpenChange={onOpenChange}>
                    <PopoverTrigger asChild>
                        <Button
                            variant="outline"
                            role="combobox"
                            aria-expanded={open}
                            className="h-12 w-full justify-between rounded-2xl border-slate-200 bg-white text-slate-700"
                        >
                            {selectedOrgIds.length > 0
                                ? `${selectedOrgIds.length} ${lang === 'es' ? 'organizaciones seleccionadas' : 'organizations selected'}`
                                : (lang === 'es' ? 'Seleccionar organizaciones...' : 'Select organizations...')}
                            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50 text-primary" />
                        </Button>
                    </PopoverTrigger>
                    <PopoverContent className="mt-2 w-[320px] rounded-[1.25rem] border-slate-200 bg-white p-0 shadow-xl">
                        <Command className="bg-white">
                            <CommandInput
                                placeholder={lang === 'es' ? 'Buscar organizaciones...' : 'Search organizations...'}
                                className="h-12 border-none bg-slate-50 text-slate-900 focus:ring-0"
                            />
                            <CommandList className="max-h-64">
                                <CommandEmpty className="p-4 text-xs italic text-slate-400">
                                    {lang === 'es' ? 'No se encontraron organizaciones.' : 'No organizations found.'}
                                </CommandEmpty>
                                <CommandGroup>
                                    {availableOrganizations.map((org) => (
                                        <CommandItem
                                            key={org.id}
                                            value={org.name}
                                            onSelect={() => onToggleOrg(org.id)}
                                            className="cursor-pointer p-3 hover:bg-slate-50"
                                        >
                                            <Check
                                                className={cn(
                                                    'mr-2 h-4 w-4 text-primary',
                                                    selectedOrgIds.includes(org.id) ? 'opacity-100' : 'opacity-0'
                                                )}
                                            />
                                            <span className="text-xs font-bold text-slate-700">{org.name}</span>
                                        </CommandItem>
                                    ))}
                                </CommandGroup>
                            </CommandList>
                        </Command>
                    </PopoverContent>
                </Popover>
            </div>

            <div className="min-h-[100px] rounded-[1.5rem] border border-slate-200 bg-white p-5">
                <div className="flex flex-wrap gap-3">
                    {selectedOrgIds.length === 0 ? (
                        <p className="text-xs italic text-slate-400">
                            {lang === 'es' ? 'No hay organizaciones asignadas.' : 'No organizations assigned.'}
                        </p>
                    ) : null}
                    {selectedOrgIds.map((id) => {
                        const org = availableOrganizations.find((item) => item.id === id);
                        return org ? (
                            <Badge
                                key={id}
                                variant="secondary"
                                className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2 text-[10px] font-black tracking-tight text-slate-700"
                            >
                                {org.name}
                                <button
                                    type="button"
                                    onClick={() => onToggleOrg(id)}
                                    className="text-slate-400 transition-colors hover:text-red-600"
                                >
                                    ×
                                </button>
                            </Badge>
                        ) : null;
                    })}
                </div>
            </div>
        </AdminPanel>
    );
}
