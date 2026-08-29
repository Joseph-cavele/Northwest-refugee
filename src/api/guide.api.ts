import { api } from './client';

/*
 * The /guide endpoints, typed. See src/app/api/v1/guide/.
 *
 * THE ONLY PUBLIC API ON THIS SITE. Every other module here is called from behind a login;
 * these three are deliberately open, because somebody looking for help must not need an
 * account to find out how to get it.
 *
 * WHAT THE MODEL DOES AND DOES NOT DO, since this is the one place OpenAI is reachable from
 * the website. `ask` sends free text and gets back one of NWHR's own written screens. The
 * model only chooses WHICH screen; the words a person reads are always the organisation's,
 * reviewed in version control. It never composes a reply and never answers a question about
 * somebody's permit. See src/server/modules/guide/guide.intent.js — the instruction and the
 * fixed list of routable steps are both there.
 *
 * BOTH CALLS ARE `anonymous`, which matters on a page no one is signed in to. Without it the
 * client attaches whatever access token happens to be in memory and, on a 401, runs the
 * refresh-and-retry path and calls notifyExpired() — machinery built for the dashboard that
 * would push a visitor looking for help toward the staff sign-in screen. These endpoints
 * take no credential and should carry none.
 */

/** One screen: something said, and a set of ways onward. */
export interface GuideNode {
  id: string;
  title: string;
  message: string;
  /** An aside under the message. Present on some screens only. */
  note?: string;
  /** Move to another node inside the widget. */
  options?: { label: string; next: string }[];
  /** Leave the widget — open WhatsApp, dial, or visit a page. */
  actions?: { type: 'whatsapp' | 'call' | 'link'; label: string; value: string }[];
  /** The node one step back, if there is one. */
  back?: string;
}

export interface GuideTree {
  version: string;
  /** The language actually served, which may differ from the one asked for. */
  language: string;
  requestedLanguage: string;
  /**
   * FALSE MEANS ENGLISH WAS SERVED under a different language's label. Only `en` is written —
   * machine-translating safety-critical service information is exactly the failure the guide
   * is designed to avoid. A widget that ignores this flag tells a French speaker it speaks
   * French and then does not.
   */
  translated: boolean;
  availableLanguages: string[];
  translatedLanguages: string[];
  rootId: string;
  nodes: Record<string, GuideNode>;
}

export interface GuideAnswer {
  version: string;
  language: string;
  requestedLanguage: string;
  translated: boolean;
  /** False when nothing matched and the menu is being shown instead. */
  matched: boolean;
  /**
   * How the match was made, and it changes what the widget should do:
   *
   *   safety-rule  a danger keyword matched. Shown AT ONCE — making somebody confirm
   *                "did you mean: I am not safe?" before giving them a number is the wrong
   *                behaviour at the wrong moment. Never reaches the model.
   *   ai           the model chose. Must be echoed back for confirmation first.
   *   fallback     no match, the model is unconfigured, or it timed out. Show the menu.
   */
  source: 'safety-rule' | 'ai' | 'fallback';
  requiresConfirmation: boolean;
  /** The title to echo — "Did you mean: School for a child?" — or null. */
  confirmPrompt: string | null;
  node: GuideNode;
}

/**
 * The whole tree in one request.
 *
 * Deliberately not one call per screen: the widget is small enough to hold all of it, so
 * somebody on an intermittent connection can still work through the guide after the first
 * load. Cached for five minutes by the server, since the content changes only on deploy.
 */
export function fetchGuide(lang?: string) {
  return api.get<GuideTree>(`/guide${lang ? `?lang=${encodeURIComponent(lang)}` : ''}`, {
    anonymous: true,
  });
}

/**
 * Free text in, one of our screens out.
 *
 * POST rather than GET, and that is not a style choice: what somebody types here can
 * describe violence or immigration status, and a query string ends up in access logs,
 * browser history and every proxy in between.
 *
 * Rate limited server-side. Expect this to fail sometimes and fall back to the menu — the
 * endpoint reaches a metered model, and a nonprofit should not be one loop away from a bill.
 */
export function askGuide(text: string, lang?: string) {
  return api.post<GuideAnswer>('/guide/ask', { text, ...(lang ? { lang } : {}) }, {
    anonymous: true,
  });
}
