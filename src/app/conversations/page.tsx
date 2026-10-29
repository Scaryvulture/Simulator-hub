
import { getCurrentUser } from '@/lib/auth-utils';
import { redirect } from 'next/navigation';
import ConversationsPage from '@/app/admin/conversations/page';

export default async function ProtectedConversationsPage() {
    const user = await getCurrentUser();
    if (!user) {
        redirect('/login');
    }

    return (
        <div className="workspace-canvas">
            <main className="workspace-shell py-8 sm:py-10">
                <ConversationsPage />
            </main>
        </div>
    );
}
