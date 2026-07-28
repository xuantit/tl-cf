# UI Primitives — `components/ui/`

Design system primitives for the Cloudflare Automation Tool frontend.  
Design direction: **Linear × Vercel × Cloudflare** — flat, low-contrast borders, minimal shadows, mobile-first.

> **PR 2/3/4 — import from here.**  
> Stable API. All components are TypeScript with exported prop types.

---

## Token Reference

Tokens are defined in `src/index.css` `@theme` block and available as CSS custom properties:

| Token | Value | Usage |
|---|---|---|
| `--radius-sm` | `6px` | Small controls (inputs, badges) |
| `--radius-md` | `10px` | Cards, modals (AntD `borderRadius`) |
| `--radius-lg` | `14px` | Large modals, drawers |
| `--text-2xs` | `11px` | Labels, tags |
| `--text-xs` | `12px` | Meta, table headers |
| `--text-sm` | `13px` | Secondary text |
| `--text-base` | `14px` | Body text |
| `--text-lg` | `16px` | Subheadings |
| `--text-xl` | `20px` | Section headings |
| `--text-2xl` | `26px` | Page titles |
| `--shadow-card` | `0 1px 2px rgb(0 0 0 / 0.04)` | Card elevation |
| `--shadow-pop` | `0 8px 24px -8px rgb(0 0 0 / 0.12)` | Popover/dropdown elevation |
| `--ease-out` | `cubic-bezier(0.16, 1, 0.3, 1)` | Signature easing |
| `--ease-in-out` | `cubic-bezier(0.65, 0, 0.35, 1)` | Shared easing |
| `--dur-fast` | `120ms` | Micro interactions |
| `--dur-base` | `200ms` | Standard transitions |
| `--dur-slow` | `320ms` | Page transitions |
| `--color-success` | `#22c55e` | Success/active state |
| `--color-warning` | `#f59e0b` | Warning/pending state |
| `--color-danger` | `#ef4444` | Error/danger state |
| `--color-hover` | `rgba(0,0,0,0.03)` | Light hover background |
| `--color-hover-dark` | `rgba(255,255,255,0.04)` | Dark hover background |

---

## Motion Classes

| Class | Keyframe | Duration |
|---|---|---|
| `.fade-in` | opacity + `translateY(6px)` | `--dur-base` |
| `.slide-up` | opacity + `translateY(16px)` | `--dur-base` |
| `.scale-in` | opacity + `scale(0.96)` | `--dur-fast` |
| `.stagger-item` | fade-in + `--i * 20ms` delay | `--dur-base` |

Set `--i` CSS custom property on each item for stagger:
```html
<div class="stagger-item" style="--i: 0">Row 1</div>
<div class="stagger-item" style="--i: 1">Row 2</div>
```

All motion is disabled when `prefers-reduced-motion: reduce` is active.

---

## Components

### `PageShell`

Top-level page container. Provides responsive padding and max-width.

```tsx
import { PageShell } from '@/components/ui'

<PageShell>
  <PageHeader title="Domains" />
  ...
</PageShell>
```

**Props:**

| Prop | Type | Default | Description |
|---|---|---|---|
| `children` | `ReactNode` | — | Page content |
| `className` | `string` | `''` | Extra Tailwind classes |

---

### `PageHeader`

Page heading with optional breadcrumb and actions slot. Backward-compatible with the previous `PageHeader` component (`title`, `description`, `actions`).

```tsx
import { PageHeader } from '@/components/ui'
import { Breadcrumb, Button } from 'antd'

<PageHeader
  breadcrumb={
    <Breadcrumb items={[{ title: 'Home' }, { title: 'Domains' }]} />
  }
  title="Domains"
  subtitle="Manage your Cloudflare zones"
  actions={<Button type="primary">Add Domain</Button>}
/>
```

**Props:**

| Prop | Type | Description |
|---|---|---|
| `title` | `ReactNode` | Page title (required) |
| `subtitle` | `ReactNode` | Supporting text |
| `description` | `ReactNode` | @deprecated alias for `subtitle` |
| `breadcrumb` | `ReactNode` | Breadcrumb rendered above title |
| `actions` | `ReactNode` | Right-aligned actions |
| `className` | `string` | Extra Tailwind classes |

---

### `ResponsiveTable` ⭐

Renders an AntD `<Table>` on `md+` and a card list on mobile. The most impactful primitive for mobile UX.

```tsx
import { ResponsiveTable } from '@/components/ui'
import type { ColumnsType } from 'antd/es/table'

const columns: ColumnsType<Domain> = [
  { dataIndex: 'name', title: 'Name' },
  { dataIndex: 'status', title: 'Status' },
]

<ResponsiveTable
  columns={columns}
  dataSource={domains}
  rowKey="id"
  loading={isLoading}
  mobile={{
    title: (row) => row.name,
    subtitle: (row) => row.status,
    meta: (row) => <StatusDot status={row.active ? 'active' : 'paused'} />,
    actions: (row) => <RowActions domain={row} />,
  }}
/>
```

**Props:**

| Prop | Type | Default | Description |
|---|---|---|---|
| `columns` | `ColumnsType<T>` | — | AntD column definitions |
| `dataSource` | `T[]` | — | Table data |
| `rowKey` | `string \| Function` | `'id'` | Row key |
| `loading` | `boolean` | `false` | Show loading skeleton |
| `mobile` | `MobileCardConfig<T>` | — | Mobile card render config |
| `emptyText` | `ReactNode` | — | Custom empty state text |
| `emptyIcon` | `ReactNode` | — | Custom empty state icon |
| `className` | `string` | `''` | Extra Tailwind classes |
| `tableProps` | `TableProps<T>` | — | Extra props for AntD Table (desktop) |

**`MobileCardConfig<T>`:**

| Key | Type | Description |
|---|---|---|
| `title` | `(record: T) => ReactNode` | Primary card line |
| `subtitle?` | `(record: T) => ReactNode` | Secondary line |
| `meta?` | `(record: T) => ReactNode` | Additional metadata |
| `actions?` | `(record: T) => ReactNode` | Overflow menu content |

---

### `StatCard`

Metric card with icon chip, label, value, and optional delta indicator.

```tsx
import { StatCard } from '@/components/ui'
import { GlobalOutlined } from '@ant-design/icons'

<StatCard
  icon={<GlobalOutlined />}
  label="Total Domains"
  value={42}
  delta={{ value: '+3 this week', direction: 'up' }}
  color="#f6821f"
/>
```

**Props:**

| Prop | Type | Default | Description |
|---|---|---|---|
| `icon` | `ReactNode` | — | Icon inside the chip |
| `label` | `ReactNode` | — | Metric label |
| `value` | `ReactNode` | — | Metric value |
| `delta.value` | `ReactNode` | — | Delta label |
| `delta.direction` | `'up' \| 'down' \| 'neutral'` | — | Arrow direction |
| `color` | `string` | `'#f6821f'` | Icon chip accent colour |
| `className` | `string` | `''` | Extra Tailwind classes |

---

### `EmptyState`

Empty content placeholder with icon, heading, description, and CTA.

```tsx
import { EmptyState } from '@/components/ui'
import { InboxOutlined } from '@ant-design/icons'

<EmptyState
  icon={<InboxOutlined />}
  title="No domains yet"
  description="Add your first Cloudflare zone to get started."
  actionLabel="Add Domain"
  onAction={() => setOpen(true)}
/>
```

**Props:**

| Prop | Type | Description |
|---|---|---|
| `icon` | `ReactNode` | Decorative icon |
| `title` | `ReactNode` | Main heading |
| `description` | `ReactNode` | Supporting text |
| `action` | `ReactNode` | Custom CTA node (overrides `actionLabel`) |
| `actionLabel` | `string` | Default CTA button label |
| `onAction` | `() => void` | Default CTA click handler |
| `className` | `string` | Extra Tailwind classes |

---

### `Section`

Content group with a small uppercase heading and thin divider.

```tsx
import { Section } from '@/components/ui'

<Section heading="DNS Records">
  <RecordsList />
</Section>
```

**Props:**

| Prop | Type | Description |
|---|---|---|
| `heading` | `ReactNode` | Small uppercase section label |
| `children` | `ReactNode` | Section content |
| `className` | `string` | Extra Tailwind classes |

---

### `StatusDot`

Coloured dot indicator for active/pending/paused/error/inactive states.

```tsx
import { StatusDot } from '@/components/ui'

<StatusDot status="active" label="Active" />
<StatusDot status="error" />
```

**Props:**

| Prop | Type | Description |
|---|---|---|
| `status` | `'active' \| 'pending' \| 'paused' \| 'error' \| 'inactive'` | Variant |
| `label` | `ReactNode` | Optional text label |
| `className` | `string` | Extra Tailwind classes |

---

### `ResponsiveModal`

Modal on desktop, bottom-sheet Drawer on mobile. Drop-in replacement for AntD `<Modal>`.

```tsx
import { ResponsiveModal } from '@/components/ui'

<ResponsiveModal
  open={open}
  title="Edit Domain"
  onCancel={() => setOpen(false)}
  footer={null}
>
  <DomainForm />
</ResponsiveModal>
```

**Props** (extends AntD `ModalProps`):

| Prop | Type | Description |
|---|---|---|
| `open` | `boolean` | Visibility |
| `title` | `ReactNode` | Header title |
| `onCancel` | `() => void` | Close callback |
| `footer` | `ReactNode \| null` | Footer (Modal only) |
| `drawerHeight` | `number \| string` | Mobile Drawer height |
| `children` | `ReactNode` | Content |

---

### `Skeletons`

Loading state skeletons that reduce layout shift compared to full-page `<Spin>`.

```tsx
import { SkeletonTable, SkeletonCards, SkeletonPage } from '@/components/ui'

// While fetching table data
<SkeletonTable rows={5} columns={4} />

// While fetching stat cards
<SkeletonCards count={4} />

// Full page initial load
<SkeletonPage />
```

---

## Hooks

### `useIsMobile`

```ts
import { useIsMobile, useBreakpoints } from '@/hooks/useIsMobile'

// Simple boolean
const isMobile = useIsMobile()

// Full breakpoint map
const { sm, md, lg, xl } = useBreakpoints()
```

Returns `true` when the viewport is below the `md` breakpoint (< 768px).

---

## AntD Theme Bridge

`src/theme/antdTheme.ts` exports `buildAntdTheme(isDark)` which is wired into `ConfigProvider` in `main.tsx`. Do not duplicate token values — edit the theme file instead.
