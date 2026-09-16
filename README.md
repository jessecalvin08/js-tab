# J's TAB

A Chrome new-tab extension: a glassmorphism workspace with grouped quick links, search,
weather and clock widgets, a Pomodoro timer, notes and custom wallpapers.

**Stack:** React 19, Vite, Framer Motion, Chrome Extensions Manifest V3, Playwright (e2e).

## Try it

- **Live demo (web build):** runs in any browser; data is saved to `localStorage`
  instead of `chrome.storage`, and Chrome bookmark import is disabled.
- **As an extension:** `npm install && npm run build`, then open `chrome://extensions`,
  enable *Developer mode*, click *Load unpacked* and select `dist/`.

## Development

```bash
npm install
npm run dev        # web preview
npm run build      # extension build in dist/
npm run test:e2e   # Playwright tests
```

## How it works

- `src/services/StorageService.js` uses `chrome.storage.local` inside the extension and
  falls back to `localStorage` on the web, mirroring writes so the first paint is correct.
- Wallpapers are stored in IndexedDB (`WallpaperStore.js`) because they exceed
  `chrome.storage` limits.
- Weather comes from the Open-Meteo API (no key needed).
- Favicons use Chrome's local `_favicon` cache inside the extension, so saved sites are
  not sent to a third-party service.
