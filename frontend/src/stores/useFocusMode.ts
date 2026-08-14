import { create } from 'zustand'

/**
 * Chế độ focus của trang chi tiết domain: khi bật, sidebar chính của AppShell
 * thu lại (w-0) để FunctionRail chiếm mép trái màn hình như mockup.
 */
interface FocusModeState {
  active: boolean
  setActive: (active: boolean) => void
}

export const useFocusMode = create<FocusModeState>((set) => ({
  active: false,
  setActive: (active) => set({ active }),
}))
