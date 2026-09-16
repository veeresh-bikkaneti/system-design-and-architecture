import { HashRouter, Route, Routes, useLocation } from 'react-router-dom';
import { MDXProvider } from '@mdx-js/react';
import { isValidElement, useEffect } from 'react';
import type { ComponentPropsWithoutRef, ReactNode } from 'react';
import { Layout } from './components/Layout';
import { HomePage } from './pages/HomePage';
import { RoadmapPage } from './pages/RoadmapPage';
import { LessonPage } from './pages/LessonPage';
import { BadgesPage, BadgeDetailPage } from './pages/BadgesPage';
import { NotFoundPage } from './pages/NotFoundPage';
import { Quiz } from './components/Quiz';
import { VideoCard } from './components/VideoCard';
import { MermaidDiagram } from './components/MermaidDiagram';
import { PacketFlow } from './components/diagrams/PacketFlow';
import { HashRingPlayground } from './components/diagrams/HashRingPlayground';
import { NapkinMathPlayground } from './components/diagrams/NapkinMathPlayground';
import { ScrollyDiagram } from './components/diagrams/ScrollyDiagram';
import { StepThrough } from './components/diagrams/StepThrough';
import { VsToggle } from './components/diagrams/VsToggle';
import { LoadBalancerSim } from './components/diagrams/LoadBalancerSim';
import { SlidingWindowSim } from './components/diagrams/SlidingWindowSim';
import { CacheFlow } from './components/diagrams/CacheFlow';
import { CdnFlow } from './components/diagrams/CdnFlow';
import {
  slugifyHeading,
  useRegisterHeading,
} from './components/headings';

function extractText(node: ReactNode): string {
  if (typeof node === 'string') return node;
  if (typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(extractText).join('');
  if (isValidElement(node)) {
    return extractText((node.props as { children?: ReactNode }).children);
  }
  return '';
}

// Render ```mermaid fenced code blocks as diagrams; pass all other code blocks
// through to a normal <pre>. MDX turns a fence into <pre><code class="language-*">.
function Pre(props: ComponentPropsWithoutRef<'pre'>) {
  const child = props.children;
  if (isValidElement(child)) {
    const childProps = child.props as { className?: string; children?: ReactNode };
    if ((childProps.className ?? '').includes('language-mermaid')) {
      return <MermaidDiagram code={extractText(childProps.children).trim()} />;
    }
  }
  return <pre {...props} />;
}

// Every MDX `##` heading gets a stable anchor id, registers itself for the
// "On this page" rail / "In this lesson" chips, and keeps the sticky-header
// offset so anchors never hide under the top bar. Still a plain <h2>, so the
// .lesson-prose typography keeps applying.
function H2(props: ComponentPropsWithoutRef<'h2'>) {
  const register = useRegisterHeading();
  const title = extractText(props.children);
  const id = slugifyHeading(title);
  useEffect(() => {
    register({ id, title });
  }, [id, title, register]);
  return <h2 {...props} id={id} className={`${props.className ?? ''} scroll-mt-24`} />;
}

const mdxComponents = {
  Quiz,
  PacketFlow,
  HashRingPlayground,
  NapkinMathPlayground,
  ScrollyDiagram,
  StepThrough,
  VsToggle,
  LoadBalancerSim,
  SlidingWindowSim,
  CacheFlow,
  CdnFlow,
  VideoCard,
  pre: Pre,
  h2: H2,
  // Every MDX table gets a horizontal-scroll wrapper so wide tables scroll
  // instead of clipping on narrow viewports (styled by .table-scroll).
  table: (props: ComponentPropsWithoutRef<'table'>) => (
    <div className="table-scroll not-prose">
      <table {...props} />
    </div>
  ),
};

// Keep the viewport at the top when the route changes (e.g. Home -> lesson).
function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [pathname]);
  return null;
}

function App() {
  return (
    <MDXProvider components={mdxComponents}>
      <HashRouter>
        <ScrollToTop />
        <Routes>
          <Route element={<Layout />}>
            <Route index element={<HomePage />} />
            <Route path="roadmap" element={<RoadmapPage />} />
            <Route path="lesson/:slug" element={<LessonPage />} />
            <Route path="badges" element={<BadgesPage />} />
            <Route path="badges/:id" element={<BadgeDetailPage />} />
            <Route path="*" element={<NotFoundPage />} />
          </Route>
        </Routes>
      </HashRouter>
    </MDXProvider>
  );
}

export default App;
