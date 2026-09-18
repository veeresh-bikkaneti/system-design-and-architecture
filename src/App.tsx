import { BrowserRouter, Link, Route, Routes, useLocation } from 'react-router-dom';
import { MDXProvider } from '@mdx-js/react';
import { isValidElement, lazy, Suspense, useEffect } from 'react';
import type { ComponentPropsWithoutRef, ComponentType, ReactNode } from 'react';
import { Layout } from './components/Layout';
import { HomePage } from './pages/HomePage';
import { RoadmapPage } from './pages/RoadmapPage';
import { LessonPage } from './pages/LessonPage';
import { BadgesPage, BadgeDetailPage } from './pages/BadgesPage';
import { NotFoundPage } from './pages/NotFoundPage';
import { AppErrorBoundary } from './components/AppErrorBoundary';
import { Quiz } from './components/Quiz';
import { VideoCard } from './components/VideoCard';
import {
  slugifyHeading,
  useRegisterHeading,
} from './components/headings';

/**
 * Wrap a heavy MDX component in React.lazy + Suspense so interactive diagrams
 * ship as separate chunks instead of bloating the entry bundle. MDX pages
 * only pay for the diagrams they actually render.
 */
// oxlint-disable-next-line no-explicit-any
type AnyComponent = ComponentType<any>;
// oxlint-disable-next-line no-explicit-any
function lazyMdx(loader: () => Promise<{ default: AnyComponent }>, label: string): AnyComponent {
  const Lazy = lazy(loader);
  function LazyMdx(props: Record<string, unknown>) {
    return (
      <Suspense
        fallback={
          <div
            className="my-6 rounded-2xl border border-dashed border-stone-300 p-8 text-center text-sm text-stone-400 dark:border-stone-700 dark:text-stone-500"
            aria-hidden="true"
          >
            Loading {label}…
          </div>
        }
      >
        <Lazy {...props} />
      </Suspense>
    );
  }
  LazyMdx.displayName = `LazyMdx(${label})`;
  return LazyMdx;
}

const MermaidDiagram = lazyMdx(
  () => import('./components/MermaidDiagram').then((m) => ({ default: m.MermaidDiagram })),
  'diagram',
);
const PacketFlow = lazyMdx(
  () => import('./components/diagrams/PacketFlow').then((m) => ({ default: m.PacketFlow })),
  'packet flow',
);
const HashRingPlayground = lazyMdx(
  () =>
    import('./components/diagrams/HashRingPlayground').then((m) => ({
      default: m.HashRingPlayground,
    })),
  'hash ring playground',
);
const NapkinMathPlayground = lazyMdx(
  () =>
    import('./components/diagrams/NapkinMathPlayground').then((m) => ({
      default: m.NapkinMathPlayground,
    })),
  'napkin math playground',
);
const ScrollyDiagram = lazyMdx(
  () =>
    import('./components/diagrams/ScrollyDiagram').then((m) => ({ default: m.ScrollyDiagram })),
  'diagram',
);
const StepThrough = lazyMdx(
  () => import('./components/diagrams/StepThrough').then((m) => ({ default: m.StepThrough })),
  'step-through',
);
const VsToggle = lazyMdx(
  () => import('./components/diagrams/VsToggle').then((m) => ({ default: m.VsToggle })),
  'comparison',
);
const LoadBalancerSim = lazyMdx(
  () =>
    import('./components/diagrams/LoadBalancerSim').then((m) => ({ default: m.LoadBalancerSim })),
  'load balancer simulation',
);
const SlidingWindowSim = lazyMdx(
  () =>
    import('./components/diagrams/SlidingWindowSim').then((m) => ({ default: m.SlidingWindowSim })),
  'sliding window simulation',
);
const CacheFlow = lazyMdx(
  () => import('./components/diagrams/CacheFlow').then((m) => ({ default: m.CacheFlow })),
  'cache flow',
);
const CdnFlow = lazyMdx(
  () => import('./components/diagrams/CdnFlow').then((m) => ({ default: m.CdnFlow })),
  'CDN flow',
);

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

/**
 * MDX anchor override. Internal route links (`/lesson/<slug>`, `/roadmap`,
 * `/badges`, `/`) go through the router for client-side transitions; in-page
 * `#anchor` links and external URLs keep native behavior — React Router does
 * not scroll to hash fragments, so those must stay plain anchors.
 */
function SmartLink(props: ComponentPropsWithoutRef<'a'>) {
  const { href = '', ...rest } = props;
  const isInternalRoute = href === '/' || /^\/(lesson|roadmap|badges)(\/|$)/.test(href);
  if (isInternalRoute) {
    return <Link to={href} {...rest} />;
  }
  return <a href={href} {...rest} />;
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
  a: SmartLink,
  // Every MDX table gets a horizontal-scroll wrapper so wide tables scroll
  // instead of clipping on narrow viewports (styled by .table-scroll).
  table: (props: ComponentPropsWithoutRef<'table'>) => (
    <div className="table-scroll not-prose">
      <table {...props} />
    </div>
  ),
};

// Course Q&A agent widget (P0): server-side LangGraph agent, anonymous sessions.
// Lazy so the chat bundle never weighs down the initial page load.
const QaWidget = lazy(() =>
  import('./components/qa/QaWidget').then((m) => ({ default: m.QaWidget })),
);

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
      {/* History-API routing (GitHub Pages serves each prerendered route as a
          real static file with HTTP 200 — see scripts/seo/prerender.mjs).
          `basename` honors the Pages subpath from VITE_BASE_PATH. */}
      <BrowserRouter basename={import.meta.env.BASE_URL}>
        <ScrollToTop />
        <AppErrorBoundary>
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
        <Suspense fallback={null}>
          <QaWidget />
        </Suspense>
        </AppErrorBoundary>
      </BrowserRouter>
    </MDXProvider>
  );
}

export default App;
