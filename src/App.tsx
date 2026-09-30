import { BrowserRouter, Link, Route, Routes, useLocation } from 'react-router-dom';
import { MDXProvider } from '@mdx-js/react';
import { isValidElement, lazy, Suspense, useEffect } from 'react';
import type { ComponentPropsWithoutRef, ReactNode } from 'react';
import { Layout } from './components/Layout';
import { OauthCallbackPage } from './components/AuthBar';

// Route-level code splitting: every page ships as its own chunk so the entry
// bundle only carries the app shell (router, layout, MDX provider). Pages are
// fetched on navigation instead of weighing down first paint.
const HomePage = lazy(() =>
  import('./pages/HomePage').then((m) => ({ default: m.HomePage })),
);
const RoadmapPage = lazy(() =>
  import('./pages/RoadmapPage').then((m) => ({ default: m.RoadmapPage })),
);
const LessonPage = lazy(() =>
  import('./pages/LessonPage').then((m) => ({ default: m.LessonPage })),
);
const BadgesPage = lazy(() =>
  import('./pages/BadgesPage').then((m) => ({ default: m.BadgesPage })),
);
const BadgeDetailPage = lazy(() =>
  import('./pages/BadgesPage').then((m) => ({ default: m.BadgeDetailPage })),
);
const NotFoundPage = lazy(() =>
  import('./pages/NotFoundPage').then((m) => ({ default: m.NotFoundPage })),
);
import { AppErrorBoundary } from './components/AppErrorBoundary';
import { Quiz } from './components/Quiz';
import { VideoCard } from './components/VideoCard';
import {
  slugifyHeading,
  useRegisterHeading,
} from './components/headings';
import { lazyMdx } from './components/lazyMdx';

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

function H2(props: ComponentPropsWithoutRef<'h2'>) {
  const register = useRegisterHeading();
  const title = extractText(props.children);
  const id = slugifyHeading(title);
  useEffect(() => {
    register({ id, title });
  }, [id, title, register]);
  return <h2 {...props} id={id} className={`${props.className ?? ''} scroll-mt-24`} />;
}

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
  table: (props: ComponentPropsWithoutRef<'table'>) => (
    <div className="table-scroll not-prose">
      <table {...props} />
    </div>
  ),
};

const QaWidget = lazy(() =>
  import('./components/qa/QaWidget').then((m) => ({ default: m.QaWidget })),
);

function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [pathname]);
  return null;
}

// Shown inside the layout while a lazily-loaded route chunk downloads.
function RouteLoading() {
  return (
    <div
      className="flex min-h-[50vh] items-center justify-center"
      role="status"
      aria-label="Loading page"
    >
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-stone-200 border-t-accent-500 dark:border-stone-700 dark:border-t-accent-400" />
    </div>
  );
}

function App() {
  return (
    <MDXProvider components={mdxComponents}>
      <BrowserRouter basename={import.meta.env.BASE_URL}>
        <ScrollToTop />
        <AppErrorBoundary>
          <Suspense fallback={<RouteLoading />}>
          <Routes>
          <Route element={<Layout />}>
            <Route index element={<HomePage />} />
            <Route path="roadmap" element={<RoadmapPage />} />
            <Route path="lesson/:slug" element={<LessonPage />} />
            <Route path="oauth/callback" element={<OauthCallbackPage />} />
            <Route path="badges" element={<BadgesPage />} />
            <Route path="badges/:id" element={<BadgeDetailPage />} />
            <Route path="*" element={<NotFoundPage />} />
          </Route>
        </Routes>
          </Suspense>
        <Suspense fallback={null}>
          <QaWidget />
        </Suspense>
        </AppErrorBoundary>
      </BrowserRouter>
    </MDXProvider>
  );
}

export default App;
