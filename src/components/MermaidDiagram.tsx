import { useEffect, useId, useRef, useState } from 'react';
import mermaid from 'mermaid';
import { motion } from 'motion/react';
import './diagrams/diagrams.css';
import { useDiagramEntrance } from './diagrams/useDiagramEntrance';

const MONO_STACK = '"JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';

/**
 * Semantic role class contract for lesson diagrams. Lesson authors tag
 * nodes with e.g. `OrderSvc["Order Service"]:::service` and get consistent
 * role coloring in both themes:
 *
 * - `client`   = cyan    — frontend/client apps, UI, edge devices
 * - `service`  = emerald — backend services, APIs
 * - `data`     = violet  — databases, storage
 * - `cloud`    = amber   — cloud services, infra
 * - `security` = rose    — auth, security
 *
 * Light-mode colors are set inline via classDef; dark-mode variants are
 * applied with CSS overrides in diagrams.css (mermaid themeVariables can't
 * express per-class dark variants), targeting the class names mermaid
 * copies onto the node `<g>` elements.
 */
const SEMANTIC_CLASSDEFS = [
  'classDef client fill:#ecfeff,stroke:#0891b2,stroke-width:1.5px,color:#164e63',
  'classDef service fill:#ecfdf5,stroke:#059669,stroke-width:1.5px,color:#064e3b',
  'classDef data fill:#f5f3ff,stroke:#7c3aed,stroke-width:1.5px,color:#4c1d95',
  'classDef cloud fill:#fffbeb,stroke:#d97706,stroke-width:1.5px,color:#78350f',
  'classDef security fill:#fff1f2,stroke:#e11d48,stroke-width:1.5px,color:#881337',
].join('\n');

/**
 * Inject the semantic classDef lines into flowchart/graph source. The defs
 * are inserted right after the diagram-type line (mermaid requires the type
 * keyword first). Other diagram types (sequence, etc.) don't support
 * classDef, so their code is left untouched.
 */
function withSemanticClasses(code: string): string {
  const lines = code.split('\n');
  const typeIdx = lines.findIndex((line, i) => i < 4 && /^\s*(flowchart|graph)\b/.test(line));
  if (typeIdx === -1) return code;
  return [...lines.slice(0, typeIdx + 1), SEMANTIC_CLASSDEFS, ...lines.slice(typeIdx + 1)].join(
    '\n',
  );
}

let initialized = false;
function ensureInitialized() {
  if (initialized) return;
  mermaid.initialize({
    startOnLoad: false,
    theme: 'neutral',
    securityLevel: 'strict',
    fontFamily: MONO_STACK,
    themeVariables: {
      fontFamily: MONO_STACK,
      // Warm light theme: stone surfaces, slate edges, amber-tinted accents.
      primaryColor: '#fafaf9',
      primaryBorderColor: '#a8a29e',
      primaryTextColor: '#1c1917',
      secondaryColor: '#f5f5f4',
      tertiaryColor: '#fafaf9',
      lineColor: '#78716c',
      textColor: '#44403c',
      mainBkg: '#fafaf9',
      nodeBorder: '#a8a29e',
      clusterBkg: '#f5f5f4',
      clusterBorder: '#d6d3d1',
      edgeLabelBackground: '#fafaf9',
      // Sequence diagrams
      actorBkg: '#fafaf9',
      actorBorder: '#a8a29e',
      actorTextColor: '#1c1917',
      actorLineColor: '#a8a29e',
      signalColor: '#57534e',
      signalTextColor: '#44403c',
      labelBoxBkgColor: '#fef3c7',
      labelBoxBorderColor: '#d97706',
      labelTextColor: '#78350f',
      noteBkgColor: '#fffbeb',
      noteBorderColor: '#d97706',
      noteTextColor: '#78350f',
      activationBkgColor: '#fde68a',
      activationBorderColor: '#d97706',
      loopTextColor: '#57534e',
    },
  });
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
  // Scroll-triggered entrance shared with every other diagram component
  // (PacketFlow, StepThrough, VsToggle) — see useDiagramEntrance.
  const entrance = useDiagramEntrance();

  useEffect(() => {
    let cancelled = false;
    ensureInitialized();
    setError(null);
    setSvg(null);

    mermaid
      .render(domId, withSemanticClasses(code))
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
      <div className="diagram-panel my-2 rounded-xl border border-amber-300 bg-amber-50 p-3 text-xs dark:border-amber-800 dark:bg-amber-950/40">
        <p className="mb-1.5 font-medium text-amber-800 dark:text-amber-300">
          Couldn't render this diagram
        </p>
        <pre className="overflow-x-auto whitespace-pre-wrap font-mono text-amber-900 dark:text-amber-200">
          {code}
        </pre>
      </div>
    );
  }

  // Scroll-triggered entrance, shared with every other diagram component
  // via useDiagramEntrance. The in-SVG motion (flowing edges, node
  // cascade) lives in diagrams.css.

  return (
    <motion.div
      ref={containerRef}
      className="mermaid-diagram diagram-panel my-2 overflow-x-auto rounded-xl border border-stone-200 bg-stone-50 p-4 shadow-soft dark:border-slate-800 dark:bg-slate-950 [&_svg]:mx-auto [&_svg]:max-w-full"
      {...entrance}
      // eslint-disable-next-line react/no-danger
      dangerouslySetInnerHTML={{ __html: svg ?? '' }}
    />
  );
}
