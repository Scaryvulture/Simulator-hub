'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useLanguage } from '@/components/providers/i18n-context';
import { Upload, FileUp, AlertCircle, CheckCircle2, Download } from 'lucide-react';
import { importOrganizationsFromCSV } from '@/app/actions/organizations';
import { toast } from 'sonner';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { ScrollArea } from '@/components/ui/scroll-area';

type OrganizationImportActionResult = Awaited<ReturnType<typeof importOrganizationsFromCSV>>;
type OrganizationImportResult = Extract<OrganizationImportActionResult, { success: true }>['data'];

function getErrorMessage(error: unknown): string {
    return error instanceof Error ? error.message : 'Unknown error';
}

const ORGANIZATION_IMPORT_TEMPLATE = [
    'organization_name,allow_manual_login,members,bots',
    'Acme Corp,true,"jane.doe;org.admin","Simulador Ventas;Bot Seguridad"',
    'North Branch,false,,',
].join('\n');

export function OrganizationImportDialog() {
    const { lang } = useLanguage();
    const [open, setOpen] = useState(false);
    const [file, setFile] = useState<File | null>(null);
    const [uploading, setUploading] = useState(false);
    const [result, setResult] = useState<OrganizationImportResult | null>(null);

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            setFile(e.target.files[0]);
            setResult(null);
        }
    };

    const handleUpload = async () => {
        if (!file) return;

        setUploading(true);
        const formData = new FormData();
        formData.append('file', file);

        try {
            const res = await importOrganizationsFromCSV(formData);
            if (!res.success) {
                toast.error(res.error);
                return;
            }
            setResult(res.data);
            if (res.data.created > 0 || res.data.updated > 0 || res.data.member_links > 0 || res.data.bot_links > 0) {
                toast.success(lang === 'es' ? 'Importación de organizaciones completada' : 'Organization import completed');
            } else if (res.data.errors.length > 0) {
                toast.warning(lang === 'es' ? 'Importación completada con observaciones' : 'Import completed with warnings');
            } else {
                toast.info(lang === 'es' ? 'No hubo cambios para aplicar' : 'No changes were applied');
            }
        } catch (error: unknown) {
            toast.error(getErrorMessage(error));
        } finally {
            setUploading(false);
        }
    };

    const handleOpenChange = (newOpen: boolean) => {
        setOpen(newOpen);
        if (!newOpen) {
            setFile(null);
            setResult(null);
        }
    };

    const handleDownloadTemplate = () => {
        const blob = new Blob([ORGANIZATION_IMPORT_TEMPLATE], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = 'organizations-import-template.csv';
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
        URL.revokeObjectURL(url);
    };

    return (
        <Dialog open={open} onOpenChange={handleOpenChange}>
            <div className="flex items-center gap-2">
                <DialogTrigger asChild>
                    <Button variant="outline" className="gap-2">
                        <Upload className="h-4 w-4" />
                        {lang === 'es' ? 'Importar CSV' : 'Import CSV'}
                    </Button>
                </DialogTrigger>
                <Button type="button" variant="outline" className="gap-2" onClick={handleDownloadTemplate}>
                    <Download className="h-4 w-4" />
                    {lang === 'es' ? 'Descargar plantilla' : 'Download template'}
                </Button>
            </div>

            <DialogContent className="sm:max-w-[560px]">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <FileUp className="h-5 w-5" />
                        {lang === 'es' ? 'Importación Masiva de Organizaciones' : 'Bulk Organization Import'}
                    </DialogTitle>
                    <DialogDescription>
                        {lang === 'es'
                            ? 'CSV: organization_name, allow_manual_login, members, bots. Miembros y bots son opcionales.'
                            : 'CSV: organization_name, allow_manual_login, members, bots. Members and bots are optional.'}
                    </DialogDescription>
                </DialogHeader>

                <div className="py-4 space-y-4">
                    {!result ? (
                        <div className="space-y-4">
                            <div className="grid w-full gap-2">
                                <Label htmlFor="org-csv-file">{lang === 'es' ? 'Archivo CSV' : 'CSV File'}</Label>
                                <Input
                                    id="org-csv-file"
                                    type="file"
                                    accept=".csv"
                                    onChange={handleFileChange}
                                />
                            </div>
                            <div className="rounded-md bg-slate-50 p-3 text-xs text-slate-500 font-mono border border-slate-100 whitespace-pre-wrap">
                                {ORGANIZATION_IMPORT_TEMPLATE}
                            </div>
                        </div>
                    ) : (
                        <div className="space-y-4">
                            <Alert variant={result.errors.length === 0 ? 'default' : 'destructive'}>
                                {result.errors.length === 0 ? <CheckCircle2 className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}
                                <AlertTitle>{lang === 'es' ? 'Resultado' : 'Result'}</AlertTitle>
                                <AlertDescription>
                                    {lang === 'es'
                                        ? `Creadas: ${result.created}, Actualizadas: ${result.updated}, Miembros vinculados: ${result.member_links}, Bots vinculados: ${result.bot_links}, Errores: ${result.errors.length}`
                                        : `Created: ${result.created}, Updated: ${result.updated}, Linked members: ${result.member_links}, Linked bots: ${result.bot_links}, Errors: ${result.errors.length}`}
                                </AlertDescription>
                            </Alert>

                            {result.errors.length > 0 && (
                                <ScrollArea className="h-[220px] w-full rounded-md border p-4">
                                    <ul className="space-y-1 text-sm text-red-600">
                                        {result.errors.map((err: string, i: number) => (
                                            <li key={i}>{err}</li>
                                        ))}
                                    </ul>
                                </ScrollArea>
                            )}
                        </div>
                    )}
                </div>

                <DialogFooter>
                    {!result ? (
                        <Button onClick={handleUpload} disabled={!file || uploading}>
                            {uploading
                                ? (lang === 'es' ? 'Importando...' : 'Importing...')
                                : (lang === 'es' ? 'Iniciar importación' : 'Start Import')}
                        </Button>
                    ) : (
                        <Button onClick={() => handleOpenChange(false)} variant="outline">
                            {lang === 'es' ? 'Cerrar' : 'Close'}
                        </Button>
                    )}
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
