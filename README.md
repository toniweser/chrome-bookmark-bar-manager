# Chrome Bookmark Bar Manager

A Chrome extension that lets you manage multiple bookmark bar layouts and switch between them with one click.

## What it does

Define named bookmark "sets" (e.g. Work, Personal, Side Project) and instantly swap your entire bookmark bar between them. Your sets are stored as real Chrome bookmark folders, so they survive extension reinstalls and can be edited directly in `chrome://bookmarks`.

## Tech Stack

- **TypeScript** + **React** — popup UI
- **Vite** — build tooling
- **Chrome Extension Manifest V3** — service worker, bookmarks API, storage API

## Development

Requires Node >= 18 (`.nvmrc` specifies Node 24).

```bash
nvm use
npm install
npm run build
```

Load the extension in Chrome:

1. Go to `chrome://extensions`
2. Enable "Developer mode"
3. Click "Load unpacked" and select the `dist/` folder

After code changes, run `npm run build` again and click the refresh icon on the extension card.

---

This project is vibe coded with [Claude Code](https://claude.ai/code).
