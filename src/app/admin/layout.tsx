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
        <div className="min-h-screen bg-[linear-gradient(180deg,#fbfcff_0%,#f2f5f9_42%,#f8fafc_100%)]">
            <AdminNav role={currentUser.role} hasOrgAdminAccess={currentUser.hasOrgAdminAccess} />
            <div className="admin-shell">
                <AdminSidebar role={currentUser.role} hasOrgAdminAccess={currentUser.hasOrgAdminAccess} />
                <main className="admin-workspace">
                    <div className="admin-workspace-shell">
                        {children}
                    </div>
                </main>
            </div>
        </div>
    );
}
