import { HashRouter, Route, Routes } from 'react-router-dom';
import { MDXProvider } from '@mdx-js/react';
import { Layout } from './components/Layout';
import { HomePage } from './pages/HomePage';
import { LessonPage } from './pages/LessonPage';
import { Quiz } from './components/Quiz';

const mdxComponents = { Quiz };

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
