'use client';

import { useId, useRef, useState } from 'react';
import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';

/*
 * The three tabs in the mission section, built as tabs rather than as three buttons that swap
 * a div.
 *
 * WHAT THAT ACTUALLY MEANS HERE. role="tablist" / "tab" / "tabpanel", `aria-selected` on the
 * tab and `aria-controls` pointing at its panel, and — the part almost every implementation
 * drops — ARROW-KEY NAVIGATION with a single tab stop. In a real tablist, Tab moves you INTO
 * the group and then straight out of it again; Left and Right move between the tabs, and Home
 * and End jump to the ends. That is why only the selected tab carries `tabIndex={0}` and the
 * others carry -1. Three buttons all in the tab order is the commonest way this pattern is
 * built and it is a different, worse control: it costs a keyboard user three stops to cross
 * something that should cost one.
 *
 * THE PANELS ARE MOUNTED ONE AT A TIME. All three in the DOM with two hidden would put the
 * unselected copy's ticks in front of a screen reader walking the page linearly, and this
 * section's whole job is that the three lists say different things.
 */

export interface MissionTab {
  id: string;
  /** The tab's own label. Two words at most — it has to fit three across on a phone. */
  label: string;
  /** The panel's opening line. */
  lead: string;
  /** The ticked list. Three or four; more and the panel outgrows the picture beside it. */
  points: string[];
}

interface MissionTabsProps {
  tabs: MissionTab[];
  className?: string;
}

export function MissionTabs({ tabs, className }: MissionTabsProps) {
  const base = useId();
  const [selected, setSelected] = useState(0);
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const tabId = (i: number) => `${base}-tab-${i}`;
  const panelId = (i: number) => `${base}-panel-${i}`;

  /** Move selection AND focus together — in a tablist the two are the same gesture. */
  function go(next: number) {
    const wrapped = (next + tabs.length) % tabs.length;
    setSelected(wrapped);
    tabRefs.current[wrapped]?.focus();
  }

  const panel = tabs[selected];
  if (!panel) return null;

  return (
    <div className={cn(className)}>
      <div role="tablist" aria-label="What we stand for" className="flex flex-wrap gap-2">
        {tabs.map((tab, i) => {
          const isSelected = i === selected;
          return (
            <button
              key={tab.id}
              ref={(node) => {
                tabRefs.current[i] = node;
              }}
              type="button"
              role="tab"
              id={tabId(i)}
              aria-selected={isSelected}
              aria-controls={panelId(i)}
              tabIndex={isSelected ? 0 : -1}
              onClick={() => setSelected(i)}
              onKeyDown={(event) => {
                if (event.key === 'ArrowRight') go(i + 1);
                else if (event.key === 'ArrowLeft') go(i - 1);
                else if (event.key === 'Home') go(0);
                else if (event.key === 'End') go(tabs.length - 1);
                else return;
                // Only once a key was handled: Tab and Escape have to keep their meaning.
                event.preventDefault();
              }}
              className={cn(
                'min-h-11 rounded-full px-6 text-sm font-semibold transition-colors duration-300',
                isSelected
                  ? 'bg-brand-500 text-white'
                  : 'text-muted hover:bg-ink-100 hover:text-ink-950'
              )}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      <div
        role="tabpanel"
        id={panelId(selected)}
        aria-labelledby={tabId(selected)}
        // Focusable, because a panel that is only reachable by activating its tab strands a
        // keyboard user who has arrowed past it.
        tabIndex={0}
        className="mt-7 border-t border-line pt-7"
      >
        <p className="text-base leading-7 text-muted">{panel.lead}</p>

        <ul className="mt-5 space-y-3">
          {panel.points.map((point) => (
            <li key={point} className="flex gap-3">
              {/*
               * A filled brand-blue disc, not a bare gold tick. The reference's ticks are its
               * accent colour, and ours cannot be: gold-600 on white is 2.6:1, under the 3:1
               * a meaningful icon has to clear, and gold is the one logo colour that is never
               * a glyph on a light ground. White on brand-500 is 7.3:1 — and it is the tick
               * About.tsx already draws, so the two commitment lists match.
               */}
              <span
                aria-hidden="true"
                className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-brand-500 text-white"
              >
                <Check className="size-3" strokeWidth={3} />
              </span>
              <span className="text-sm leading-6 text-body">{point}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

export default MissionTabs;
