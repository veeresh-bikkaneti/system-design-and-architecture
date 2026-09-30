import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { Icon } from './ui/Icon';
import { BadgeToastHost } from './ui/BadgeToast';
import { useDisplayStore, resolveTheme } from '../store/display';
import { AuthBar } from './AuthBar';
import { focusMainContent, useModalFocus } from '../lib/focus';

function BrandMark({ className = 'h-9 w-9' }: { className?: string }) {
  return (
    <svg viewBox="0 0 40 40" className={className} aria-hidden="true">
      <rect x="2" y="2" width="36" height="36" rx="10" className="fill-accent-600 dark:fill-accent-500" />
      <path
        d="M13 25.5 20 12l7 13.5"
        fill="none"
        stroke="white"
        strokeWidth="3.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="20" cy="29.5" r="2.2" fill="white" />
    </svg>
  );
}

function ThemeToggle() {
  const theme = useDisplayStore((state) => state.theme);
  const setTheme = useDisplayStore((state) => state.setTheme);
  const [, forceRender] = useState(0);
  useEffect(() => {
    if (theme !== 'system' || typeof window === 'undefined' || !window.matchMedia) return;
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => forceRender((n) => n + 1);
    if (typeof media.addEventListener === 'function') {
      media.addEventListener('change', onChange);
      return () => media.removeEventListener('change', onChange);
    }
    media.addListener(onChange);
    return () => media.removeListener(onChange);
  }, [theme]);
  const isDark = resolveTheme(theme) === 'dark';
  const action = isDark ? 'Switch to light mode' : 'Switch to dark mode';
  return (
    <button
      type="button"
      onClick={() => setTheme(isDark ? 'light' : 'dark')}
      aria-label={action}
      title={action}
      className="inline-flex h-10 w-10 items-center justify-center rounded-xl text-stone-600 transition-colors hover:bg-stone-200/60 hover:text-stone-950 active:bg-stone-200 dark:text-stone-300 dark:hover:bg-stone-800 dark:hover:text-stone-50 dark:active:bg-stone-700"
    >
      <Icon name={isDark ? 'sun' : 'moon'} className="h-5 w-5" />
    </button>
  );
}

export function Layout() {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const menuButtonRef = useRef<HTMLButtonElement | null>(null);
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const closeDrawer = useCallback(() => setDrawerOpen(false), []);
  // Focus into the drawer on open, back to the menu button on close,
  // Escape-to-close, and a Tab trap while open (see src/lib/focus.ts).
  useModalFocus({
    open: drawerOpen,
    dialogRef,
    returnFocusRef: menuButtonRef,
    onClose: closeDrawer,
  });

  // Lock body scroll while the drawer is open.
  useEffect(() => {
    document.body.style.overflow = drawerOpen ? 'hidden' : '';
    return () => {
      document.body.style.overflow = '';
    };
  }, [drawerOpen]);

  return (
    <div className="flex min-h-svh flex-col">
      {/* Skip link for keyboard / screen-reader users. The explicit focus()
          call is the part that moves the keyboard cursor — a bare #hash
          navigation only scrolls when the target is not natively focusable. */}
      <a
        href="#main-content"
        onClick={() => focusMainContent()}
        className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-[100] focus:rounded-xl focus:bg-accent-700 focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-white"
      >
        Skip to main content
      </a>
      <header className="sticky top-0 z-40 border-b border-stone-200/70 bg-stone-50/90 backdrop-blur-md dark:border-stone-800 dark:bg-stone-950/90">
        <div className="mx-auto flex h-16 max-w-7xl items-center gap-3 px-4 sm:px-6">
          <button
            type="button"
            ref={menuButtonRef}
            onClick={() => setDrawerOpen(true)}
            aria-label="Open course navigation"
            aria-expanded={drawerOpen}
            className="inline-flex h-10 w-10 items-center justify-center rounded-xl text-stone-600 transition-colors hover:bg-stone-200/60 hover:text-stone-950 lg:hidden dark:text-stone-300 dark:hover:bg-stone-800"
          >
            <Icon name="menu" className="h-5 w-5" />
          </button>
          <Link to="/" className="flex items-center gap-2.5 rounded-xl transition-opacity hover:opacity-90" aria-label="System Design Mastery — home">
            <BrandMark />
            <span className="font-display text-lg font-semibold tracking-tight text-stone-950 dark:text-stone-50">
              System Design Mastery
            </span>
          </Link>
          <nav aria-label="Primary" className="ml-auto flex items-center gap-1">
            <AuthBar />
            <ThemeToggle />
            <Link to="/" className="hidden rounded-xl px-3 py-2 text-sm font-medium text-stone-600 hover:bg-stone-200/60 sm:inline-flex dark:text-stone-300 dark:hover:bg-stone-800">Course</Link>
            <Link to="/badges" className="hidden rounded-xl px-3 py-2 text-sm font-medium text-stone-600 hover:bg-stone-200/60 sm:inline-flex dark:text-stone-300 dark:hover:bg-stone-800">Badges</Link>
          </nav>
        </div>
      </header>
      <div className="mx-auto flex w-full max-w-7xl flex-1">
        <aside className="hidden w-72 shrink-0 lg:block">
          <div className="sticky top-16 h-[calc(100svh-4rem)] border-r border-stone-200/70 dark:border-stone-800">
            <Sidebar />
          </div>
        </aside>
        {/* Page content. tabindex={-1} makes it a programmatic focus target
            for the skip link and SPA route changes; focus:outline-none keeps
            the programmatic focus ring off since it is not a keyboard stop. */}
        <main
          id="main-content"
          tabIndex={-1}
          className="min-w-0 flex-1 px-4 py-8 focus:outline-none sm:px-8 sm:py-10 lg:px-12"
        >
          <Outlet />
        </main>
      </div>

      {/* Mobile navigation drawer. `inert` (not just -translate-x-full)
          keeps the closed drawer out of the tab order and the accessibility
          tree, so keyboard focus can never land inside aria-hidden content. */}
      <div
        className={`fixed inset-0 z-50 lg:hidden ${drawerOpen ? '' : 'pointer-events-none'}`}
        aria-hidden={!drawerOpen}
        inert={!drawerOpen}
      >
        <div
          className={`absolute inset-0 bg-stone-950/40 transition-opacity duration-300 dark:bg-stone-950/70 ${
            drawerOpen ? 'opacity-100' : 'opacity-0'
          }`}
          onClick={closeDrawer}
        />
        <div
          ref={dialogRef}
          role="dialog"
          aria-modal="true"
          aria-label="Course navigation"
          tabIndex={-1}
          className={`absolute inset-y-0 left-0 flex w-80 max-w-[85vw] flex-col border-r border-stone-200 bg-stone-50 shadow-lift transition-transform duration-300 ease-out dark:border-stone-800 dark:bg-stone-950 ${
            drawerOpen ? 'translate-x-0' : '-translate-x-full'
          }`}
        >
          <div className="flex items-center justify-between border-b border-stone-200/70 px-4 py-3 dark:border-stone-800">
            <span className="font-display text-base font-semibold tracking-tight text-stone-950 dark:text-stone-50">
              Course contents
            </span>
            <button
              type="button"
              onClick={closeDrawer}
              aria-label="Close course navigation"
              className="inline-flex h-10 w-10 items-center justify-center rounded-xl text-stone-600 transition-colors hover:bg-stone-200/60 hover:text-stone-950 active:bg-stone-200 dark:text-stone-300 dark:hover:bg-stone-800 dark:hover:text-stone-50 dark:active:bg-stone-700"
            >
              <Icon name="x" className="h-5 w-5" />
            </button>
          </div>
          <div
            className="min-h-0 flex-1"
            // Close the drawer when the user picks a destination.
            onClick={closeDrawer}
          >
            <Sidebar />
          </div>
        </div>
      </div>
      <BadgeToastHost />
    </div>
  );
}
