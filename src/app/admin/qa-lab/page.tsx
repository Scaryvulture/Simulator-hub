import { QaLabPanel } from '@/components/admin/qa-lab-panel';
import { getCurrentUser } from '@/lib/auth-utils';
import { redirect } from 'next/navigation';

export default async function QaLabPage() {
    const currentUser = await getCurrentUser();
    if (!currentUser || currentUser.role !== 'ADMIN') {
        redirect('/admin');
    }

    return (
        <div className="container mx-auto py-10 px-6 max-w-7xl">
            <QaLabPanel />
        </div>
    );
}
