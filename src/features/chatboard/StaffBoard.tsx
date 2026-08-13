'use client';

import { useCallback, useState } from 'react';
import { Archive, Hash, Lock, Send, ShieldAlert } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useApi } from '@/hooks/useApi';
import { useSubmit } from '@/hooks/useSubmit';
import { useAuth } from '@/auth/useAuth';
import { PERMISSIONS } from '@/auth/permissions';
import { Alert, ErrorAlert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { authorOf, listChannels, listMessages, postMessage } from '@/api/chatboard.api';
import type { Channel, Message } from '@/api/chatboard.api';
import { blockedReason } from './lib/guard';
import { ROLE_LABELS } from '@/types/enums';
import { formatDateTime, formatRelative } from '@/lib/dates';

/*
 * The staff board.
 *
 * THE COMPOSER REFUSES ID NUMBERS BEFORE THE SERVER DOES, and that is the whole reason
 * this screen has a tested module behind it. The board is not case notes: a message is
 * visible to a whole channel, scoped to no caseload, and has no sensitive-read audit — so
 * an ID number pasted here has slipped every control the rest of the system puts around
 * exactly that number.
 *
 * The server refuses it either way. Catching it in the composer matters because the
 * alternative is a long message bounced back after send, and the version somebody retypes
 * has the digits split across two lines — which passes the check and defeats the rule. The
 * warning names the alternative rather than only the prohibition.
 *
 * THREE OTHER RULES ARE SHOWN RATHER THAN DISCOVERED:
 *   A PRIVATE channel is members-only even for someone holding chatboard:read.
 *   An ARCHIVED channel stays readable and takes no new messages — so its composer is
 *   replaced by the reason, not disabled without explanation.
 *   A DELETED message keeps its place in the thread with its content gone, because
 *   removing the row outright would let someone quietly rewrite what a channel agreed.
 */

function ChannelButton({
  channel,
  active,
  onSelect,
}: {
  channel: Channel;
  active: boolean;
  onSelect: () => void;
}) {
  return (
    <li>
      <button
        type="button"
        onClick={onSelect}
        aria-current={active ? 'true' : undefined}
        className={cn(
          'flex w-full flex-col gap-0.5 rounded-lg px-3 py-2 text-left transition-colors',
          active ? 'bg-brand-50 text-brand-700' : 'text-body hover:bg-ink-50'
        )}
      >
        <span className="flex items-center gap-1.5 text-sm font-medium">
          {channel.isPrivate ? (
            <Lock className="size-3.5 shrink-0" aria-hidden="true" />
          ) : (
            <Hash className="size-3.5 shrink-0 text-subtle" aria-hidden="true" />
          )}
          <span className="truncate">{channel.name}</span>
          {channel.isArchived && (
            <Archive className="size-3.5 shrink-0 text-subtle" aria-hidden="true" />
          )}
        </span>
        <span className="truncate text-xs text-subtle">
          {channel.lastMessageAt ? formatRelative(channel.lastMessageAt) : 'No messages yet'}
        </span>
      </button>
    </li>
  );
}

function MessageRow({ message }: { message: Message }) {
  const author = authorOf(message);

  if (message.deletedAt) {
    return (
      <li className="px-1 py-2">
        {/* The slot is kept. A thread that silently closes up is a thread somebody edited. */}
        <p className="text-xs text-subtle italic">
          Message deleted {formatRelative(message.deletedAt)}.
        </p>
      </li>
    );
  }

  return (
    <li className="px-1 py-2.5">
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
        <span className="text-sm font-semibold text-body">{author?.name ?? 'Unknown'}</span>
        {author?.role && <span className="text-xs text-subtle">{ROLE_LABELS[author.role]}</span>}
        <span className="text-xs text-subtle" title={formatDateTime(message.createdAt)}>
          {formatRelative(message.createdAt)}
        </span>
        {message.isEdited && <span className="text-xs text-subtle">· edited</span>}
      </div>
      <p className="mt-0.5 text-sm whitespace-pre-wrap text-body">{message.body}</p>
    </li>
  );
}

function Composer({ channel, onSent }: { channel: Channel; onSent: () => void }) {
  const [body, setBody] = useState('');
  const { submit, busy, error, fieldErrors } = useSubmit(postMessage, {
    onSuccess: () => {
      setBody('');
      onSent();
    },
  });

  if (channel.isArchived) {
    return (
      <Alert tone="info">
        This channel is archived. It stays readable — a decision recorded here is still
        evidence — but it takes no new messages.
      </Alert>
    );
  }

  // Checked as they type, with the server's own wording. See lib/guard.ts.
  const blocked = blockedReason(body);
  const empty = body.trim().length === 0;

  return (
    <form
      className="flex flex-col gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        if (blocked || empty) return;
        void submit(channel._id, body.trim());
      }}
    >
      {error && <ErrorAlert error={error} />}

      <label className="flex flex-col gap-1.5">
        <span className="sr-only">Message {channel.name}</span>
        <textarea
          value={body}
          onChange={(event) => setBody(event.target.value)}
          rows={3}
          maxLength={4000}
          placeholder={`Message #${channel.slug}`}
          disabled={busy}
          className={cn(
            'rounded-lg border bg-surface px-3 py-2 text-sm text-body placeholder:text-subtle focus:border-brand-400',
            blocked ? 'border-danger-500' : 'border-line hover:border-line-strong'
          )}
        />
      </label>

      {blocked ? (
        <p className="flex items-start gap-1.5 text-xs font-medium text-danger-700">
          <ShieldAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
          {blocked}
        </p>
      ) : (
        <p className="text-xs text-subtle">
          Anything about one person belongs on their record, not here — this channel is
          visible to everyone in it.
        </p>
      )}

      {fieldErrors.body && <p className="text-xs text-danger-700">{fieldErrors.body}</p>}

      <Button
        type="submit"
        loading={busy}
        disabled={empty || blocked !== null}
        className="self-start px-5 py-2"
      >
        <Send className="size-4" aria-hidden="true" />
        {busy ? 'Sending…' : 'Send'}
      </Button>
    </form>
  );
}

export function StaffBoard() {
  const { can } = useAuth();
  const mayPost = can(PERMISSIONS.CHATBOARD_POST);

  const [activeId, setActiveId] = useState<string | null>(null);
  const [includeArchived, setIncludeArchived] = useState(false);

  const channels = useApi(
    useCallback(
      (signal: AbortSignal) =>
        listChannels({ limit: 50, ...(includeArchived ? { includeArchived: true } : {}) }, signal),
      [includeArchived]
    ),
    [includeArchived]
  );

  const rows = channels.data?.data ?? [];
  // Falls back to the most recently active channel rather than an empty right-hand pane.
  const active = rows.find((c) => c._id === activeId) ?? rows[0] ?? null;
  // The id, not the object: it is the only part the fetch depends on, and naming it makes
  // the dependency list the whole truth rather than an approximation of one.
  const openChannelId = active?._id ?? null;

  const thread = useApi(
    useCallback(
      (signal: AbortSignal) =>
        openChannelId
          ? listMessages(openChannelId, { limit: 50, sort: '-createdAt' }, signal)
          : Promise.resolve(null),
      [openChannelId]
    ),
    [openChannelId]
  );

  // The API returns newest first, which is right for paging and wrong for reading: a
  // conversation is read downwards.
  const messages = [...(thread.data?.data ?? [])].reverse();

  return (
    <div className="flex flex-col gap-5">
      <header>
        <h1 className="text-2xl font-semibold tracking-[-0.02em] text-body">Staff board</h1>
        <p className="mt-1 max-w-prose text-sm text-muted">
          Internal channels for the team. Not a case-notes system — anything about a
          specific person belongs on their record.
        </p>
      </header>

      {channels.error && (
        <div className="flex flex-col items-start gap-3">
          <ErrorAlert error={channels.error} />
          <Button variant="subtle" onClick={channels.reload}>
            Try again
          </Button>
        </div>
      )}

      {channels.loading && !channels.data && (
        <Spinner label="Loading channels" className="py-20" />
      )}

      {channels.data && rows.length === 0 && (
        <div className="rounded-xl border border-line bg-surface px-6 py-12 text-center">
          <Hash className="mx-auto size-5 text-subtle" aria-hidden="true" />
          <p className="mt-2 text-sm text-body">No channels yet.</p>
          <p className="mx-auto mt-1 max-w-sm text-xs text-muted">
            Private channels appear here only for their members.
          </p>
        </div>
      )}

      {rows.length > 0 && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[16rem_1fr]">
          <aside className="rounded-xl border border-line bg-surface p-2">
            <ul className="flex flex-col gap-0.5">
              {rows.map((channel) => (
                <ChannelButton
                  key={channel._id}
                  channel={channel}
                  active={active?._id === channel._id}
                  onSelect={() => setActiveId(channel._id)}
                />
              ))}
            </ul>
            <label className="mt-2 flex items-center gap-2 px-3 py-2 text-xs text-muted">
              <input
                type="checkbox"
                checked={includeArchived}
                onChange={(event) => setIncludeArchived(event.target.checked)}
                className="size-3.5 rounded border-line"
              />
              Show archived
            </label>
          </aside>

          {active && (
            <section className="flex flex-col gap-3 rounded-xl border border-line bg-surface p-5">
              <div>
                <h2 className="flex items-center gap-2 text-sm font-semibold text-body">
                  {active.isPrivate ? (
                    <Lock className="size-4 text-subtle" aria-hidden="true" />
                  ) : (
                    <Hash className="size-4 text-subtle" aria-hidden="true" />
                  )}
                  {active.name}
                  {active.isPrivate && (
                    <span className="rounded-full bg-ink-100 px-2 py-0.5 text-[0.625rem] font-bold tracking-wide text-ink-600 uppercase">
                      Private
                    </span>
                  )}
                  {active.isArchived && (
                    <span className="rounded-full bg-ink-100 px-2 py-0.5 text-[0.625rem] font-bold tracking-wide text-ink-600 uppercase">
                      Archived
                    </span>
                  )}
                </h2>
                {active.description && (
                  <p className="mt-1 text-xs text-muted">{active.description}</p>
                )}
              </div>

              {thread.error && <ErrorAlert error={thread.error} />}
              {thread.loading && !thread.data && (
                <Spinner label="Loading messages" className="py-10" />
              )}

              {thread.data && messages.length === 0 && (
                <p className="py-6 text-center text-sm text-muted">
                  Nothing posted here yet.
                </p>
              )}

              {messages.length > 0 && (
                <ul className="divide-y divide-line">
                  {messages.map((message) => (
                    <MessageRow key={message._id} message={message} />
                  ))}
                </ul>
              )}

              {mayPost ? (
                <Composer channel={active} onSent={thread.reload} />
              ) : (
                <p className="text-xs text-subtle">
                  Your role can read the board but not post to it.
                </p>
              )}
            </section>
          )}
        </div>
      )}
    </div>
  );
}

export default StaffBoard;
