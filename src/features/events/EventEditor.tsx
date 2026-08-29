'use client';

import { useCallback } from 'react';
import { useApi } from '@/hooks/useApi';
import { ErrorAlert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { getEvent } from '@/api/events.api';
import type { Id } from '@/types/models';
import { EventForm } from './EventForm';

/*
 * Loads one event, then hands it to the form.
 *
 * A SEPARATE COMPONENT RATHER THAN A FETCH INSIDE EventForm, so the form stays a pure
 * function of the event it is given — which is what lets the same component serve both
 * `/events/new` (no event) and `/events/:id/edit` (this one) without a branch on whether it
 * is still loading something.
 *
 * The form is mounted only once the record has arrived. Rendering it empty and filling it in
 * afterwards would reset every field an officer had already typed if the request were slow
 * enough for them to start.
 */
export function EventEditor({ id }: { id: Id }) {
  const { data, loading, error, reload } = useApi(
    useCallback((signal: AbortSignal) => getEvent(id, signal), [id])
  );

  if (loading && !data) return <Spinner label="Loading the event" className="py-20" />;

  if (error) {
    return (
      <div className="flex flex-col items-start gap-3">
        <ErrorAlert error={error} />
        <Button variant="subtle" onClick={reload}>
          Try again
        </Button>
      </div>
    );
  }

  if (!data) return null;

  return <EventForm event={data} />;
}

export default EventEditor;
