import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface WorkspacePanelProps {
    title?: ReactNode;
    description?: ReactNode;
    actions?: ReactNode;
    children: ReactNode;
    className?: string;
    bodyClassName?: string;
    variant?: 'default' | 'muted' | 'hub' | 'operations' | 'detail' | 'transcript';
}

export function WorkspacePanel({
    title,
    description,
    actions,
    children,
    className,
    bodyClassName,
    variant = 'default',
}: WorkspacePanelProps) {
    const panelClassName = {
        default: 'workspace-panel',
        muted: 'workspace-panel-muted',
        hub: 'workspace-panel workspace-panel-hub',
        operations: 'workspace-panel workspace-panel-operations',
        detail: 'workspace-panel workspace-panel-detail',
        transcript: 'workspace-panel workspace-panel-transcript',
    }[variant];

    return (
        <section className={cn(panelClassName, className)}>
            {title || description || actions ? (
                <div className="workspace-panel-header">
                    <div className="min-w-0 space-y-1">
                        {title ? <h2 className="workspace-panel-title">{title}</h2> : null}
                        {description ? <p className="workspace-panel-description">{description}</p> : null}
                    </div>
                    {actions ? <div className="workspace-panel-actions">{actions}</div> : null}
                </div>
            ) : null}
            <div className={cn('workspace-panel-body', bodyClassName)}>
                {children}
            </div>
        </section>
    );
}
