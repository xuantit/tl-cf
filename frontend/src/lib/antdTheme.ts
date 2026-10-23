import { theme, type ThemeConfig } from 'antd'

export function getAppTheme(dark: boolean): ThemeConfig {
  const algorithm = dark ? theme.darkAlgorithm : theme.defaultAlgorithm
  // Keep primary fills aligned with the CSS accent palette in every state.
  const primary = {
    colorPrimary: dark ? '#f4d675' : '#946500',
    colorPrimaryHover: dark ? '#ffe5a0' : '#785100',
    colorPrimaryActive: dark ? '#dab854' : '#654400',
  }
  const onPrimary = dark ? '#202433' : '#ffffff'

  return {
    // colorPrimary is a seed token: AntD removes its alias override. Restore it
    // after deriving the palette so darkAlgorithm cannot desaturate the brand.
    algorithm: (seed, map) => ({ ...algorithm(seed, map), ...primary }),
    token: {
      ...primary,
      ...(!dark && {
        colorSuccess: '#16733e',
        colorError: '#b42335',
        colorWarning: '#885800',
        colorInfo: '#175cbd',
      }),
      colorLink: dark ? '#a9c2ff' : '#365bb5',
      borderRadius: 10,
      borderRadiusLG: 16,
      borderRadiusSM: 6,
      fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
      fontSize: 14,
      controlHeight: 36,
      colorBgLayout: dark ? '#191b24' : '#f3f4f8',
      colorBgContainer: dark ? '#212430' : '#ffffff',
      colorBgElevated: dark ? '#292d3b' : '#ffffff',
      colorBorder: dark ? '#34394a' : '#dfe3ed',
      colorSplit: dark ? '#2c3040' : '#eceef4',
      colorBorderSecondary: dark ? '#2c3040' : '#eceef4',
      colorText: dark ? '#f3f4f8' : '#202433',
      colorTextSecondary: dark ? '#c0c6d5' : '#535e74',
      colorTextTertiary: dark ? '#9da6bc' : '#68738a',
      boxShadow: 'none',
      boxShadowSecondary:
        '0 1px 1px rgba(0,0,0,0.02), 0 4px 8px -4px rgba(0,0,0,0.04), 0 16px 24px -8px rgba(0,0,0,0.06)',
    },
    components: {
      Card: { boxShadowTertiary: 'none', borderRadiusLG: 16, paddingLG: 24 },
      Modal: { borderRadiusLG: 18 },
      Drawer: { borderRadiusLG: 16 },
      Table: {
        headerBg: dark ? '#252937' : '#f8f9fc',
        headerSplitColor: 'transparent',
        headerColor: dark ? '#9da6bc' : '#68738a',
        cellPaddingBlock: 10,
        cellPaddingInline: 14,
        fontSize: 13,
        rowHoverBg: dark ? '#2b3040' : '#f0f2f8',
      },
      Menu: {
        itemBorderRadius: 10,
        itemSelectedBg: dark ? '#363126' : '#fff0c4',
        itemSelectedColor: primary.colorPrimary,
        itemMarginInline: 8,
      },
      Layout: {
        siderBg: dark ? '#151720' : '#fafbfe',
        headerBg: dark ? '#191b24' : '#f3f4f8',
      },
      Button: { fontWeight: 600, fontSize: 13, primaryColor: onPrimary },
      // Only primary-filled controls use dark ink in dark mode. Global
      // colorWhite / colorTextLightSolid must stay white for danger buttons.
      Checkbox: { colorWhite: onPrimary },
      Radio: { buttonSolidCheckedColor: onPrimary, colorWhite: onPrimary },
      Switch: { handleBg: onPrimary },
      Tabs: { horizontalMargin: '0 0 12px 0' },
      Form: { labelColor: dark ? '#f3f4f8' : '#202433', verticalLabelPadding: '0 0 6px' },
    },
  }
}