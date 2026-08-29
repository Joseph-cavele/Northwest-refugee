'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  ArrowRight,
  BookOpen,
  ChevronRight,
  FileText,
  GraduationCap,
  HeartHandshake,
  HelpCircle,
  Send,
  Sparkles,
  Users,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { PATHS } from '@/lib/paths';

/*
 * The assistant panel.
 *
 * WHAT THIS IS, PLAINLY: a guided chooser wearing a conversation's clothes. The replies are
 * scripted, not generated — nothing here calls a model, and it is deliberately not wired to
 * /api/v1/guide or to the OpenAI intent classifier yet. It behaves exactly as the brief
 * describes and answers nothing it has not been given, which is worth knowing before anyone
 * demonstrates it to a funder.
 *
 * Saying so matters more than usual here. The people this is for are asking about permits
 * and school places, so free text is acknowledged and steered back to the options rather
 * than answered with something invented — and the line under the input says outright that
 * the assistant can be wrong. That line is in the reference too, and it earns its place.
 *
 * THE OPTIONS ARE FULL-WIDTH ROWS, NOT CHIPS, following the reference — and it is the better
 * shape regardless: each is a door with an icon, a label and a chevron, sized for a thumb on
 * a cheap phone rather than a mouse. Someone who reads little English can still tell six
 * doors apart by their marks.
 *
 * The welcome message and all six options are server-rendered, so the panel is useful before
 * any JavaScript arrives. Only the exchange needs the client.
 */

interface Action {
  id: string;
  label: string;
  Icon: LucideIcon;
  /** Tint per door, so the six are distinguishable at a glance and not by text alone. */
  tint: string;
  reply: string;
}

/** The five pillars, plus the honest sixth for somebody who does not know the vocabulary. */
const QUICK_ACTIONS: Action[] = [
  {
    id: 'documentation',
    label: 'Documentation Help',
    Icon: FileText,
    tint: 'bg-success-50 text-success-700',
    reply:
      'Permits, asylum papers, birth certificates and Home Affairs appointments. We can check what you have and what is missing.',
  },
  {
    id: 'education',
    label: 'Education Support',
    Icon: GraduationCap,
    tint: 'bg-brand-50 text-brand-700',
    reply: 'School placement for children, and help with the documents a school will ask for.',
  },
  {
    id: 'skills',
    label: 'Skills Training',
    Icon: BookOpen,
    tint: 'bg-gold-100 text-gold-700',
    reply: 'Training courses, and help getting started with work or a small business.',
  },
  {
    id: 'social',
    label: 'Social Support',
    Icon: HeartHandshake,
    tint: 'bg-accent-50 text-accent-800',
    reply: 'Food, shelter, counselling, and help when something has gone wrong.',
  },
  {
    id: 'women-youth',
    label: 'Women & Youth Programmes',
    Icon: Users,
    tint: 'bg-danger-50 text-danger-700',
    reply: 'Programmes for women and for young people, including safety and support groups.',
  },
  {
    id: 'unsure',
    label: 'I’m Not Sure What I Need',
    Icon: HelpCircle,
    tint: 'bg-ink-100 text-ink-600',
    reply:
      'That is completely fine — most people are not sure. We can talk it through and work it out together.',
  },
];

interface Turn {
  from: 'assistant' | 'you';
  text: string;
  /** The screening offer follows any reply that has identified a way forward. */
  offersScreening?: boolean;
}

const WELCOME =
  'Hello! 👋 I’m the North West Refugee Centre AI Assistant. I can help you find the right service or programme. What do you need help with?';

export function AssistantPanel() {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [draft, setDraft] = useState('');

  function choose(action: Action) {
    setTurns((prev) => [
      ...prev,
      { from: 'you', text: action.label },
      { from: 'assistant', text: action.reply },
      {
        from: 'assistant',
        text: 'I can help you start your assistance request.',
        offersScreening: true,
      },
    ]);
  }

  function send(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const text = draft.trim();
    if (!text) return;

    setTurns((prev) => [
      ...prev,
      { from: 'you', text },
      {
        from: 'assistant',
        // No invention. It says what it can do and hands back the doors — a made-up answer
        // about somebody's permit is the one failure this must not have.
        text: 'Thank you. I cannot answer that in detail yet, but I can point you to the right service — choose one below, or start a request and a caseworker will read what you have written.',
        offersScreening: true,
      },
    ]);
    setDraft('');
  }

  return (
    <div className="flex w-full flex-col overflow-hidden rounded-2xl bg-surface shadow-2xl ring-1 ring-ink-950/5">
      {/* --- header ------------------------------------------------------------------ */}
      <div className="flex items-center justify-between gap-3 bg-brand-500 px-4 py-3 text-white">
        <p className="flex items-center gap-2 text-sm font-semibold">
          <Sparkles className="size-4" aria-hidden="true" />
          AI Assistant
        </p>
        <p className="flex items-center gap-1.5 text-xs">
          {/* The word as well as the dot: a green circle alone is not a status to anyone
              who cannot separate it from the grey one. */}
          <span aria-hidden="true" className="size-2 rounded-full bg-success-500" />
          Online
        </p>
      </div>

      {/* --- conversation ------------------------------------------------------------- */}
      <div
        // Announced politely: a reply arriving is a confirmation, not something that should
        // interrupt whatever the reader is in the middle of.
        role="log"
        aria-live="polite"
        className="flex max-h-72 flex-col gap-3 overflow-y-auto px-4 py-4"
      >
        <div className="flex items-start gap-2.5">
          <span className="grid size-8 shrink-0 place-items-center rounded-full bg-brand-50 text-brand-700">
            <Sparkles className="size-4" aria-hidden="true" />
          </span>
          <p className="max-w-[88%] rounded-xl rounded-tl-sm bg-ink-50 px-3.5 py-2.5 text-sm leading-relaxed text-body">
            {WELCOME}
          </p>
        </div>

        {turns.map((turn, index) => (
          <div
            key={`${turn.from}-${index}`}
            className={cn('flex flex-col gap-2', turn.from === 'you' && 'items-end')}
          >
            <p
              className={cn(
                'max-w-[88%] rounded-xl px-3.5 py-2.5 text-sm leading-relaxed',
                turn.from === 'you'
                  ? 'rounded-tr-sm bg-brand-500 text-white'
                  : 'rounded-tl-sm bg-ink-50 text-body'
              )}
            >
              {turn.text}
            </p>

            {turn.offersScreening && (
              <Link
                href={PATHS.screening}
                className="inline-flex min-h-11 items-center gap-2 self-start rounded-lg bg-brand-500 px-4 text-sm font-semibold text-white transition-colors hover:bg-brand-700"
              >
                Start Screening
                <ArrowRight className="size-4" aria-hidden="true" />
              </Link>
            )}
          </div>
        ))}
      </div>

      {/* --- the doors ---------------------------------------------------------------- */}
      <div className="flex flex-col gap-1.5 px-4 pb-3">
        {QUICK_ACTIONS.map((action) => (
          <button
            key={action.id}
            type="button"
            onClick={() => choose(action)}
            className="flex w-full items-center gap-3 rounded-lg border border-line px-3 py-2.5 text-left transition-colors hover:border-brand-400 hover:bg-brand-50/50"
          >
            <span className={cn('grid size-8 shrink-0 place-items-center rounded-md', action.tint)}>
              <action.Icon className="size-4" aria-hidden="true" />
            </span>
            <span className="min-w-0 flex-1 truncate text-sm text-body">{action.label}</span>
            <ChevronRight className="size-4 shrink-0 text-subtle" aria-hidden="true" />
          </button>
        ))}
      </div>

      {/* --- input -------------------------------------------------------------------- */}
      <div className="border-t border-line px-4 py-3">
        <form onSubmit={send} className="flex items-center gap-2">
          <label className="min-w-0 flex-1">
            <span className="sr-only">Type your question</span>
            <input
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              placeholder="Type your question…"
              maxLength={500}
              // No focus:outline-none. globals.css says outright that visible focus is not
              // decoration and there is no reason to suppress it — a border colour change
              // is a weaker signal, and this input is the one control here a keyboard user
              // most needs to find.
              className="min-h-11 w-full rounded-lg border border-line bg-surface px-3.5 text-sm text-body placeholder:text-subtle hover:border-line-strong focus:border-brand-400"
            />
          </label>
          <button
            type="submit"
            disabled={draft.trim().length === 0}
            className="grid size-11 shrink-0 place-items-center rounded-lg bg-brand-500 text-white transition-colors hover:bg-brand-700 disabled:bg-ink-200 disabled:text-ink-400"
          >
            <Send className="size-4" aria-hidden="true" />
            <span className="sr-only">Send</span>
          </button>
        </form>

        {/*
          * In the reference, and it belongs here on merit: the replies are scripted and a
          * caseworker's answer is the real one. Saying so beside the input is the difference
          * between a tool and a thing that seems to know more than it does.
          */}
        <p className="mt-2 flex items-start gap-1.5 text-[0.6875rem] leading-relaxed text-subtle">
          <Sparkles className="mt-0.5 size-3 shrink-0" aria-hidden="true" />
          This assistant can be wrong. For anything about your papers, please check with a
          caseworker.
        </p>
      </div>
    </div>
  );
}

export default AssistantPanel;
