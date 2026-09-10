import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { MermaidDiagram } from './MermaidDiagram';

type Segment = { type: 'text'; value: string } | { type: 'mermaid'; value: string };

const MERMAID_FENCE = /```mermaid\n([\s\S]*?)```/g;

function splitSegments(content: string): Segment[] {
  const segments: Segment[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  MERMAID_FENCE.lastIndex = 0;
  while ((match = MERMAID_FENCE.exec(content)) !== null) {
    if (match.index > lastIndex) {
      segments.push({ type: 'text', value: content.slice(lastIndex, match.index) });
    }
    segments.push({ type: 'mermaid', value: match[1].trim() });
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < content.length) {
    segments.push({ type: 'text', value: content.slice(lastIndex) });
  }
  return segments;
}

export interface ChatMarkdownProps {
  content: string;
}

export function ChatMarkdown({ content }: ChatMarkdownProps) {
  const segments = splitSegments(content);

  return (
    <div className="space-y-2 text-sm leading-relaxed [&_a]:text-violet-600 [&_a]:underline [&_a]:underline-offset-2 dark:[&_a]:text-violet-400 [&_code]:rounded [&_code]:bg-slate-200/70 [&_code]:px-1 [&_code]:py-0.5 [&_code]:text-[0.85em] [&_code]:font-mono dark:[&_code]:bg-slate-800 [&_ol]:my-1 [&_ol]:ml-5 [&_ol]:list-decimal [&_ol]:space-y-1 [&_p]:my-1 [&_pre]:my-2 [&_pre]:overflow-x-auto [&_pre]:rounded-md [&_pre]:bg-slate-900 [&_pre]:p-2.5 [&_pre]:text-slate-100 [&_pre_code]:bg-transparent [&_pre_code]:p-0 [&_ul]:my-1 [&_ul]:ml-5 [&_ul]:list-disc [&_ul]:space-y-1">
      {segments.map((segment, i) =>
        segment.type === 'mermaid' ? (
          <MermaidDiagram key={i} code={segment.value} />
        ) : (
          <ReactMarkdown key={i} remarkPlugins={[remarkGfm]}>
            {segment.value}
          </ReactMarkdown>
        ),
      )}
    </div>
  );
}
