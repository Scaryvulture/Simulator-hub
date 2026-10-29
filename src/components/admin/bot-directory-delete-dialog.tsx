'use client';

import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from '@/components/ui/alert-dialog';

interface BotDirectoryDeleteDialogProps {
    open: boolean;
    lang: 'es' | 'en';
    onConfirm: () => void;
    onOpenChange: (open: boolean) => void;
}

export function BotDirectoryDeleteDialog({
    open,
    lang,
    onConfirm,
    onOpenChange,
}: BotDirectoryDeleteDialogProps) {
    return (
        <AlertDialog open={open} onOpenChange={onOpenChange}>
            <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle>
                        {lang === 'es' ? '¿Eliminar este bot?' : 'Delete this bot?'}
                    </AlertDialogTitle>
                    <AlertDialogDescription>
                        {lang === 'es'
                            ? 'La operación elimina el bot y sus datos asociados. No se puede deshacer.'
                            : 'This removes the bot and its related data. This action cannot be undone.'}
                    </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                    <AlertDialogCancel>
                        {lang === 'es' ? 'Cancelar' : 'Cancel'}
                    </AlertDialogCancel>
                    <AlertDialogAction onClick={onConfirm} className="bg-red-600 hover:bg-red-700">
                        {lang === 'es' ? 'Eliminar' : 'Delete'}
                    </AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    );
}
