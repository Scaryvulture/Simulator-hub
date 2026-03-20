'use client';

import { useEffect, useState } from 'react';
import { Moon, Sun } from 'lucide-react';
import { useTheme } from 'next-themes';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface ThemeToggleProps {
    className?: string;
}

export function ThemeToggle({ className }: ThemeToggleProps) {
    const { resolvedTheme, setTheme } = useTheme();
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        setMounted(true);
    }, []);

    if (!mounted) {
        return <div className={cn("h-10 w-10 rounded-full border border-border bg-background/80 shadow-lg backdrop-blur-md", className)} />;
    }

    const isDark = resolvedTheme === 'dark';

    return (
        <Button
            type="button"
            variant="outline"
            size="icon"
            onClick={() => setTheme(isDark ? 'light' : 'dark')}
            className={cn("h-10 w-10 rounded-full bg-background/90 border-border shadow-lg backdrop-blur-md hover:bg-accent", className)}
            aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
            title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
        >
            {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </Button>
    );
}
