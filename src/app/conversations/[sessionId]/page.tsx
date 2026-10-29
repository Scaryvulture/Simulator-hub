import { getCurrentUser } from '@/lib/auth-utils';
import { redirect } from 'next/navigation';
import ConversationDetailLitePage from '@/components/conversations/conversation-detail-lite-page';

interface Props {
    params: Promise<{ sessionId: string }>;
}

export default async function ProtectedConversationDetailPage({ params }: Props) {
    const user = await getCurrentUser();
    if (!user) {
        redirect('/login');
    }

    const { sessionId } = await params;

    return (
        <div className="workspace-canvas">
            <main className="workspace-shell py-8 sm:py-10">
                <ConversationDetailLitePage
                    sessionId={sessionId}
                    backHref="/conversations"
                    showStandaloneActions
                />
            </main>
        </div>
    );
}
