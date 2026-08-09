import { useEffect, useId, useRef } from 'react';
import type { ReactNode } from 'react';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';

/*
 * A modal dialog, built on the native <dialog> element.
 *
 * Native rather than a div-and-portal, because showModal() gives correct behaviour for
 * free — and every one of these is a thing hand-rolled modals get wrong:
 *
 *   - focus is trapped inside the dialog while it is open
 *   - everything behind it becomes inert, so a screen reader cannot wander into it
 *   - Escape closes it
 *   - it renders in the top layer, above any stacking context, so no z-index arms race
 *
 * What is left to do by hand is small: keep the element in step with the `open` prop,
 * make the backdrop click optional, and route the native `close` event back to React.
 *
 * On this system a modal is usually asking someone to confirm something irreversible —
 * closing a case, reversing a transaction — so it is deliberately hard to dismiss by
 * accident: the backdrop does nothing unless `dismissible` is set.
 */

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  /** Required: it names the dialog for assistive technology via aria-labelledby. */
  title: string;
  description?: string;
  children?: ReactNode;
  /** Buttons. Laid out right-aligned on desktop, stacked full-width on mobile. */
  footer?: ReactNode;
  /**
   * Allow dismissal by clicking the backdrop. Off by default — a confirmation for a
   * destructive action should not vanish because someone clicked past it.
   * Escape always works: suppressing it traps keyboard users.
   */
  dismissible?: boolean;
  className?: string;
}

export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  dismissible = false,
  className,
}: ModalProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const uid = useId();
  const titleId = `${uid}-title`;
  const descriptionId = `${uid}-description`;

  /*
   * Drive the element from the prop.
   *
   * showModal() throws if the dialog is already open, and close() on a closed dialog
   * fires a spurious `close` event — so both are guarded on the element's own state
   * rather than on the previous prop value.
   */
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;

    if (open && !dialog.open) dialog.showModal();
    else if (!open && dialog.open) dialog.close();
  }, [open]);

  /*
   * The native `close` event fires for Escape and for form[method=dialog] — paths that
   * bypass our own close button. Without this the element shuts while React still
   * believes it is open, and the next `open` prop change does nothing.
   */
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;

    const handleClose = () => onClose();
    dialog.addEventListener('close', handleClose);
    return () => dialog.removeEventListener('close', handleClose);
  }, [onClose]);

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      aria-describedby={description ? descriptionId : undefined}
      onClick={(event) => {
        if (!dismissible) return;
        // The dialog element's own box covers only the panel; clicks landing on the
        // element itself are therefore backdrop clicks. Comparing target to
        // currentTarget keeps a click inside the panel from closing it.
        if (event.target === event.currentTarget) onClose();
      }}
      className={cn(
        'w-[calc(100vw-2rem)] max-w-lg rounded-xl bg-surface p-0 text-body shadow-2xl',
        'backdrop:bg-ink-950/50',
        // The element is display:none until open; without this it stays hidden after
        // showModal() because the utility class would otherwise win.
        'open:block',
        className
      )}
    >
      <div className="flex flex-col gap-4 p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 id={titleId} className="text-lg font-semibold tracking-tight">
              {title}
            </h2>
            {description && (
              <p id={descriptionId} className="mt-1 text-sm text-muted">
                {description}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="-m-1 grid size-8 shrink-0 place-items-center rounded-md text-subtle transition-colors hover:bg-ink-100 hover:text-body"
          >
            <X className="size-4" aria-hidden="true" />
          </button>
        </div>

        {children}

        {footer && (
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">{footer}</div>
        )}
      </div>
    </dialog>
  );
}

export default Modal;
