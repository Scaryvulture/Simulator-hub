'use client';

import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

type StrategySectionTone = 'primary' | 'emerald' | 'orange' | 'indigo' | 'slate';
type StrategyShellKind = 'SIMULATOR' | 'EXAMINER' | 'DETECTOR' | 'GENERIC';

function getEyebrowToneClass(tone: StrategySectionTone) {
    if (tone === 'primary') return 'border-primary/20 bg-primary/10 text-primary';
    if (tone === 'emerald') return 'border-emerald-200 bg-emerald-50 text-emerald-700';
    if (tone === 'orange') return 'border-orange-200 bg-orange-50 text-orange-700';
    if (tone === 'indigo') return 'border-indigo-200 bg-indigo-50 text-indigo-700';
    return 'border-slate-200 bg-slate-50 text-slate-600';
}

export function StrategyEditorShell({
    children,
    strategy = 'GENERIC',
}: {
    children: ReactNode;
    strategy?: StrategyShellKind;
}) {
    const strategyClassName = {
        SIMULATOR: 'admin-strategy-shell-simulator',
        EXAMINER: 'admin-strategy-shell-examiner',
        DETECTOR: 'admin-strategy-shell-detector',
        GENERIC: 'admin-strategy-shell-generic',
    }[strategy];

    return (
        <div className={cn('admin-strategy-shell', strategyClassName)}>
            {children}
        </div>
    );
}

export function StrategyEditorSection({
    eyebrow,
    title,
    description,
    summary,
    tone = 'slate',
    children,
}: {
    eyebrow: string;
    title: string;
    description?: string;
    summary?: ReactNode;
    tone?: StrategySectionTone;
    children: ReactNode;
}) {
    return (
        <section className={cn(
            'admin-strategy-section',
            tone === 'primary' && 'admin-strategy-section-primary',
            tone === 'emerald' && 'admin-strategy-section-emerald',
            tone === 'orange' && 'admin-strategy-section-orange',
            tone === 'indigo' && 'admin-strategy-section-indigo',
            tone === 'slate' && 'admin-strategy-section-slate'
        )}>
            <div className="admin-strategy-section-header">
                <div className="space-y-2">
                    <p className={cn('admin-strategy-section-eyebrow', getEyebrowToneClass(tone))}>{eyebrow}</p>
                    <div className="space-y-1">
                        <h3 className="admin-strategy-section-title">{title}</h3>
                        {description ? <p className="admin-strategy-section-description">{description}</p> : null}
                    </div>
                </div>
                {summary ? (
                    <div className="admin-strategy-summary">
                        {summary}
                    </div>
                ) : null}
            </div>
            <div className="admin-strategy-section-body">
                {children}
            </div>
        </section>
    );
}
