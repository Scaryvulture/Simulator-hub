import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { LoginForm } from '@/components/login-form';
import Image from 'next/image';
import { I18nText } from '@/components/providers/i18n-text';
import { LanguageSwitcher } from '@/components/providers/language-switcher';
import { getCurrentUser } from '@/lib/auth-utils';
import { getRoleHomePath } from '@/lib/auth-routing';
import { redirect } from 'next/navigation';

export default async function LoginPage() {
    const user = await getCurrentUser();
    if (user) {
        redirect(getRoleHomePath(user.role, user.hasOrgAdminAccess));
    }

    return (
        <div className="min-h-screen w-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950 relative overflow-hidden">
            {/* Ambient Background */}
            <div className="absolute top-[-20%] left-[-10%] w-[60%] h-[60%] bg-primary/5 blur-[150px] rounded-full" />
            <div className="absolute bottom-[-20%] right-[-10%] w-[60%] h-[60%] bg-primary/5 blur-[150px] rounded-full" />
            <div className="absolute top-6 right-6 z-20">
                <LanguageSwitcher />
            </div>

            <div className="relative z-10 w-full max-w-md px-4">
                <div className="flex flex-col items-center mb-10 space-y-4">
                    <div className="flex items-center gap-3 rounded-2xl px-4 py-2 bg-white/80 dark:bg-slate-900/80 border border-slate-200/70 dark:border-slate-700/70">
                        <Image src="/logo.svg" alt="" width={36} height={36} priority />
                        <span className="brand-display text-xl font-black tracking-tight text-slate-900 dark:text-slate-100">Simulator Hub</span>
                    </div>
                    <div className="text-center">
                        <h1 className="brand-display text-3xl font-black tracking-tight text-slate-900 dark:text-slate-100">
                            <I18nText es="Gestor de Simuladores" en="Simulator Manager" />
                        </h1>
                    </div>
                </div>

                <Card className="bg-white dark:bg-slate-900 shadow-2xl border-slate-200 dark:border-slate-800 overflow-hidden rounded-[2.5rem]">
                    <CardHeader className="pb-2 text-center pt-10">
                        <CardTitle className="brand-display text-2xl font-black text-slate-900 dark:text-slate-100"><I18nText es="Bienvenido" en="Welcome" /></CardTitle>
                    </CardHeader>
                    <CardContent className="py-8 px-10">
                        <LoginForm />
                    </CardContent>
                </Card>

                <p className="text-center mt-10 text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em]">
                    <I18nText es="Simulator Hub • Gestor de Simuladores" en="Simulator Hub • Simulator Manager" />
                </p>
            </div>
        </div>
    );
}
