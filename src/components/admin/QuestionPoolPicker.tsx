import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Check, X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

export interface EvaluatorQuestion {
    id: string;
    topic: string;
    type: 'teorica' | 'practica';
    question: string;
    expected_keys: string;
    media_url?: string;
    is_mandatory: boolean;
}

interface QuestionPoolPickerProps {
    isOpen: boolean;
    onClose: () => void;
    onCommit: (ids: string[]) => void;
    initialIds: string[];
    questions: EvaluatorQuestion[];
    topics: string[];
    mode: 'single' | 'multiple';
    lang: 'es' | 'en';
}

export const QuestionPoolPicker = (props: QuestionPoolPickerProps) => {
    const { isOpen, onClose, onCommit, initialIds, questions, topics, mode, lang } = props;
    const [selectedIds, setSelectedIds] = useState<string[]>(initialIds);
    const [searchTerm, setSearchTerm] = useState('');
    const [topicFilter, setTopicFilter] = useState<string>('all');

    useEffect(() => {
        if (!isOpen) return;
        setSelectedIds(initialIds);
        setSearchTerm('');
        setTopicFilter('all');
    }, [initialIds, isOpen]);

    if (!isOpen) return null;

    const filtered = questions.filter(q => {
        const matchesTerm = (q.question || '').toLowerCase().includes(searchTerm.toLowerCase()) || (q.id || '').toLowerCase().includes(searchTerm.toLowerCase());
        const matchesTopic = topicFilter === 'all' || q.topic === topicFilter;
        return matchesTerm && matchesTopic;
    });

    const toggleId = (id: string) => {
        if (mode === 'single') {
            setSelectedIds([id]);
        } else {
            setSelectedIds(prev => prev.includes(id) ? prev.filter(p => p !== id) : [...prev, id]);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <div className="flex max-h-[80vh] w-full max-w-2xl flex-col rounded-[1.5rem] border border-slate-200 bg-white shadow-2xl">
                <div className="p-4 border-b border-slate-100 flex justify-between items-center">
                    <h3 className="text-lg font-bold text-slate-800">
                        {lang === 'es'
                            ? (mode === 'single' ? 'Seleccionar Pregunta' : 'Seleccionar Pool de Preguntas')
                            : (mode === 'single' ? 'Select Question' : 'Select Question Pool')}
                    </h3>
                    <Button variant="ghost" size="sm" onClick={onClose}><X className="h-4 w-4" /></Button>
                </div>

                <div className="p-4 border-b border-slate-100 flex gap-2">
                    <Input
                        className="flex-1 h-9 text-sm"
                        placeholder={lang === 'es' ? 'Buscar...' : 'Search...'}
                        value={searchTerm}
                        onChange={e => setSearchTerm(e.target.value)}
                    />
                    <select
                        className="h-9 max-w-[150px] rounded border border-slate-200 bg-white px-2 text-sm text-slate-800"
                        value={topicFilter}
                        onChange={e => setTopicFilter(e.target.value)}
                    >
                        <option value="all">{lang === 'es' ? 'Todos los temas' : 'All topics'}</option>
                        {topics.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                </div>

                <div className="flex-1 overflow-y-auto p-2 space-y-1">
                    {filtered.map(q => {
                        const isSelected = selectedIds.includes(q.id);
                        return (
                            <div
                                key={q.id}
                                className={`flex items-start gap-3 rounded border p-2 transition-colors cursor-pointer ${isSelected ? 'border-purple-200 bg-purple-50' : 'border-transparent hover:bg-slate-50'}`}
                                onClick={() => toggleId(q.id)}
                            >
                                <div className={`mt-1 flex h-4 w-4 items-center justify-center rounded border ${isSelected ? 'border-purple-600 bg-purple-600' : 'border-slate-300'}`}>
                                    {isSelected && <Check className="h-3 w-3 text-white" />}
                                </div>
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2 mb-0.5">
                                        <Badge variant="outline" className="text-[10px] py-0 h-4">{q.topic}</Badge>
                                        <span className="text-xs text-slate-400 font-mono">{q.id}</span>
                                    </div>
                                    <p className="line-clamp-2 text-sm text-slate-700">{q.question}</p>
                                </div>
                            </div>
                        )
                    })}
                    {filtered.length === 0 && (
                        <div className="p-8 text-center text-slate-400 text-sm">
                            {lang === 'es' ? 'No se encontraron preguntas.' : 'No questions found.'}
                        </div>
                    )}
                </div>

                <div className="flex items-center justify-between rounded-b-[1.5rem] border-t border-slate-100 bg-slate-50 p-4">
                    <span className="text-xs text-slate-500">
                        {selectedIds.length} {lang === 'es' ? 'seleccionadas' : 'selected'}
                    </span>
                    <div className="flex gap-2">
                        <Button variant="outline" size="sm" onClick={onClose}>{lang === 'es' ? 'Cancelar' : 'Cancel'}</Button>
                        <Button size="sm" onClick={() => onCommit(selectedIds)} disabled={selectedIds.length === 0}>
                            {lang === 'es' ? 'Confirmar' : 'Confirm'}
                        </Button>
                    </div>
                </div>
            </div>
        </div>
    );
};
