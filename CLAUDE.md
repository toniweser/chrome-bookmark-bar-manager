# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Chrome Bookmark Bar Manager — a Chrome extension (Manifest V3) that lets users define multiple bookmark bar layouts ("sets") and switch between them. Built with TypeScript, React, Tailwind CSS, and Vite.

## Build & Test Commands

- `npm run build` — TypeScript check + Vite production build to `dist/`
- `npm run dev` — Vite watch mode build
- `npm run dev:preview` — Vite dev server with HMR for UI development (opens `dev.html` with mock data, no Chrome extension needed)
- `npm test` — Run tests with Vitest
- `npm run test:watch` — Run tests in watch mode

Requires Node >= 18 (`.nvmrc` specifies Node 24). Run `nvm use` before building.

## Architecture

- All bookmark set data stored as real Chrome bookmark folders under `Other Bookmarks/_BookmarkBarSets`
- `activeProject` (name string) stored in `chrome.storage.sync` for cross-machine sync
- Background service worker handles all bookmark operations via message passing
- React popup UI communicates with background via `chrome.runtime.sendMessage`

## UI Stack

- **Tailwind CSS v4** via `@tailwindcss/vite` plugin
- **Lucide React** for icons (Feather icon set)
- **Dark theme only** — colors defined as OKLCH CSS variables in `globals.css`, no light/dark toggle
- `@base-ui/react` installed for headless UI primitives
- `src/lib/utils.ts` — minimal `cn()` helper (no external deps)
- Popup width: 360px

## Key Files

- `src/shared/types.ts` — BookmarkSet interface, Message types
- `src/background/engine.ts` — Core engine: state, queue, operations (switch, reconcile, create, delete, rename)
- `src/background/index.ts` — Message listener, event handlers (service worker entry)
- `src/popup/App.tsx` — Main popup UI
- `src/popup/globals.css` — Tailwind imports, theme variables, keyframes
- `src/popup/components/` — SetList, CreateSetForm, DeleteSetDialog
- `src/popup/dev.tsx` — Dev preview entry with mock chrome API
- `src/lib/utils.ts` — `cn()` utility
- `public/manifest.json` — Chrome extension manifest

## Testing

- **Vitest** for unit tests (`vitest.config.ts` at project root)
- Tests in `src/background/__tests__/`
- `chrome.mock.ts` — In-memory Chrome API mock (bookmarks + storage)
- `engine.test.ts` — Tests for all engine operations (init, switch, create, rename, delete, merge, getSets, idMap, queue serialization)
