import { Grid } from 'antd'

const { useBreakpoint } = Grid

/**
 * Returns true when the viewport is below the `md` breakpoint (< 768px).
 * Wraps AntD's Grid.useBreakpoint() for a simpler, single-boolean API.
 *
 * @example
 * const isMobile = useIsMobile()
 */
export function useIsMobile(): boolean {
  const screens = useBreakpoint()
  // `md` is undefined until measured — `screens.md === false` returns false (desktop) when unmeasured,
  // avoiding layout flash on initial paint
  return screens.md === false
}

/**
 * Returns the full AntD breakpoint map for when you need more granularity.
 *
 * @example
 * const { sm, md, lg } = useBreakpoints()
 */
export function useBreakpoints() {
  return useBreakpoint()
}
