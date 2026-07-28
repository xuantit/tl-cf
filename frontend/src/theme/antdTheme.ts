import { theme } from 'antd'
import type { ThemeConfig } from 'antd'

/**
 * Build AntD ConfigProvider theme config.
 * Keeps AntD tokens aligned with our CSS custom properties so they
 * don't fight each other.  Call with `isDark` from `useThemeStore`.
 */
export function buildAntdTheme(isDark: boolean): ThemeConfig {
  return {
    algorithm: isDark ? theme.darkAlgorithm : theme.defaultAlgorithm,
    token: {
      colorPrimary: '#f6821f',
      colorLink: '#0070f3',
      colorSuccess: '#22c55e',
      colorWarning: '#f59e0b',
      colorError: '#ef4444',

      // Radius — mirrors --radius-sm/md/lg tokens
      borderRadius: 10,
      borderRadiusSM: 6,
      borderRadiusLG: 14,

      fontFamily: "Inter, ui-sans-serif, system-ui, -apple-system, sans-serif",
      fontSize: 14,

      // Touch-friendly height (overridden on mobile via nested ConfigProvider)
      controlHeight: 38,

      // Elevation: border-first
      boxShadow: '0 1px 2px rgb(0 0 0 / 0.04)',
      boxShadowSecondary: '0 8px 24px -8px rgb(0 0 0 / 0.12)',

      // Motion
      motionEaseOut: 'cubic-bezier(0.16, 1, 0.3, 1)',
      motionEaseInOut: 'cubic-bezier(0.65, 0, 0.35, 1)',
      motionDurationMid: '0.2s',
      motionDurationSlow: '0.32s',
      motionDurationFast: '0.12s',

      wireframe: false,

      // Colour overrides that match Geist palette
      colorBgLayout: isDark ? '#0a0a0a' : '#ffffff',
      colorBgContainer: isDark ? '#111111' : '#ffffff',
      colorBorderSecondary: isDark ? '#26262e' : '#eaeaea',
      colorTextSecondary: isDark ? '#a1a1aa' : '#666666',
    },
    components: {
      Card: {
        boxShadowTertiary: 'none',
        borderRadiusLG: 14,
        paddingLG: 20,
      },
      Table: {
        headerBg: 'transparent',
        headerSplitColor: 'transparent',
        headerColor: isDark ? '#a1a1aa' : '#666666',
        cellPaddingBlock: 12,
        rowHoverBg: isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)',
      },
      Button: {
        primaryShadow: 'none',
        defaultShadow: 'none',
        fontWeight: 500,
      },
      Modal: {
        borderRadiusLG: 14,
      },
      Drawer: {
        paddingLG: 20,
      },
      Tabs: {
        horizontalItemPadding: '10px 0',
        horizontalMargin: '0 0 12px 0',
      },
      Menu: {
        itemBorderRadius: 10,
        itemSelectedBg: 'rgba(246,130,31,0.12)',
        itemSelectedColor: '#f6821f',
        itemMarginInline: 8,
      },
      Layout: {
        siderBg: isDark ? '#17171c' : '#ffffff',
        headerBg: isDark ? 'rgba(23,23,28,0.8)' : 'rgba(255,255,255,0.8)',
      },
      Form: {
        labelColor: isDark ? '#e4e4e7' : '#171717',
        verticalLabelPadding: '0 0 6px',
      },
    },
  }
}

/** Mobile override: larger control height for ≥44px touch targets */
export const mobileTokenOverride: ThemeConfig = {
  token: {
    controlHeight: 44,
    fontSize: 14,
  },
}
