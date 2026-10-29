import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface AdminPanelProps {
    title?: ReactNode;
    description?: ReactNode;
    actions?: ReactNode;
    children: ReactNode;
    className?: string;
    contentClassName?: string;
    headerClassName?: string;
    variant?: 'default' | 'subtle' | 'accent' | 'inset' | 'directory' | 'section';
}

export function AdminPanel({
    title,
    description,
    actions,
    children,
    className,
    contentClassName,
    headerClassName,
    variant = 'default',
}: AdminPanelProps) {
    const hasHeader = title || description || actions;
    const panelClassName = {
        default: 'admin-editor-card',
        subtle: 'admin-editor-card admin-editor-card-subtle',
        accent: 'admin-editor-card admin-editor-card-accent',
        inset: 'admin-editor-card admin-editor-card-inset',
        directory: 'admin-panel-directory',
        section: 'admin-panel-section',
    }[variant];

    const headerClassNames = cn(
        variant === 'directory'
            ? 'admin-directory-shell-header'
            : 'admin-editor-card-header flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between',
        variant === 'directory' && 'admin-panel-directory-header',
        headerClassName
    );

    return (
        <section className={cn(panelClassName, className)}>
            {hasHeader ? (
                <div className={headerClassNames}>
                    <div className="min-w-0 space-y-1">
                        {title ? (
                            <h2 className="admin-panel-title">
                                {title}
                            </h2>
                        ) : null}
                        {description ? (
                            <p className="admin-panel-description">
                                {description}
                            </p>
                        ) : null}
                    </div>
                    {actions ? (
                        <div className="shrink-0">
                            {actions}
                        </div>
                    ) : null}
                </div>
            ) : null}
            <div className={cn('p-6', contentClassName)}>
                {children}
            </div>
        </section>
    );
}
