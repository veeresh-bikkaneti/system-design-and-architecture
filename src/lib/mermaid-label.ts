/**
 * Human-readable accessible name for a mermaid diagram, derived from its
 * source. MDX authors can't pass a title through the fenced-code `pre`
 * override in App.tsx, so the diagram type is the best available name.
 * Used as the `aria-label` on the `role="img"` render region in
 * MermaidDiagram.tsx.
 */
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
  for (const [pattern, label] of DIAGRAM_TYPE_LABELS) {
    if (pattern.test(code)) return label;
  }
  return 'Diagram';
}
