'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ArrowLeft,
  Bot,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  MessageCircle,
  Phone,
  Send,
} from 'lucide-react';
import { fetchGuide, askGuide } from '@/api/guide.api';
import type { GuideNode, GuideTree } from '@/api/guide.api';

/*
 * The help guide — the public face of /api/v1/guide.
 *
 * IT DOES NOT MAKE ANYTHING UP, AND THE ARCHITECTURE IS WHY. Every word a visitor reads
 * comes from src/server/modules/guide/guide.content.js, written by the organisation and
 * reviewed in version control. OpenAI is reachable from exactly one path here — free text
 * typed into the box — and all it does is CHOOSE which of those written screens to show.
 * It never composes a reply. That is the constraint CLAUDE.md sets on AI in this system,
 * and this widget is bound by it rather than working around it.
 *
 * THREE BEHAVIOURS COME STRAIGHT FROM THE API AND MUST NOT BE SIMPLIFIED AWAY:
 *
 *   source: 'safety-rule'   a danger keyword matched, server-side, without the model being
 *                           called at all. Shown AT ONCE. Asking somebody to confirm "did
 *                           you mean: I am not safe?" before giving them a number is the
 *                           wrong behaviour at the wrong moment.
 *
 *   requiresConfirmation    an AI match is a guess, so it is echoed back — "Did you mean:
 *                           School for a child?" — and the person confirms. A guess
 *                           presented as an answer is how people act on wrong information.
 *
 *   translated: false       only English is written. When somebody asks for French and gets
 *                           English, the widget says so rather than pretending.
 *
 * THE TREE IS FETCHED ONCE, ON FIRST OPEN. The service returns all of it in one response
 * precisely so the widget can navigate offline afterwards — somebody on an intermittent
 * connection can still work through the guide. Only free text needs the network again.
 *
 * NOT FETCHED ON MOUNT: most visitors never open this, and a request fired on every page
 * load is a request charged to somebody's data bundle for nothing.
 */

interface Turn {
  from: 'guide' | 'you';
  text: string;
  /** Set on a guide turn that is asking the person to confirm an AI match. */
  confirm?: { stepId: string };
  /** Set when the server matched on the safety rule, so the turn can be marked urgent. */
  urgent?: boolean;
  /**
   * Set when the guide could not answer and a person should. Design.md §17 requires this
   * path to exist — "the AI must provide a path to human support" — and §69 gives it a
   * button rather than leaving somebody to find the contact page themselves.
   */
  escalate?: boolean;
}

export function ChatGuide() {
  const [open, setOpen] = useState(false);
  const [tree, setTree] = useState<GuideTree | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [nodeId, setNodeId] = useState<string | null>(null);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [draft, setDraft] = useState('');
  const [asking, setAsking] = useState(false);

  const launcher = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const thread = useRef<HTMLDivElement>(null);

  const node: GuideNode | null = tree && nodeId ? (tree.nodes[nodeId] ?? null) : null;

  /* --- loading ------------------------------------------------------------------- */

  useEffect(() => {
    if (!open || tree || loadFailed) return;

    let cancelled = false;

    fetchGuide()
      .then((loaded) => {
        if (cancelled) return;
        setTree(loaded);
        setNodeId(loaded.rootId);
      })
      .catch(() => {
        if (!cancelled) setLoadFailed(true);
      });

    return () => {
      cancelled = true;
    };
  }, [open, tree, loadFailed]);

  /* --- keyboard and focus -------------------------------------------------------- */

  const close = useCallback(() => {
    setOpen(false);
    launcher.current?.focus();
  }, []);

  useEffect(() => {
    if (!open) return;

    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') close();
    }

    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, close]);

  useEffect(() => {
    if (open) panel.current?.focus();
  }, [open]);

  /* Keep the newest turn in view. Scrolls the THREAD, never the page behind it. */
  useEffect(() => {
    const element = thread.current;
    if (element) element.scrollTop = element.scrollHeight;
  }, [turns.length, nodeId]);

  /* --- moving through the guide -------------------------------------------------- */

  function go(next: string, spoken?: string) {
    if (spoken) setTurns((previous) => [...previous, { from: 'you', text: spoken }]);
    setNodeId(next);
  }

  async function send(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const text = draft.trim();
    if (!text || asking) return;

    setTurns((previous) => [...previous, { from: 'you', text }]);
    setDraft('');
    setAsking(true);

    try {
      const answer = await askGuide(text);

      if (answer.requiresConfirmation && answer.confirmPrompt) {
        // A guess. Echo it and let the person say yes or no before moving them.
        setTurns((previous) => [
          ...previous,
          {
            from: 'guide',
            text: `Did you mean: ${answer.confirmPrompt}?`,
            confirm: { stepId: answer.node.id },
          },
        ]);
        return;
      }

      if (answer.source === 'safety-rule') {
        setTurns((previous) => [
          ...previous,
          { from: 'guide', text: 'Taking you straight there.', urgent: true },
        ]);
      }

      /*
       * NOTHING MATCHED — the server is showing the menu rather than an answer. Design.md §17
       * requires a route to a human at exactly this point, and §69 words it: "I think an NWHR
       * staff member should review this request."
       *
       * The menu still appears underneath, so this adds a door rather than replacing one. It
       * is deliberately NOT offered on a successful match: an escalation button on every reply
       * would read as the guide having no confidence in any of its own answers.
       */
      if (!answer.matched && answer.source !== 'safety-rule') {
        setTurns((previous) => [
          ...previous,
          {
            from: 'guide',
            text: 'I could not match that to one of our services. A staff member can help with this one.',
            escalate: true,
          },
        ]);
      }

      setNodeId(answer.node.id);
    } catch {
      /*
       * The endpoint is rate limited and reaches a metered model, so failing is a normal
       * outcome rather than an exception. Falling back to the menu is what the server does
       * on its own timeouts too — a wrong guess is worse than asking.
       */
      setTurns((previous) => [
        ...previous,
        {
          from: 'guide',
          text: 'I could not work that one out. Choose the closest option below, or talk to a person.',
          escalate: true,
        },
      ]);
      if (tree) setNodeId('need-help' in tree.nodes ? 'need-help' : tree.rootId);
    } finally {
      setAsking(false);
    }
  }

  /* --- render -------------------------------------------------------------------- */

  return (
    <div className="fixed right-4 bottom-4 z-50 font-(family-name:--font-ui) sm:right-6 sm:bottom-6">
      {open && (
        <div
          ref={panel}
          tabIndex={-1}
          role="dialog"
          aria-label="Help guide"
          /*
           * SMALLER ON A PHONE, and the height is the part that matters. At 34rem the panel
           * covered roughly four fifths of a 667px screen, which reads as having navigated
           * away from the page rather than having opened something on it. 26rem leaves the
           * hero visible behind it, and `100dvh-8rem` — dvh, so an address bar sliding in
           * does not push the input off the bottom — keeps it off both edges on a short
           * screen. The full size returns at sm, where there is room for it.
           */
          className="mb-2 flex h-[min(26rem,calc(100dvh-8rem))] w-[min(20rem,calc(100vw-2rem))] flex-col overflow-hidden rounded-3xl border border-white/20 bg-surface shadow-[0_20px_40px_rgba(0,0,0,0.05)] sm:mb-3 sm:h-[min(34rem,calc(100dvh-6rem))] sm:w-[min(23rem,calc(100vw-2rem))]"
        >
          <div className="flex items-center justify-between gap-3 bg-ink-950 px-3.5 py-3 text-white sm:px-4 sm:py-3.5">
            <p className="flex items-center gap-2.5 text-sm font-semibold tracking-wider uppercase">
              <Bot className="size-5 shrink-0 text-gold-400" aria-hidden="true" />
              Help guide
            </p>
            <button
              type="button"
              onClick={close}
              aria-label="Close help guide"
              className="grid size-8 place-items-center rounded-lg text-white/80 transition-colors hover:bg-white/10 hover:text-white"
            >
              <ChevronDown className="size-5" aria-hidden="true" />
            </button>
          </div>

          <div
            ref={thread}
            role="log"
            aria-live="polite"
            className="flex min-h-0 flex-1 flex-col gap-2.5 overflow-y-auto px-3.5 py-3.5 sm:gap-3 sm:px-4 sm:py-4"
          >
            {loadFailed && (
              <Bubble from="guide">
                The guide could not load. Please check your connection and try again, or call
                us — the number is at the top of this page.
              </Bubble>
            )}

            {!tree && !loadFailed && <Bubble from="guide">One moment…</Bubble>}

            {/*
             * Only English is written. Saying so is not a footnote: serving English under a
             * French label is exactly the failure this guide is built to avoid.
             */}
            {tree && !tree.translated && (
              <p className="rounded-lg bg-gold-100 px-3.5 py-2.5 text-xs leading-relaxed text-ink-900">
                This guide is only written in English so far. A caseworker can speak with you
                in your language.
              </p>
            )}

            {turns.map((turn, index) => (
              <div key={`${turn.from}-${index}`} className="contents">
                <Bubble from={turn.from} urgent={turn.urgent}>
                  {turn.text}
                </Bubble>

                {turn.confirm && (
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => go(turn.confirm!.stepId, 'Yes')}
                      className="min-h-11 rounded-lg bg-gold-400 px-4 text-sm font-semibold tracking-wider text-ink-950 uppercase transition-colors hover:bg-gold-500"
                    >
                      Yes
                    </button>
                    <button
                      type="button"
                      onClick={() => go(tree?.nodes['need-help'] ? 'need-help' : 'root', 'No')}
                      className="min-h-11 rounded-lg border border-line px-4 text-sm font-semibold tracking-wider text-ink-950 uppercase transition-colors hover:bg-ink-50"
                    >
                      No, show the list
                    </button>
                  </div>
                )}

                {/*
                 * §17's route to a human. It goes to the guide's own `contact` node rather
                 * than opening a new form: that screen already carries WhatsApp and the office
                 * address, and it is written and reviewed in guide.content.js like everything
                 * else the widget says.
                 */}
                {turn.escalate && (
                  <button
                    type="button"
                    onClick={() => go('contact', 'Talk to a person')}
                    className="inline-flex min-h-11 items-center gap-2 self-start rounded-lg bg-ink-950 px-4 text-sm font-semibold tracking-wider text-white uppercase transition-colors hover:bg-ink-800"
                  >
                    <Phone className="size-4 shrink-0" aria-hidden="true" />
                    Talk to a person
                  </button>
                )}
              </div>
            ))}

            {node && (
              <>
                <Bubble from="guide">
                  <span className="block font-semibold">{node.title}</span>
                  <span className="mt-1 block">{node.message}</span>
                  {node.note && (
                    <span className="mt-2 block text-ink-600 italic">{node.note}</span>
                  )}
                </Bubble>

                {node.options && node.options.length > 0 && (
                  <ul className="flex flex-col gap-1.5">
                    {node.options.map((option) => (
                      <li key={option.next}>
                        <button
                          type="button"
                          onClick={() => go(option.next, option.label)}
                          className="flex min-h-12 w-full items-center gap-3 rounded-lg border border-line px-3 text-left transition-colors hover:border-ink-950 hover:bg-ink-50"
                        >
                          <span className="min-w-0 flex-1 text-sm font-semibold text-ink-950">
                            {option.label}
                          </span>
                          <ChevronRight
                            className="size-4 shrink-0 text-ink-400"
                            aria-hidden="true"
                          />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}

                {/* Actions leave the widget. The server drops any whose target is not
                    configured, so nothing here renders as a dead button. */}
                {node.actions && node.actions.length > 0 && (
                  <ul className="flex flex-col gap-1.5">
                    {node.actions.map((action) => (
                      <li key={`${action.type}-${action.value}`}>
                        <a
                          href={action.value}
                          {...(action.type === 'link'
                            ? { target: '_blank', rel: 'noopener noreferrer' }
                            : {})}
                          className="flex min-h-12 w-full items-center gap-2.5 rounded-lg bg-gold-400 px-4 text-sm font-semibold tracking-wider text-ink-950 uppercase transition-colors hover:bg-gold-500"
                        >
                          {action.type === 'call' ? (
                            <Phone className="size-4 shrink-0" aria-hidden="true" />
                          ) : (
                            <ExternalLink className="size-4 shrink-0" aria-hidden="true" />
                          )}
                          {action.label}
                        </a>
                      </li>
                    ))}
                  </ul>
                )}

                {node.back && (
                  <button
                    type="button"
                    onClick={() => setNodeId(node.back!)}
                    className="inline-flex min-h-11 items-center gap-2 self-start rounded-lg px-2 text-sm font-semibold text-ink-600 transition-colors hover:text-ink-950"
                  >
                    <ArrowLeft className="size-4" aria-hidden="true" />
                    Back
                  </button>
                )}
              </>
            )}
          </div>

          <div className="border-t border-line px-3.5 py-2.5 sm:px-4 sm:py-3">
            <form onSubmit={send} className="flex items-center gap-2">
              <label className="min-w-0 flex-1">
                <span className="sr-only">Tell us what you need</span>
                <input
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                  placeholder="Tell us what you need…"
                  // The server rejects anything longer, so stop it here rather than sending
                  // a request that is going to fail validation.
                  maxLength={300}
                  disabled={!tree || asking}
                  className="min-h-11 w-full rounded-lg border border-line bg-surface px-3.5 text-sm text-body placeholder:text-subtle hover:border-line-strong disabled:bg-ink-50"
                />
              </label>
              <button
                type="submit"
                disabled={!tree || asking || draft.trim().length === 0}
                className="grid size-11 shrink-0 place-items-center rounded-lg bg-ink-950 text-white transition-colors hover:bg-ink-800 disabled:bg-ink-200 disabled:text-ink-400"
              >
                <Send className="size-4" aria-hidden="true" />
                <span className="sr-only">Send</span>
              </button>
            </form>

            <p className="mt-2.5 text-[0.6875rem] leading-relaxed text-subtle">
              This guide points you to the right service. It cannot advise on your case — for
              that, please speak to a caseworker.
            </p>
          </div>
        </div>
      )}

      <button
        ref={launcher}
        type="button"
        onClick={() => setOpen((was) => !was)}
        aria-expanded={open}
        // 48px on a phone rather than 56 — still comfortably above the 44px touch minimum,
        // and a floating button that sits over content should not be the largest control on
        // the screen.
        className="ml-auto flex size-12 items-center justify-center rounded-full bg-gold-400 text-ink-950 shadow-[0_20px_40px_rgba(0,0,0,0.15)] transition-colors hover:bg-gold-500 sm:size-14"
      >
        {open ? (
          <ChevronDown className="size-5 sm:size-6" aria-hidden="true" />
        ) : (
          <MessageCircle className="size-5 sm:size-6" aria-hidden="true" />
        )}
        <span className="sr-only">{open ? 'Close help guide' : 'Open help guide'}</span>
      </button>
    </div>
  );
}

/** One message. `you` sits right and dark; the guide sits left with its mark beside it. */
function Bubble({
  from,
  urgent,
  children,
}: {
  from: 'guide' | 'you';
  urgent?: boolean;
  children: React.ReactNode;
}) {
  if (from === 'you') {
    return (
      <p className="max-w-[85%] self-end rounded-lg rounded-tr-sm bg-ink-950 px-3.5 py-2.5 text-sm leading-relaxed text-white">
        {children}
      </p>
    );
  }

  return (
    <div className="flex items-start gap-2.5">
      <span className="grid size-8 shrink-0 place-items-center rounded-full bg-ink-950 text-gold-400">
        <Bot className="size-4" aria-hidden="true" />
      </span>
      <div
        className={
          urgent
            ? 'max-w-[85%] rounded-lg rounded-tl-sm bg-danger-50 px-3.5 py-2.5 text-sm leading-relaxed text-danger-700'
            : 'max-w-[85%] rounded-lg rounded-tl-sm bg-ink-50 px-3.5 py-2.5 text-sm leading-relaxed text-body'
        }
      >
        {children}
      </div>
    </div>
  );
}

export default ChatGuide;
