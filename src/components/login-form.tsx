'use client';

import { useState } from 'react';
import { login } from '@/app/actions/auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { Lock, User } from 'lucide-react';
import { useLanguage } from '@/components/providers/i18n-context';

export function LoginForm() {
    const { lang } = useLanguage();
    const [isLoading, setIsLoading] = useState(false);

    const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        setIsLoading(true);
        const formData = new FormData(e.currentTarget);
        try {
            const result = await login(formData);
            if (!result.success) {
                toast.error(result.error);
                setIsLoading(false);
            }
        } catch (error: unknown) {
            // Next.js usa una excepción interna para redirects en Server Actions.
            // No debe mostrarse como error al usuario.
            const maybeDigest = typeof error === 'object' && error !== null && 'digest' in error
                ? String((error as { digest?: unknown }).digest ?? '')
                : '';
            const maybeMessage = error instanceof Error ? error.message : '';
            const isRedirectSignal = maybeDigest.includes('NEXT_REDIRECT') || maybeMessage.includes('NEXT_REDIRECT');
            if (isRedirectSignal) {
                return;
            }
            toast.error(lang === 'es' ? 'Ocurrió un error inesperado' : 'An unexpected error occurred');
            setIsLoading(false);
        }
    };

    return (
        <form onSubmit={handleSubmit} className="space-y-6">
            <div className="space-y-2">
                <Label htmlFor="username" className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                    {lang === 'es' ? 'Usuario' : 'Username'}
                </Label>
                <div className="relative">
                    <Input id="username" name="username" type="text" placeholder="" required className="pl-10 h-12 rounded-xl bg-slate-50 border-slate-200 focus:ring-primary/20" />
                    <User className="absolute left-3 top-3.5 h-5 w-5 text-slate-300" />
                </div>
            </div>
            <div className="space-y-2">
                <Label htmlFor="password" className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                    {lang === 'es' ? 'Contraseña' : 'Password'}
                </Label>
                <div className="relative">
                    <Input id="password" name="password" type="password" required className="pl-10 h-12 rounded-xl bg-slate-50 border-slate-200 focus:ring-primary/20" />
                    <Lock className="absolute left-3 top-3.5 h-5 w-5 text-slate-300" />
                </div>
            </div>
            <Button type="submit" className="w-full h-14 rounded-xl bg-primary hover:bg-primary/90 text-white font-black text-sm shadow-xl shadow-primary/20 transition-all active:scale-[0.98]" disabled={isLoading}>
                {isLoading
                    ? (lang === 'es' ? 'Autenticando...' : 'Authenticating...')
                    : (lang === 'es' ? 'Iniciar sesión' : 'Sign in')}
            </Button>
        </form>
    );
}
