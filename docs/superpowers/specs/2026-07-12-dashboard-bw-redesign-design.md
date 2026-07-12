# Dashboard Redesign — Flat Black & White on shadcn/ui

**Date:** 2026-07-12
**Status:** Approved design, pending implementation plan

## Problem

The dashboard renders on pure-black backgrounds whenever the user's OS/browser is in
dark mode. The design system in `src/app/globals.css` defines a
`@media (prefers-color-scheme: dark)` block that sets `--canvas: #000000` and dark
surfaces, so the entire app goes black regardless of any per-component tweaks. Even in
light mode, the sidebar chrome is hardcoded near-black (`--sidebar: #0b0b0f`). The result
reads as harsh, low-contrast, and inconsistent.

The current aesthetic also leans on a "Liquid Glass" layer (translucent, blurred,
specular-highlighted panels) that the user does not want.

## Goals

1. **No black backgrounds, ever.** A fixed light theme that ignores the OS color scheme.
2. **Strictly black & white.** Monochrome only — no color accent. Neutral greys are
   permitted solely for readable hierarchy (borders, muted text, subtle surfaces).
3. **Remove the Liquid Glass optic entirely.** No translucency, no `backdrop-blur`, no
   glass tokens or utility classes. Flat surfaces with hairline borders and restrained
   shadows.
4. **Adopt a design framework: full shadcn/ui.** Rebuild the component layer on
   shadcn/ui (Radix UI primitives + Tailwind) for a consistent, accessible, professional
   system and maximum UX (keyboard nav, focus management, ARIA).
5. **Maximize UX** across every dashboard surface.

## Non-goals

- Redesigning the embeddable storefront widget (`public/widget.js`) or its behavior.
- Changing the merchant-configurable widget appearance model. `WidgetPreview.tsx`
  simulates the *merchant's* widget (which may use any color and light/dark), so it is
  **out of scope** for the B&W mandate — it is only touched to remove any dependency on
  deleted glass tokens.
- Backend, data, auth, agent runtime, or tool-contract changes.

## Stack compatibility

Verified against `package.json`: Next 16.2.10, React 19.2.4, Tailwind v4,
`lucide-react` already installed (shadcn's icon set). shadcn/ui fully supports this stack
(Tailwind v4 + React 19 + Next App Router). `init` adds `clsx` and `tailwind-merge`,
which must be reconciled with the existing `src/lib/cn.ts`.

## Design

### 1. Token system (`src/app/globals.css`) — the root fix

- **Delete the entire `@media (prefers-color-scheme: dark)` block.** This is the direct
  cause of black backgrounds. The app is light-only.
- **Delete the glass layer:** all `--glass-*` tokens, and the `.glass-panel`,
  `.glass-panel-strong`, `.glass-interactive` utility classes. Remove every
  `backdrop-blur*` / `backdrop-saturate*` usage across the app.
- **Delete the dark `--sidebar*` tokens.** The sidebar uses the standard light tokens.
- **Re-express tokens in shadcn's convention** via `@theme inline`:
  `--background`, `--foreground`, `--card`, `--card-foreground`, `--popover`,
  `--popover-foreground`, `--primary`, `--primary-foreground`, `--secondary`,
  `--secondary-foreground`, `--muted`, `--muted-foreground`, `--accent`,
  `--accent-foreground`, `--border`, `--input`, `--ring`, `--destructive`.
- **Palette — strictly monochrome:**
  - `--background`: white (`#ffffff`).
  - `--foreground` / `--primary`: near-black (`#0a0a0a`), `--primary-foreground`: white.
  - `--muted`, `--secondary`, `--border`, `--input`: a neutral-grey scale for hierarchy.
  - `--destructive`: kept as a functional red for irreversible actions (delete account).
    This is the single permitted non-monochrome hue; if the user wants it removed, it
    becomes a dark/underlined treatment instead.
- **Radius:** shadcn default (~`0.625rem`). The current `rounded-full` pill buttons and
  chips become crisp `rounded-md`/`rounded-lg` — central to the "elevated, professional"
  feel.
- **Shadows:** restrained, flat shadow scale (shadcn defaults). No inset specular
  highlights.
- **Keep** the existing global niceties re-expressed against new tokens: font stack,
  `-webkit-font-smoothing`, `:focus-visible` ring (now `--ring`), `::selection`, thin
  scrollbars.

**Backwards-compatibility shim:** pages currently use utilities like `text-ink`,
`text-muted`, `bg-surface`, `border-hairline`, `bg-accent`, `bg-accent-soft`. To keep the
change mechanical, either (a) alias the old token names to the new shadcn tokens in
`@theme inline` so existing classes keep working, or (b) sweep-replace the utilities.
**Decision: alias the old names** to new tokens for the first pass (lowest risk), then
opportunistically migrate class names as components are rewritten.

### 2. Framework install

- Run `npx shadcn@latest init` — neutral base color, CSS variables mode.
- Reconcile `cn()`: shadcn expects `src/lib/utils.ts` `cn` (clsx + tailwind-merge). Point
  shadcn's `components.json` alias at the existing `src/lib/cn.ts` (or re-export) so there
  is a single `cn`.
- Add components: `button, card, input, textarea, label, badge, dialog, alert-dialog,
  dropdown-menu, tabs, switch, tooltip, separator, skeleton, sonner, select, avatar,
  command, popover`.

### 3. Primitive migration (`src/components/ui/`)

Replace hand-rolled primitives with shadcn equivalents, **preserving the existing import
surface** where practical so page-level code changes stay minimal:

| Existing | shadcn replacement | Notes |
|---|---|---|
| `Button` / `ButtonLink` | `Button` | `ButtonLink` = `Button asChild` wrapping `next/link`. Map variants primary→default, secondary→secondary/outline, ghost→ghost, danger→destructive. Sizes sm/md/lg → shadcn sizes. |
| `Card`/`CardBody`/`CardHeader` | `Card`/`CardContent`/`CardHeader`(+`CardTitle`/`CardDescription`/`CardFooter`) | Provide thin compatibility wrappers so `CardBody` keeps working, or sweep-rename. |
| `Input` / `Textarea` | `Input` / `Textarea` | Flat, `--input` border, `--ring` focus. |
| `Field` | `Label` + field composition | Keep a `Field` wrapper composing `Label` + hint for minimal page churn. |
| `Badge` | `Badge` | Monochrome tones (default/secondary/outline/destructive). |
| `Chip` | `Badge` or `Toggle` | Remove glass. |
| `StatCard` | rebuilt on `Card` | **Monochrome** — drop the 4 hex tone colors (`#0071e3/#1f9d4d/#7856ff/#e07c00`); icon chips become grey. |
| `EmptyState` | compose with `Card` | Remove glass. |
| `Tabs` | shadcn `Tabs` (Radix) | Accessible. |
| `SegmentedControl` | `Tabs` or `ToggleGroup` | Radix. |
| `Switch` | shadcn `Switch` (Radix) | |
| `Donut` / `AreaChart` | keep SVG | Recolor to a **monochrome ink ramp** (`--foreground` at varying opacity) with `--border` gridlines. Recharts/shadcn-charts is an optional later swap, not required. |

### 4. Interactive surfaces → accessible Radix (primary UX win)

- **CommandPalette** (`_components/CommandPalette.tsx`) → shadcn `CommandDialog` (cmdk).
  Removes the `bg-black/40` custom scrim in favor of the Radix Dialog overlay.
- **Notifications** (`_components/Notifications.tsx`) → `DropdownMenu` or `Popover`.
- **TopBar avatar menu** → `DropdownMenu` + `Avatar`.
- **Delete account** (`settings/_components/DeleteAccount.tsx`) → `AlertDialog` for the
  irreversible confirm.
- **Save/success feedback** (settings, bot edit, etc.) → `Sonner` toasts.
- **Loading states** → shadcn `Skeleton`.

### 5. Layout & remaining outliers

- **Sidebar** (`(dashboard)/layout.tsx`, `_components/NavLinks.tsx`,
  `_components/SignOutButton.tsx`): solid light rail (subtle grey, distinct from white
  content), hairline right border, **no blur**. Active nav item = subtle grey surface with
  near-black text and a black indicator. Uses standard light tokens (sidebar-specific dark
  tokens deleted).
- **TopBar** (`_components/TopBar.tsx`): solid light surface, hairline bottom border, no
  blur, no glass buttons.
- **Embed-snippet `<pre>` blocks** (`bots/[id]/page.tsx:264`,
  `onboarding/page.tsx:191`): currently `bg-[#1d1d1f]` dark slabs → **light code surface**
  (grey `--muted` background, near-black mono text). No dark slab.
- **`WidgetPreview.tsx`**: functionally intact (see Non-goals). Only remove any reliance
  on deleted glass tokens/utilities; its local `LIGHT_VARS`/`DARK_VARS` maps stay since
  they represent the storefront widget, not dashboard chrome.

### 6. Accessibility / UX enhancements ("maximum UX")

- Radix-provided focus management, keyboard navigation, escape-to-close, ARIA roles.
- Consistent visible focus ring via `--ring` across all interactive elements.
- Toasts for async feedback; AlertDialog for destructive confirms.
- Skeletons for loading; proper empty states.
- Respect `prefers-reduced-motion` for transitions.

## Testing

Per CLAUDE.md (test-driven development):

- **Behavior-carrying components** get Vitest tests written first: Dialog/DropdownMenu
  open & close, CommandDialog filtering, AlertDialog confirm/cancel wiring, form submit
  handlers (settings password update, bot save), Switch/Tabs state.
- **Pure restyle / token changes** have no meaningful unit assertion; they are verified
  via `npx tsc --noEmit`, `npm run lint`, `npm run build`, and browser verification:
  before/after screenshots of every dashboard page, **including with the OS/browser forced
  to dark mode** to prove no black backgrounds leak through.
- Existing tests must stay green.

## Workflow

Developed on a dedicated feature branch in its own `git worktree` per CLAUDE.md
(`git worktree add ../merclo-bw-redesign -b feature/bw-redesign`), with frequent small
commits. Note: `main` currently carries uncommitted WIP in `NavLinks.tsx`, `layout.tsx`,
and `globals.css` (a partial light-sidebar attempt); the redesign rewrites these files, so
that WIP is superseded and can be discarded — confirm with the user before discarding.

## Risks

- **Large change surface.** Nearly every dashboard file is touched. Mitigated by the token
  alias shim (keeps existing utility classes working) and by preserving primitive import
  names, making most page edits mechanical.
- **shadcn + Tailwind v4 init** may reorganize `globals.css` structure; the hand-authored
  tokens must be merged carefully rather than overwritten.
- **`cn()` duplication** between `src/lib/cn.ts` and shadcn's expected `utils.ts` — must be
  unified to avoid two `cn` implementations.
- **Chart recoloring** to monochrome may reduce series distinguishability; acceptable given
  the strict B&W mandate (rely on labels/patterns if needed).
