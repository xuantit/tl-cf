import { create } from 'zustand'

interface CommandPaletteState {
  open: boolean
  setOpen: (open: boolean) => void
  toggle: () => void
}

/** Lightweight global open-state so both the sidebar button and ⌘K can drive the palette. */
export const useCommandPalette = create<CommandPaletteState>((set) => ({
  open: false,
  setOpen: (open) => set({ open }),
  toggle: () => set((s) => ({ open: !s.open })),
}))
