import { getBot, getAllEvaluators } from '@/app/actions/bots';
import { getAllOrganizations } from '@/app/actions/organizations';
import { notFound, redirect } from 'next/navigation';
import { BotEditor } from '@/components/admin/bot-editor';

export default async function EditBotPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;

    const bot = await getBot(id);
    const organizations = await getAllOrganizations();
    const evaluators = await getAllEvaluators();

    if (!bot) {
        notFound();
    }
    if (bot.bot_type === 'EVALUATOR') {
        // Conversation evaluator bots → dedicated evaluator editor
        redirect(`/admin/evaluators/${id}`);
    }

    return (
        <div className="container mx-auto py-10 px-4">
            <BotEditor
                bot={bot}
                availableOrganizations={organizations}
                availableEvaluators={evaluators}
            />
        </div>
    );
}
