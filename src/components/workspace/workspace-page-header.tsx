import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface WorkspacePageHeaderProps {
    eyebrow?: ReactNode;
    title: ReactNode;
    description?: ReactNode;
    meta?: ReactNode;
    actions?: ReactNode;
    className?: string;
    variant?: 'hub' | 'operations' | 'detail' | 'chat';
}

export function WorkspacePageHeader({
    eyebrow,
    title,
    description,
    meta,
    actions,
    className,
    variant = 'operations',
}: WorkspacePageHeaderProps) {
    const variantClassName = {
        hub: 'workspace-page-header-hub',
        operations: 'workspace-page-header-operations',
        detail: 'workspace-page-header-detail',
        chat: 'workspace-page-header-chat',
    }[variant];

    return (
        <div className={cn('workspace-page-header', variantClassName, className)}>
            <div className="min-w-0 space-y-3">
                {eyebrow ? <p className="workspace-eyebrow">{eyebrow}</p> : null}
                <div className="space-y-2">
                    <h1 className="workspace-page-title">{title}</h1>
                    {description ? <p className="workspace-page-description">{description}</p> : null}
                </div>
                {meta ? <div className="workspace-meta-row">{meta}</div> : null}
            </div>
            {actions ? <div className="workspace-action-row">{actions}</div> : null}
        </div>
    );
}
