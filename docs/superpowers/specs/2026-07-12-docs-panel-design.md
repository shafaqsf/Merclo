# Docs / Guide panel — design

**Date:** 2026-07-12
**Branch:** `feature/docs-panel`

## Goal

Add a documentation panel to the dashboard that explains, in merchant-friendly
language, how Merclo works and the concrete steps required to get a live,
running bot.

## Scope decisions (from brainstorming)

- **Content:** both a "How it works" explainer and a "Steps to a running bot"
  guide, on one page.
- **Placement:** new sidebar nav item ("Docs"), route `/dashboard/docs`.
  Positioned directly after "Overview" so new merchants find it early.
- **Depth:** merchant-focused. Plain language about what the bot does and what
  the merchant configures. No server/client tool-execution internals.
- **Interactivity:** static instructions with links to the relevant dashboard
  pages. No per-bot data fetching, no completion detection.

## Architecture

Static React Server Component — no data access, no client state.

- `src/lib/docs.ts` — pure, testable content data:
  - `HOW_IT_WORKS`: array of `{ title, description }` explainer cards.
  - `SETUP_STEPS`: array of `{ title, description, href, cta }` numbered steps.
  All `href`s are internal dashboard routes (start with `/dashboard`).
- `src/lib/docs.test.ts` — unit tests over the data (non-empty, internal hrefs,
  unique/ordered). This is the TDD-testable surface since the test env is
  `node` (no jsdom/testing-library for component rendering).
- `src/app/(dashboard)/dashboard/docs/page.tsx` — server component rendering
  the data with existing `ui/` primitives (`Card`/`CardBody`, `ButtonLink`)
  and design tokens only (no `dark:`, no raw palettes).
- `src/app/(dashboard)/_components/NavLinks.tsx` — add a `"docs"` entry to
  `LINKS` (after Overview) and a `docs` case with a book/guide icon to the
  `Icon` switch + `IconName` union.

## Page layout

1. Header — "How Merclo works" + one-line intro.
2. "How it works" — 3 explainer cards from `HOW_IT_WORKS`:
   - Your shopper chats
   - The bot acts in your store
   - You stay in control
3. "Steps to a running bot" — numbered vertical list from `SETUP_STEPS`, each
   row: step number, title, description, `ButtonLink` to the relevant page.
   Because the page is static (no bot id), per-bot steps link to the Bots list.
4. Footer callout — card linking to the interactive onboarding wizard
   (`/dashboard/onboarding`) for a guided first run.

## Testing

- `docs.test.ts`: assert `HOW_IT_WORKS` and `SETUP_STEPS` are non-empty, every
  step `href` is an internal `/dashboard` route, titles/descriptions non-empty,
  and CTAs present.

## Out of scope

- Live per-bot status / checkmarks / real embed snippet (that lives on the
  onboarding wizard and per-bot install screen).
- Architecture / "under the hood" internals.
