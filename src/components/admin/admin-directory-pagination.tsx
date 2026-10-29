'use client';

import {
    Pagination,
    PaginationContent,
    PaginationItem,
    PaginationNext,
    PaginationPrevious,
} from '@/components/ui/pagination';

interface AdminDirectoryPaginationProps {
    page: number;
    totalPages: number;
    onPageChange: (page: number) => void;
}

export function AdminDirectoryPagination({
    page,
    totalPages,
    onPageChange,
}: AdminDirectoryPaginationProps) {
    if (totalPages <= 1) return null;

    return (
        <div className="rounded-[22px] border border-slate-200 bg-slate-50/72 px-4 py-4">
            <Pagination>
                <PaginationContent>
                    <PaginationItem>
                        <PaginationPrevious
                            onClick={() => onPageChange(page - 1)}
                            className={page <= 1 ? 'pointer-events-none opacity-50' : 'cursor-pointer'}
                        />
                    </PaginationItem>
                    <span className="px-4 text-sm font-bold text-slate-600">
                        {page} / {totalPages}
                    </span>
                    <PaginationItem>
                        <PaginationNext
                            onClick={() => onPageChange(page + 1)}
                            className={page >= totalPages ? 'pointer-events-none opacity-50' : 'cursor-pointer'}
                        />
                    </PaginationItem>
                </PaginationContent>
            </Pagination>
        </div>
    );
}
