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
import { importUsersFromCSV } from '@/app/actions/users';
import { toast } from 'sonner';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { ScrollArea } from '@/components/ui/scroll-area';

type UserImportResult = Awaited<ReturnType<typeof importUsersFromCSV>>;

function getErrorMessage(error: unknown): string {
    return error instanceof Error ? error.message : 'Unknown error';
}

const USER_IMPORT_TEMPLATE = [
    'username,email,password,role,organization_name',
    'jane.doe,jane.doe@example.com,TempPass123!,USER,Acme Corp',
    'global.admin,global.admin@example.com,TempPass123!,ADMIN,',
].join('\n');

export function UserImportDialog() {
    const { lang } = useLanguage();
    const [open, setOpen] = useState(false);
    const [file, setFile] = useState<File | null>(null);
    const [uploading, setUploading] = useState(false);
    const [result, setResult] = useState<UserImportResult | null>(null);

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
            const res = await importUsersFromCSV(formData);
            setResult(res);
            if (res.created > 0) {
                toast.success(lang === 'es' ? `Se importaron ${res.created} usuarios` : `Imported ${res.created} users`);
            } else if (res.errors.length > 0) {
                toast.warning(lang === 'es' ? 'Hubo errores en la importación' : 'Import completed with errors');
            } else {
                toast.info(lang === 'es' ? 'No se encontraron usuarios nuevos' : 'No new users found');
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
        const blob = new Blob([USER_IMPORT_TEMPLATE], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = 'users-import-template.csv';
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
            <DialogContent className="sm:max-w-[500px]">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <FileUp className="h-5 w-5" />
                        {lang === 'es' ? 'Importación Masiva' : 'Bulk Import'}
                    </DialogTitle>
                    <DialogDescription>
                        {lang === 'es'
                            ? 'CSV: username, email, password, role, organization_name (email y organization_name opcionales; role: ADMIN | USER). Los ORG_ADMIN se definen desde las organizaciones.'
                            : 'CSV: username, email, password, role, organization_name (email and organization_name are optional; role: ADMIN | USER). ORG_ADMIN access is managed from organizations.'}
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
                        </div>
                    ) : (
                        <div className="space-y-4">
                            <Alert variant={result.created > 0 ? "default" : "destructive"}>
                                {result.created > 0 ? <CheckCircle2 className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}
                                <AlertTitle>{lang === 'es' ? 'Resultado' : 'Result'}</AlertTitle>
                                <AlertDescription>
                                    {lang === 'es'
                                        ? `Creados: ${result.created}, Errores: ${result.errors.length}`
                                        : `Created: ${result.created}, Errors: ${result.errors.length}`}
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
