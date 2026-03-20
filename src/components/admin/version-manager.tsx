'use client';

import { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { History, RotateCcw, Save, Rocket, UploadCloud } from 'lucide-react';
import { createBotVersion, getBotVersions, restoreBotVersion, publishBotToStaging, promoteBotToProd, rollbackBotProd } from '@/app/actions/versions';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { useLanguage } from '@/components/providers/i18n-context';
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
    AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

interface Props {
    botId: string;
}

type BotVersion = Awaited<ReturnType<typeof getBotVersions>>[number];

function getErrorMessage(error: unknown): string {
    return error instanceof Error ? error.message : 'Unknown error';
}

export function VersionManager({ botId }: Props) {
    const { lang } = useLanguage();
    const [versions, setVersions] = useState<BotVersion[]>([]);
    const [loading, setLoading] = useState(false);

    const loadVersions = useCallback(async () => {
        try {
            const data = await getBotVersions(botId);
            setVersions(data);
        } catch (e) {
            console.error(e);
        }
    }, [botId]);

    useEffect(() => {
        loadVersions();
    }, [loadVersions]);

    const handleCreateSnapshot = async () => {
        try {
            setLoading(true);
            await createBotVersion(botId, 'SNAPSHOT');
            toast.success(lang === 'es' ? 'Snapshot creado' : 'Snapshot created');
            await loadVersions();
        } catch {
            toast.error(lang === 'es' ? 'No se pudo crear el snapshot' : 'Failed to create snapshot');
        } finally {
            setLoading(false);
        }
    };

    const handleRestore = async (version: BotVersion) => {
        try {
            setLoading(true);
            await restoreBotVersion(botId, version.id);
            toast.success(lang === 'es' ? `Versión v${version.version_number} restaurada` : `Restored version v${version.version_number}`);
            // Force reload page to reflect changes in editor
            window.location.reload();
        } catch {
            toast.error(lang === 'es' ? 'No se pudo restaurar la versión' : 'Failed to restore version');
            setLoading(false);
        }
    };

    const handlePublishStaging = async () => {
        try {
            setLoading(true);
            const result = await publishBotToStaging(botId);
            toast.success('Publicado en STAGING');
            if (result.flow_lint.warning_count > 0) {
                toast.warning(
                    lang === 'es'
                        ? `Publicado con ${result.flow_lint.warning_count} warning(s) de flujo.`
                        : `Published with ${result.flow_lint.warning_count} flow warning(s).`
                );
            }
            await loadVersions();
        } catch (e: unknown) {
            toast.error(getErrorMessage(e) || 'No se pudo publicar a STAGING');
        } finally {
            setLoading(false);
        }
    };

    const handlePromoteProd = async () => {
        try {
            setLoading(true);
            const result = await promoteBotToProd(botId);
            toast.success('Promovido a PROD');
            if (result.staging_source === 'auto') {
                toast.info(
                    lang === 'es'
                        ? 'Se detectaron cambios guardados fuera de STAGING. Se creó una versión STAGING automática antes de promover.'
                        : 'Saved changes were ahead of STAGING. An automatic STAGING version was created before promoting.'
                );
            }
            if (result.flow_lint.warning_count > 0) {
                toast.warning(
                    lang === 'es'
                        ? `Promovido con ${result.flow_lint.warning_count} warning(s) de flujo.`
                        : `Promoted with ${result.flow_lint.warning_count} flow warning(s).`
                );
            }
            await loadVersions();
        } catch (e: unknown) {
            toast.error(getErrorMessage(e) || 'No se pudo promover a PROD');
        } finally {
            setLoading(false);
        }
    };

    const handleRollbackProd = async () => {
        try {
            setLoading(true);
            await rollbackBotProd(botId);
            toast.success('Rollback aplicado en PROD');
            await loadVersions();
        } catch (e: unknown) {
            toast.error(getErrorMessage(e) || 'No se pudo hacer rollback');
        } finally {
            setLoading(false);
        }
    };

    return (
        <Card className="bg-white border-slate-200 overflow-hidden rounded-3xl transition-all">
            <CardHeader className="bg-slate-50 border-b border-slate-100 py-6 px-10 flex flex-row items-center justify-between">
                <div>
                    <CardTitle className="text-slate-900 font-black text-lg flex items-center gap-2">
                        <History className="h-5 w-5 text-primary" /> {lang === 'es' ? 'Historial de versiones' : 'Version history'}
                    </CardTitle>
                    <CardDescription className="text-slate-500 text-[10px] uppercase font-bold tracking-widest">
                        {lang === 'es' ? 'Gestiona snapshots y rollbacks' : 'Manage snapshots and rollbacks'}
                    </CardDescription>
                </div>
                <div className="flex gap-2">
                    <Button onClick={handleCreateSnapshot} disabled={loading} size="sm" variant="outline" className="border-slate-200">
                        <Save className="h-4 w-4 mr-2" /> {lang === 'es' ? 'Instantánea' : 'Snapshot'}
                    </Button>
                    <Button onClick={handlePublishStaging} disabled={loading} size="sm" variant="outline" className="border-primary/30 text-primary hover:bg-primary/5">
                        <UploadCloud className="h-4 w-4 mr-2" /> STAGING
                    </Button>
                    <Button onClick={handlePromoteProd} disabled={loading} size="sm" variant="outline" className="border-primary/40 text-primary hover:bg-primary/10">
                        <Rocket className="h-4 w-4 mr-2" /> PROD
                    </Button>
                    <Button onClick={handleRollbackProd} disabled={loading} size="sm" variant="outline" className="border-destructive/30 text-destructive hover:bg-destructive/10">
                        <RotateCcw className="h-4 w-4 mr-2" /> {lang === 'es' ? 'Revertir' : 'Rollback'}
                    </Button>
                </div>
            </CardHeader>
            <CardContent className="p-0 max-h-[300px] overflow-y-auto">
                {versions.length === 0 ? (
                    <div className="p-10 text-center text-slate-400 text-xs italic">
                        {lang === 'es' ? 'Todavía no hay versiones guardadas.' : 'No versions saved yet.'}
                    </div>
                ) : (
                    <div className="divide-y divide-slate-100">
                        {versions.map((v) => (
                            <div key={v.id} className="p-4 hover:bg-slate-50 flex items-center justify-between group transition-colors">
                                <div>
                                    <div className="flex items-center gap-2 mb-1">
                                        <Badge variant="outline" className="bg-white font-mono text-[10px]">v{v.version_number}</Badge>
                                        <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">{v.environment}</span>
                                    </div>
                                    <p className="text-[10px] text-slate-400">
                                        {format(new Date(v.created_at), "PPP p")}
                                    </p>
                                </div>
                                <AlertDialog>
                                    <AlertDialogTrigger asChild>
                                        <Button size="sm" variant="ghost" className="opacity-0 group-hover:opacity-100 transition-opacity text-slate-400 hover:text-primary">
                                            <RotateCcw className="h-4 w-4 mr-2" /> {lang === 'es' ? 'Restaurar' : 'Restore'}
                                        </Button>
                                    </AlertDialogTrigger>
                                    <AlertDialogContent>
                                        <AlertDialogHeader>
                                            <AlertDialogTitle>
                                                {lang === 'es' ? `¿Restaurar versión v${v.version_number}?` : `Restore Version v${v.version_number}?`}
                                            </AlertDialogTitle>
                                            <AlertDialogDescription>
                                                {lang === 'es'
                                                    ? 'Esto sobrescribirá la configuración actual del bot con este snapshot. Los cambios sin guardar se perderán.'
                                                    : 'This will overwrite the current bot configuration with this snapshot. Unsaved changes will be lost.'}
                                            </AlertDialogDescription>
                                        </AlertDialogHeader>
                                        <AlertDialogFooter>
                                            <AlertDialogCancel>{lang === 'es' ? 'Cancelar' : 'Cancel'}</AlertDialogCancel>
                                            <AlertDialogAction onClick={() => handleRestore(v)}>{lang === 'es' ? 'Restaurar' : 'Restore'}</AlertDialogAction>
                                        </AlertDialogFooter>
                                    </AlertDialogContent>
                                </AlertDialog>
                            </div>
                        ))}
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
