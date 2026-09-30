/**
 * Human-readable accessible name for a mermaid diagram, derived from its
 * source. MDX authors can't pass a title through the fenced-code `pre`
 * override in App.tsx. When the source declares its own title, that is
 * the name — "Signup flow — Flowchart" beats a bare "Flowchart". The
 * diagram type is the fallback when no title is declared.
 *
 * Matches a `title:` / `accTitle:` directive line, or gantt/pie's bare
 * `title ...` form. Requires `:` or whitespace right after the keyword so
 * a node actually named `title` (`title["..."]`) or a `%% title:` comment
 * is not mistaken for a directive.
 *
 * Used as the `aria-label` on the `role="img"` render region in
 * MermaidDiagram.tsx.
 */
const TITLE_DIRECTIVE = /^\s*(?:accTitle|title)(?:\s*:\s*|\s+)(.+?)\s*$/m;
/** gantt/pie declare the title on the diagram-type line: `pie title X`. */
const TYPE_LINE_TITLE = /^\s*(?:pie|gantt)\s+title\s+(.+?)\s*$/m;
const DIAGRAM_TYPE_LABELS: Array<[RegExp, string]> = [
  [/^\s*(flowchart|graph)\b/m, 'Flowchart'],
  [/^\s*sequenceDiagram\b/m, 'Sequence diagram'],
  [/^\s*stateDiagram(?:-v2)?\b/m, 'State diagram'],
  [/^\s*classDiagram(?:-v2)?\b/m, 'Class diagram'],
  [/^\s*erDiagram\b/m, 'Entity-relationship diagram'],
  [/^\s*gantt\b/m, 'Gantt chart'],
  [/^\s*pie\b/m, 'Pie chart'],
  [/^\s*gitGraph\b/m, 'Git history graph'],
  [/^\s*mindmap\b/m, 'Mind map'],
  [/^\s*timeline\b/m, 'Timeline'],
  [/^\s*journey\b/m, 'User journey'],
  [/^\s*quadrantChart\b/m, 'Quadrant chart'],
  [/^\s*sankey(?:-beta)?\b/m, 'Sankey diagram'],
  [/^\s*packet(?:-beta)?\b/m, 'Packet diagram'],
  [/^\s*kanban\b/m, 'Kanban board'],
  [/^\s*architecture(?:-beta)?\b/m, 'Architecture diagram'],
  [/^\s*xychart(?:-beta)?\b/m, 'XY chart'],
  [/^\s*radar(?:-beta)?\b/m, 'Radar chart'],
  [/^\s*treemap(?:-beta)?\b/m, 'Treemap'],
];

export function describeDiagram(code: string): string {
  const typeLabel = typeLabelOf(code);
  const title = TITLE_DIRECTIVE.exec(code)?.[1]?.trim() ?? TYPE_LINE_TITLE.exec(code)?.[1]?.trim();
  return title ? `${title} — ${typeLabel}` : typeLabel;
}

function typeLabelOf(code: string): string {
  for (const [pattern, label] of DIAGRAM_TYPE_LABELS) {
    if (pattern.test(code)) return label;
  }
  return 'Diagram';
}
