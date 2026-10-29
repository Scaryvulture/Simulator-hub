import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface AdminPageHeaderProps {
    eyebrow?: string;
    title: ReactNode;
    description?: ReactNode;
    actions?: ReactNode;
    className?: string;
    variant?: 'default' | 'directory' | 'editor' | 'evaluator';
}

export function AdminPageHeader({
    eyebrow,
    title,
    description,
    actions,
    className,
    variant = 'default',
}: AdminPageHeaderProps) {
    const variantClassName = {
        default: 'admin-page-header',
        directory: 'admin-page-header admin-page-header-directory',
        editor: 'admin-page-header admin-page-header-editor',
        evaluator: 'admin-page-header admin-page-header-evaluator',
    }[variant];

    return (
        <div className={cn(variantClassName, className)}>
            <div className="min-w-0 space-y-2">
                {eyebrow ? (
                    <p className="admin-page-eyebrow">
                        {eyebrow}
                    </p>
                ) : null}
                <div className="space-y-1">
                    <h1 className="admin-page-title">
                        {title}
                    </h1>
                    {description ? (
                        <p className="admin-page-description">
                            {description}
                        </p>
                    ) : null}
                </div>
            </div>
            {actions ? (
                <div className="admin-page-actions">
                    {actions}
                </div>
            ) : null}
        </div>
    );
}
