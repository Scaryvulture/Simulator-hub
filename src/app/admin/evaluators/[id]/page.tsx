import { EvaluatorEditor } from '@/components/admin/evaluator-editor';
import { getBot } from '@/app/actions/bots';
import { redirect } from 'next/navigation';

export default async function EvaluatorDetailPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    const bot = await getBot(id);

    if (!bot) {
        redirect('/admin/evaluators');
    }

    // Evaluator module should only edit EVALUATOR bots.
    if (bot.bot_type !== 'EVALUATOR') {
        redirect(`/admin/bots/${id}`);
    }

    return (
        <div className="container mx-auto py-10 px-6 max-w-7xl">
            <EvaluatorEditor bot={bot} />
        </div>
    );
}
