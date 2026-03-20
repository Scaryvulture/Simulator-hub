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
import { Upload, FileUp, AlertCircle, CheckCircle2 } from 'lucide-react';
import { importBotOrganizationsFromCSV } from '@/app/actions/organizations';
import { toast } from 'sonner';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { ScrollArea } from '@/components/ui/scroll-area';

interface Props {
    botId: string;
    onSuccess?: () => void;
}

type BotOrgImportActionResult = Awaited<ReturnType<typeof importBotOrganizationsFromCSV>>;
type BotOrgImportResult = Extract<BotOrgImportActionResult, { success: true }>['data'];

function getErrorMessage(error: unknown): string {
    return error instanceof Error ? error.message : 'Unknown error';
}

export function BotOrgImportDialog({ botId, onSuccess }: Props) {
    const { lang } = useLanguage();
    const [open, setOpen] = useState(false);
    const [file, setFile] = useState<File | null>(null);
    const [uploading, setUploading] = useState(false);
    const [result, setResult] = useState<BotOrgImportResult | null>(null);

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
            const res = await importBotOrganizationsFromCSV(botId, formData);
            if (!res.success) {
                toast.error(res.error);
                return;
            }
            setResult(res.data);
            if (res.data.added > 0) {
                toast.success(lang === 'es' ? `Se asignaron ${res.data.added} organizaciones` : `Assigned ${res.data.added} organizations`);
                if (onSuccess) onSuccess();
            } else if (res.data.errors.length > 0) {
                toast.warning(lang === 'es' ? 'Hubo errores en la importación' : 'Import completed with errors');
            } else {
                toast.info(lang === 'es' ? 'No se encontraron nuevas asignaciones' : 'No new assignments found');
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

    return (
        <Dialog open={open} onOpenChange={handleOpenChange}>
            <DialogTrigger asChild>
                <Button variant="outline" className="gap-2 bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100">
                    <Upload className="h-4 w-4" />
                    {lang === 'es' ? 'Importar CSV' : 'Import CSV'}
                </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[500px]">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <FileUp className="h-5 w-5" />
                        {lang === 'es' ? 'Asignar Organizaciones (Masivo)' : 'Bulk Organization Assignment'}
                    </DialogTitle>
                    <DialogDescription>
                        {lang === 'es' ? 'Formato CSV: organization_name' : 'CSV format: organization_name'}
                    </DialogDescription>
                </DialogHeader>

                <div className="py-4 space-y-4">
                    {!result ? (
                        <div className="space-y-4">
                            <div className="grid w-full gap-2">
                                <Label htmlFor="csv-file">{lang === 'es' ? 'Archivo CSV' : 'CSV File'}</Label>
                                <Input
                                    id="csv-file"
                                    type="file"
                                    accept=".csv"
                                    onChange={handleFileChange}
                                />
                            </div>
                            <div className="rounded-md bg-slate-50 p-3 text-xs text-slate-500 font-mono border border-slate-100">
                                {lang === 'es' ? 'Organización A' : 'Organization A'}<br />
                                {lang === 'es' ? 'Organización B' : 'Organization B'}<br />
                                ...
                            </div>
                        </div>
                    ) : (
                        <div className="space-y-4">
                            <Alert variant={result.added > 0 ? "default" : "destructive"}>
                                {result.added > 0 ? <CheckCircle2 className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}
                                <AlertTitle>{lang === 'es' ? 'Resultado' : 'Result'}</AlertTitle>
                                <AlertDescription>
                                    {lang === 'es'
                                        ? `Agregadas: ${result.added}, Errores: ${result.errors.length}`
                                        : `Added: ${result.added}, Errors: ${result.errors.length}`}
                                </AlertDescription>
                            </Alert>

                            {result.errors.length > 0 && (
                                <ScrollArea className="h-[200px] w-full rounded-md border p-4">
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
