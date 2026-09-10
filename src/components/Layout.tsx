import { Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar';

export function Layout() {
  return (
    <div className="mx-auto flex min-h-svh max-w-6xl">
      <aside className="hidden w-64 shrink-0 border-r border-slate-200 dark:border-slate-800 md:block">
        <div className="sticky top-0 h-svh">
          <Sidebar />
        </div>
      </aside>
      <main className="min-w-0 flex-1 px-6 py-8 md:px-10">
        <Outlet />
      </main>
    </div>
  );
}
