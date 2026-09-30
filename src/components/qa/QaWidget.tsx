import { Suspense, lazy, useState } from 'react';
import { ChatBubbleIcon, CloseIcon } from './ChatWidgetIcons';

/**
 * The course Q&A widget, split for initial-load performance.
 *
 * This module is the thin shell: the floating open/close button and the
 * open/mounted state. It ships with the initial page load (~2 KB) and has
 * no heavy dependencies.
 *
 * The heavy chat panel (react-markdown's micromark stack, the local agent,
 * the semantic understanding layer) lives in ./QaChatPanel and is
 * dynamically imported only on the first open, inside its own Suspense
 * boundary. Once opened, the panel stays mounted (hidden) so the
 * transcript, input, and model state survive a close/reopen cycle.
 */
const QaChatPanel = lazy(() =>
  import('./QaChatPanel').then((m) => ({ default: m.QaChatPanel })),
);

export function QaWidget() {
  const [open, setOpen] = useState(false);
  // Mount the panel lazily on the first open and never unmount it, so a
  // close/reopen cycle keeps the transcript and composer state.
  const [panelMounted, setPanelMounted] = useState(false);

  function toggle() {
    setPanelMounted(true);
    setOpen((v) => !v);
  }

  return (
    <>
      <button
        type="button"
        onClick={toggle}
        aria-label={open ? 'Close course Q&A' : 'Open course Q&A'}
        aria-expanded={open}
        className="fixed bottom-5 right-5 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-amber-600 text-white shadow-[0_8px_24px_rgb(180_83_9/0.45)] transition-[transform,background-color,box-shadow] hover:-translate-y-0.5 hover:bg-amber-700 hover:shadow-[0_12px_28px_rgb(180_83_9/0.5)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-2 active:translate-y-0"
      >
        {open ? <CloseIcon className="h-6 w-6" /> : <ChatBubbleIcon className="h-7 w-7" />}
      </button>

      {panelMounted && (
        <Suspense fallback={null}>
          <QaChatPanel open={open} onClose={() => setOpen(false)} />
        </Suspense>
      )}
    </>
  );
}
