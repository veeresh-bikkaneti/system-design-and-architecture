import { useEffect, useId, useRef, useState } from 'react';
import mermaid from 'mermaid';
import './diagrams/diagrams.css';

let initialized = false;
function ensureInitialized() {
  if (initialized) return;
  mermaid.initialize({ startOnLoad: false, theme: 'neutral', securityLevel: 'strict' });
  initialized = true;
}

export interface MermaidDiagramProps {
  code: string;
}

export function MermaidDiagram({ code }: MermaidDiagramProps) {
  const rawId = useId();
  const domId = `mermaid-${rawId.replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const containerRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [svg, setSvg] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    ensureInitialized();
    setError(null);
    setSvg(null);

    mermaid
      .render(domId, code)
      .then((result) => {
        if (cancelled) return;
        setSvg(result.svg);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : 'Failed to render diagram.');
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code, domId]);

  if (error) {
    return (
      <div className="my-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-xs dark:border-amber-800 dark:bg-amber-950/40">
        <p className="mb-1.5 font-medium text-amber-800 dark:text-amber-300">
          Couldn't render this diagram
        </p>
        <pre className="overflow-x-auto whitespace-pre-wrap text-amber-900 dark:text-amber-200">
          {code}
        </pre>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="mermaid-diagram my-2 overflow-x-auto rounded-md border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-950 [&_svg]:mx-auto [&_svg]:max-w-full"
      // eslint-disable-next-line react/no-danger
      dangerouslySetInnerHTML={{ __html: svg ?? '' }}
    />
  );
}
