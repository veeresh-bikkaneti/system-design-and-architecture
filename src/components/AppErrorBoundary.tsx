import { Component, type ReactNode } from 'react';
import { Icon } from './ui/Icon';

/**
 * Last-resort crash catcher for the whole app. A render error anywhere in the
 * route tree used to unmount React entirely and leave a blank page; this
 * boundary turns that into a friendly message with a way back instead.
 */
export class AppErrorBoundary extends Component<
  { children: ReactNode },
  { error: Error | null }
> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error) {
    // Kept in the console for debugging; never shown raw to the learner.
    console.error('Uncaught render error:', error);
  }

  private reset = () => {
    this.setState({ error: null });
  };

  render() {
    if (this.state.error) {
      return (
        <div className="mx-auto flex min-h-svh max-w-xl flex-col items-center justify-center px-4 py-16 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full border border-stone-200 bg-white shadow-soft dark:border-stone-800 dark:bg-stone-900">
            <Icon name="xCircle" className="h-7 w-7 text-stone-400 dark:text-stone-500" />
          </div>
          <h1 className="mt-6 font-display text-3xl font-semibold tracking-tight text-stone-950 dark:text-stone-50">
            Something went wrong.
          </h1>
          <p className="mx-auto mt-4 max-w-md leading-relaxed text-stone-600 dark:text-stone-400">
            This page hit an unexpected error. Your progress is saved — reloading
            usually clears it right up.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-accent-700 px-6 py-3 text-sm font-semibold text-white shadow-soft transition-colors hover:bg-accent-800 dark:bg-accent-400 dark:text-stone-950 dark:hover:bg-accent-300"
            >
              Reload the page
            </button>
            {/* Plain hash link: works even if the router itself is unhappy. */}
            <a
              href="#/"
              onClick={this.reset}
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-stone-300 bg-white px-6 py-3 text-sm font-semibold text-stone-700 shadow-soft transition-colors hover:border-accent-300 hover:text-accent-800 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-200 dark:hover:border-accent-800 dark:hover:text-accent-300"
            >
              Back to home
            </a>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
