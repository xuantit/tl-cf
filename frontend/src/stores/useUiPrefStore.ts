import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type TableDensity = 'compact' | 'comfortable' | 'spacious'

interface UiPrefState {
  /** Table row density — applied as a body class, tables pick it up via CSS. */
  density: TableDensity
  /** When false, destructive confirms skip the type-to-confirm input. */
  confirmDanger: boolean
  setDensity: (density: TableDensity) => void
  setConfirmDanger: (confirmDanger: boolean) => void
}

export const useUiPrefStore = create<UiPrefState>()(
  persist(
    (set) => ({
      density: 'compact',
      confirmDanger: true,
      setDensity: (density) => set({ density }),
      setConfirmDanger: (confirmDanger) => set({ confirmDanger }),
    }),
    { name: 'ui-prefs' },
  ),
)
