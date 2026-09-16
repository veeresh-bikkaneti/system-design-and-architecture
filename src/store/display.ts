import { create } from 'zustand';
import { persist } from 'zustand/middleware';

/**
 * Display preferences: color theme + ambient-motion budget.
 *
 * Theme is `light` / `dark` / `system` (system follows the OS, matching the
 * site's original behavior). `calmMotion` freezes infinite ambient loops
 * (Mermaid dash-flow, PacketFlow dots, step-through glow) via the
 * `data-motion="calm"` attribute on <html>; one-shot entrances and
 * transitions keep working.
 */

export type ThemePreference = 'light' | 'dark' | 'system';

export type ResolvedTheme = 'light' | 'dark';

export function resolveTheme(preference: ThemePreference): ResolvedTheme {
  if (preference !== 'system') return preference;
  if (typeof window !== 'undefined' && window.matchMedia) {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  return 'light';
}

/** Applies the current display state to <html>. Called on boot (also by the
 * inline script in index.html to avoid a first-paint flash), on every store
 * change, and when the OS color scheme changes while theme === 'system'. */
export function applyDisplay(preference: ThemePreference, calmMotion: boolean): void {
  if (typeof document === 'undefined') return;
  const resolved = resolveTheme(preference);
  document.documentElement.classList.toggle('dark', resolved === 'dark');
  document.documentElement.style.colorScheme = resolved;
  if (calmMotion) {
    document.documentElement.setAttribute('data-motion', 'calm');
  } else {
    document.documentElement.removeAttribute('data-motion');
  }
}

export interface DisplayState {
  theme: ThemePreference;
  calmMotion: boolean;
  setTheme: (theme: ThemePreference) => void;
  /** Legacy 3-state cycle (light -> dark -> system); the header button no
   * longer uses it — it toggles explicitly light/dark instead — but it is
   * kept so any programmatic callers keep working. */
  cycleTheme: () => void;
  setCalmMotion: (calmMotion: boolean) => void;
  resolvedTheme: () => ResolvedTheme;
}

const THEME_ORDER: ThemePreference[] = ['light', 'dark', 'system'];

export const useDisplayStore = create<DisplayState>()(
  persist(
    (set, get) => ({
      theme: 'system',
      calmMotion: false,

      setTheme: (theme) => set({ theme }),
      cycleTheme: () =>
        set((state) => ({
          theme: THEME_ORDER[(THEME_ORDER.indexOf(state.theme) + 1) % THEME_ORDER.length],
        })),
      setCalmMotion: (calmMotion) => set({ calmMotion }),
      resolvedTheme: () => resolveTheme(get().theme),
    }),
    {
      name: 'sdm-display',
    },
  ),
);

// Apply on boot and on every change (including rehydration from storage).
applyDisplay(useDisplayStore.getState().theme, useDisplayStore.getState().calmMotion);
useDisplayStore.subscribe((state) => applyDisplay(state.theme, state.calmMotion));

// When following the OS, react to OS changes live.
if (typeof window !== 'undefined' && window.matchMedia) {
  const media = window.matchMedia('(prefers-color-scheme: dark)');
  const onChange = () => {
    const { theme, calmMotion } = useDisplayStore.getState();
    if (theme === 'system') applyDisplay(theme, calmMotion);
  };
  if (typeof media.addEventListener === 'function') {
    media.addEventListener('change', onChange);
  } else {
    media.addListener(onChange);
  }
}
