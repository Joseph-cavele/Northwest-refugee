'use client';

import { useCallback, useState } from 'react';
import Link from 'next/link';
import { FileQuestion, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useApi } from '@/hooks/useApi';
import { ErrorAlert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Pager } from '@/components/ui/pager';
import { Spinner } from '@/components/ui/spinner';
import {
  TEMPLATE_PURPOSE_LABELS,
  TEMPLATE_STATUS_LABELS,
  listTemplates,
} from '@/api/screening.api';
import type { TemplateStatus } from '@/api/screening.api';
import { formatDate } from '@/lib/dates';

/*
 * The screening forms an administrator has built.
 *
 * WHY THIS SCREEN EXISTS AT ALL, in one sentence: without it, adding questions for a new
 * skills programme is a developer's job, and the whole point of the template system is that
 * it is not.
 */

const PAGE_SIZE = 25;

const STATUS_TONE: Record<TemplateStatus, string> = {
  PUBLISHED: 'bg-success-50 text-success-700',
  DRAFT: 'bg-ink-100 text-ink-600',
  ARCHIVED: 'bg-ink-100 text-ink-600',
};

export function TemplateList() {
  const [page, setPage] = useState(1);

  const { data, loading, error, reload } = useApi(
    useCallback(
      (signal: AbortSignal) => listTemplates({ page, limit: PAGE_SIZE }, signal),
      [page]
    ),
    [page]
  );

  const rows = data?.data ?? [];
  const meta = data?.meta;

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-[-0.02em] text-body">
            Screening forms
          </h1>
          <p className="mt-1 max-w-prose text-base text-muted">
            The questions a screener asks. Attach one to a programme and it loads
            automatically when somebody applies for it.
          </p>
        </div>

        <Link
          href="/dashboard/screening-templates/new"
          className="inline-flex min-h-10 items-center gap-2 rounded-full bg-brand-500 px-5 text-base font-semibold text-white transition-colors hover:bg-brand-700"
        >
          <Plus className="size-4" aria-hidden="true" />
          New form
        </Link>
      </header>

      {error && (
        <div className="flex flex-col items-start gap-3">
          <ErrorAlert error={error} />
          <Button variant="subtle" onClick={reload}>
            Try again
          </Button>
        </div>
      )}

      {loading && !data && <Spinner label="Loading the forms" className="py-20" />}

      {data && rows.length === 0 && (
        <div className="rounded-xl border border-line bg-surface px-6 py-12 text-center">
          <FileQuestion className="mx-auto size-8 text-line-strong" strokeWidth={1.5} aria-hidden="true" />
          <p className="mt-3 text-base text-body">No screening forms yet.</p>
          <p className="mx-auto mt-1 max-w-sm text-sm text-muted">
            A programme without a form can still be screened for — the screener records notes
            and a decision. A form is what makes the questions consistent between screeners.
          </p>
        </div>
      )}

      {rows.length > 0 && (
        <ul className="grid gap-3 sm:grid-cols-2">
          {rows.map((row) => {
            const questions = row.sections.reduce((n, s) => n + s.questions.length, 0);
            return (
              <li key={row._id}>
                <Link
                  href={`/dashboard/screening-templates/${row._id}`}
                  className="flex h-full flex-col rounded-xl border border-line bg-surface p-5 transition-colors hover:border-line-strong"
                >
                  <div className="flex items-start justify-between gap-3">
                    <h2 className="text-base font-semibold text-balance text-body">{row.name}</h2>
                    <span
                      className={cn(
                        'shrink-0 rounded-full px-2.5 py-1 text-sm font-semibold whitespace-nowrap',
                        STATUS_TONE[row.status]
                      )}
                    >
                      {TEMPLATE_STATUS_LABELS[row.status]}
                      {row.status === 'PUBLISHED' && ` · v${row.version}`}
                    </span>
                  </div>

                  {row.description && (
                    <p className="mt-1.5 line-clamp-2 text-sm text-muted">{row.description}</p>
                  )}

                  <p className="mt-auto pt-4 text-sm text-subtle">
                    {TEMPLATE_PURPOSE_LABELS[row.purpose]} ·{' '}
                    {row.sections.length} {row.sections.length === 1 ? 'section' : 'sections'} ·{' '}
                    {questions} {questions === 1 ? 'question' : 'questions'}
                    {row.documentTypes.length > 0 &&
                      ` · ${row.documentTypes.length} documents`}
                  </p>
                  <p className="text-sm text-subtle">Updated {formatDate(row.updatedAt)}</p>
                </Link>
              </li>
            );
          })}
        </ul>
      )}

      {meta && <Pager meta={meta} onPage={setPage} label="Template pages" />}
    </div>
  );
}

export default TemplateList;
