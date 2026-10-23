# CF Tool — workspace UI refresh

Date: 2026-10-03. Target confirmed by the user: **CF Tool**, not HomeVietPro.
Reference: https://www.rophim.soy/phimhay (initial www request returned 404;
opening the non-www URL subsequently loaded the reference).

## Design

- Adopted the reference's dark navy surfaces, warm gold accents, prominent search,
  hero hierarchy and grouped discovery cards. No copied logos, movie artwork,
  text, scripts, video, or external asset dependencies.
- Original cloud/orbit illustration in CSS. The domain-list landing screen has
  direct shortcuts to Templates, Workers/Pages, Tunnels and Turnstile.
- Retained the desktop sidebar and inline tools dropdown because this is an
  administration tool, not a media catalogue. No carousel, autoplay or fake metrics.
- Search and account switcher are available in the common top bar on mobile too.
- Larger headings, rounded tables and overview statistics cards; existing density
  preferences, focus-mode rails, push panels, routes and operations are preserved.
- New visitors default to dark; saved light/dark preferences are respected.
  Light mode uses darker gold for readable controls. Vietnamese translations included.
- Keyboard focus, skip link, hidden/inert collapsed sidebar, reduced-motion styles,
  named search/filter/account controls and responsive mobile filter layout.

## Validation at UI refresh (2026-10-03)

- UI tests: **23/23 passed** (AppShell, CommandPalette, Overview).
- Full suite: **185 passed / 9 failed**; baseline before any UI edits was
  **183 passed / the same 9 failed**. Existing failures are four copy/clone tests,
  four Domains tests and one Users role-label test. They were not suppressed.
- TypeScript: the same existing `RulesTab` error remains: its `onDelete` prop is not
  accepted by the independently modified PageRuleFormModal component. No new TS errors.
- Changed shared UI files pass ESLint. Existing locale duplicate keys predate this
  change; added keys are unique.
- Vite bundle succeeds in a **separate ignored staging directory**, not the live
  frontend output. This is not a successful full typechecked production build.
- Browser checked at 320, 390, 768 and 1440px: no viewport/main horizontal overflow;
  domain search remains usable. Tested dark/light toggle, Vietnamese copy, palette
  search + Escape, mobile tools disclosure, domain hub and DNS focus mode (read-only).
- Local backend intermittently returns 500/502 during read requests; this UI change
  does not alter backend retry behavior, credentials or Cloudflare configuration.

## Error fixes verified (2026-10-04)

- Frontend **219/219 tests passed**; backend **374/374 tests passed** using isolated
  PGlite and mocked provider requests, not the shared Supabase database.
- Full frontend ESLint and TypeScript project build pass. Backend TypeScript build
  passes. Vite bundle and both compiler outputs were staged under each package's
  ignored cache directory, not the production output folders. Editor diagnostics clear.
- Restored Domains status tabs/URL filters, copy/clone panels, per-zone tag assignment
  with partial-failure retries, and typed destructive confirmation. Removed duplicate
  sibling panel keys; closed panels are inert to keyboard interaction.
- Restored Page Rule's pure form contract inside the push panel, including its delete
  callback, preset validation, nested action values and priority preservation.
- Users role tests now validate the existing editable role selectors, backend enum
  payload and self-role protection instead of expecting a removed lowercase tag.
- Removed 50 redundant Vietnamese entries, retaining every key's effective last value;
  fixed explicit-any error handlers without disabling lint/type rules.
- Restored missing Cloudflare service methods used by Analytics, Access Rules,
  Turnstile, Tunnels, Workers and Pages. Restored copy/clone API routes with owned active
  account checks, zone identity preflight, bounded input, source-account cloning and
  non-replayed additive jobs. Partial copies remain non-transactional and are reported.
- Restored response-only automatic tags. Fixed admin-only config export route ordering
  and compatibility alias, default secret redaction and no-store response.
- Clone results now include the name/status/nameServers fields required by the shared
  completion table and CSV export, with regression coverage on both sides.
- Browser verified copy panel and Page Rule create form (no nested modal, no horizontal
  overflow); cancelled without submitting writes. Test mutations use mocks only.
- jsdom still prints its unsupported pseudo-element measurement warning from AntD;
  this is a test-environment limitation, not a failing assertion or compiler error.

## Release status

UI refresh and error fixes were deployed on 2026-10-04 from user commit
`bdeb68d2bc2d90cf8e5d918644cdfb876b478e40` to https://cf.mmthui.xyz.

## Light/dark follow-up — 2026-10-05 (deployed)

- Confirmed production switching/persistence worked, but the hero stayed dark in
  light mode, status badges/auth/bulk primary colors were inconsistent, and the
  Turnstile widget followed the OS instead of the application's selected theme.
- Added real light hero/art colors, semantic status tints and contrast-aware primary
  labels. AntD's resolved primary now matches CSS gold rather than desaturating it.
  Checked controls use dark marks on gold; danger retains its own text alias.
- Theme initialization runs before the app paints; root/body classes and native
  color-scheme stay synchronized. Handles blocked/corrupt storage and changes in
  other tabs. Persisted user choice still overrides the default.
- Shared toggle is available on login/signup as well as the app header. CAPTCHA
  remounts with explicit light/dark and invalidates the old token on theme changes.
- Reduced-motion disables animation/transition rather than creating tiny transitions
  on every element; no appearance/behavior changes were applied to production.
- **275/275 frontend tests pass**, full lint/typecheck and separate Vite staging
  build pass. Added tests for resolved color contrast, status/hero contrast, theme
  storage/first paint/tab synchronization, and CAPTCHA token lifecycle.
- Browser checked both modes and popup portal colors, dark/light after reload, and
  mobile390px without overflow. Primary contrast measured 5.10:1 light / 10.81:1 dark;
  search/table header samples above4.5:1. This is not an audit of every UI element.
- Local embedded tab was hidden and its transitions did not advance; checked stable
  colors with reduced motion enabled instead of mistaking frozen animation for bad tokens.
- Deployed the theme fixes to **https://cf.mmthui.xyz/** on explicit user request.
  Frontend-only release, built with production `/api`; 275 tests, lint and typecheck
  rechecked successfully. Source remains uncommitted; no Git commit/push performed.
- Verified five public routes return200 DYNAMIC, current asset manifest and seven
  resource hashes match (including the pre-paint theme script). Browser confirms
  light/dark palettes and saved theme after reload; restored the user's light choice.
- Only cf-frontend restarted. Backend, tunnel, auto-deploy watcher and unrelated apps
  unchanged. Previous frontend artifacts and source snapshot retained outside the repo
  under the local release backup `20261005-015819-light-dark`. No WAF/DNS changes.