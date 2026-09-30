/**
 * Icon components shared by the chat widget shell and the lazily-loaded chat
 * panel. Kept dependency-free (React only) so importing them never pulls
 * the heavy chat chunk (react-markdown, the local agent, the semantic
 * layer) into the initial page load.
 */

export function ChatBubbleIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className={className}>
      <path d="M4 4h16a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H9l-5.2 3.9A.75.75 0 0 1 2.6 21.2l1.1-4.5A2 2 0 0 1 4 15.5h0V6a2 2 0 0 1 2-2Z" />
      <circle cx="9" cy="11" r="1.2" fill="rgb(255 255 255)" />
      <circle cx="12.5" cy="11" r="1.2" fill="rgb(255 255 255)" />
      <circle cx="16" cy="11" r="1.2" fill="rgb(255 255 255)" />
    </svg>
  );
}

export function CloseIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.2}
      strokeLinecap="round"
      aria-hidden="true"
      className={className}
    >
      <path d="M5 5l10 10M15 5L5 15" />
    </svg>
  );
}
