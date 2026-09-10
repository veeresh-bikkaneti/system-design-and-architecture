import { HashRouter, Route, Routes } from 'react-router-dom';
import { MDXProvider } from '@mdx-js/react';
import { isValidElement } from 'react';
import type { ComponentPropsWithoutRef, ReactNode } from 'react';
import { Layout } from './components/Layout';
import { HomePage } from './pages/HomePage';
import { LessonPage } from './pages/LessonPage';
import { Quiz } from './components/Quiz';
import { MermaidDiagram } from './components/MermaidDiagram';

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

const mdxComponents = { Quiz, pre: Pre };

function App() {
  return (
    <MDXProvider components={mdxComponents}>
      <HashRouter>
        <Routes>
          <Route element={<Layout />}>
            <Route index element={<HomePage />} />
            <Route path="lesson/:slug" element={<LessonPage />} />
          </Route>
        </Routes>
      </HashRouter>
    </MDXProvider>
  );
}

export default App;
