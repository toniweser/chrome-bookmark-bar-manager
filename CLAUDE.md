# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Chrome Bookmark Bar Manager — a Chrome extension (Manifest V3) that lets users define multiple bookmark bar layouts ("sets") and switch between them. Built with TypeScript, React, and Vite.

## Build Commands

- `npm run build` — TypeScript check + Vite production build to `dist/`
- `npm run dev` — Vite watch mode build

Requires Node >= 18 (`.nvmrc` specifies Node 24). Run `nvm use` before building.

## Architecture

- All bookmark set data stored as real Chrome bookmark folders under `Other Bookmarks/_BookmarkBarSets`
- Only `activeSetId` stored in `chrome.storage.local`
- Background service worker handles all bookmark operations via message passing
- React popup UI communicates with background via `chrome.runtime.sendMessage`

## Key Files

- `src/shared/types.ts` — BookmarkSet interface, Message types
- `src/background/bookmarks.ts` — Core bookmark CRUD operations
- `src/background/index.ts` — Message listener (service worker entry)
- `src/popup/App.tsx` — Main popup UI
- `src/popup/components/` — SetList, CreateSetForm components
- `public/manifest.json` — Chrome extension manifest
