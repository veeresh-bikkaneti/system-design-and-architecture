import { create } from 'zustand';

/**
 * Whether the course Q&A panel is open.
 *
 * QaWidget owns the state; this store only publishes it so neighbours
 * that share the bottom band (the Ko-fi bench) can yield while the panel
 * is open on a narrow viewport, where the panel covers nearly the whole
 * width and no fixed spot beside it exists. The panel itself is the
 * source of truth — this is a read model, never a second control.
 */
interface QaPanelState {
  open: boolean;
  setOpen: (open: boolean) => void;
}

export const useQaPanelStore = create<QaPanelState>((set) => ({
  open: false,
  setOpen: (open) => set({ open }),
}));
