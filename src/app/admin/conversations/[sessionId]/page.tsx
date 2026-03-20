import { getCurrentUser } from '@/lib/auth-utils';
import { redirect } from 'next/navigation';

interface Props {
    params: Promise<{ sessionId: string }>;
}

export default async function AdminConversationDetailRoute({ params }: Props) {
    const user = await getCurrentUser();
    if (!user) {
        redirect('/login');
    }

    if (user.role !== 'ADMIN' && !user.hasOrgAdminAccess) {
        redirect('/');
    }

    const { sessionId } = await params;

    if (user.role === 'ADMIN') {
        const { default: ConversationDetailAdminPage } = await import('@/components/conversations/conversation-detail-admin-page');
        return <ConversationDetailAdminPage />;
    }

    const { default: ConversationDetailLitePage } = await import('@/components/conversations/conversation-detail-lite-page');
    return (
        <ConversationDetailLitePage
            sessionId={sessionId}
            backHref="/admin/conversations"
            showStandaloneActions={false}
        />
    );
}
