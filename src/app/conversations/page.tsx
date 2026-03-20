
import { getCurrentUser } from '@/lib/auth-utils';
import { redirect } from 'next/navigation';
import ConversationsPage from '@/app/admin/conversations/page';

export default async function ProtectedConversationsPage() {
    const user = await getCurrentUser();
    if (!user) {
        redirect('/login');
    }
    return <ConversationsPage />;
}
