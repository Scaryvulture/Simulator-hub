import { redirect } from 'next/navigation';
import { AdminNav } from '@/components/admin/admin-nav';
import { AdminSidebar } from '@/components/admin/admin-sidebar';
import { getCurrentUser } from '@/lib/auth-utils';

export default async function AdminLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    const currentUser = await getCurrentUser();
    if (!currentUser) {
        redirect('/login');
    }

    if (currentUser.role !== 'ADMIN' && !currentUser.hasOrgAdminAccess) {
        redirect('/');
    }

    return (
        <div className="min-h-screen bg-background">
            <AdminNav role={currentUser.role} hasOrgAdminAccess={currentUser.hasOrgAdminAccess} />
            <div className="w-full py-4 px-3 md:px-4 lg:px-5">
                <div className="grid grid-cols-1 md:grid-cols-[208px_minmax(0,1fr)] gap-4 md:gap-5">
                    <AdminSidebar role={currentUser.role} hasOrgAdminAccess={currentUser.hasOrgAdminAccess} />
                    <main className="min-w-0">
                        {children}
                    </main>
                </div>
            </div>
        </div>
    );
}
