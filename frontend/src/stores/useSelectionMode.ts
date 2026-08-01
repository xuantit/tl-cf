import { create } from 'zustand'

/**
 * Mobile selection mode toggled from the bottom-nav "Select" tab (AppShell)
 * and consumed by the Domains page to render pickable rows + the action bar.
 */
interface SelectionModeState {
  on: boolean
  setOn: (on: boolean) => void
  toggle: () => void
}

export const useSelectionMode = create<SelectionModeState>((set) => ({
  on: false,
  setOn: (on) => set({ on }),
  toggle: () => set((s) => ({ on: !s.on })),
}))
