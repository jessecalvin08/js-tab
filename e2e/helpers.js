const STORAGE_KEY = 'verdant-dashboard-state';
const MIRROR_KEY = `js-tab-sync:${STORAGE_KEY}`;

const baseState = {
  activeWorkspaceId: 'home',
  toolbarExpanded: false,
  wallpaper: { kind: 'default' },
  settings: {
    animations: true,
    clockFormat: '12h',
    weatherUnits: 'celsius',
    searchEngine: 'google',
    openInNewTab: true,
    wallpaperDim: 0,
    wallpaperBlur: 0,
    widgets: { clock: true, search: true, weather: true }
  }
};

// Seeds the two localStorage keys the app boots from (the synchronous mirror
// used for first paint, and the raw key the async hydrate effect reads) so
// every test starts from data it controls, with no dependency on prior runs.
export async function seedDashboard(page, { workspace, settings } = {}) {
  const state = {
    ...baseState,
    settings: { ...baseState.settings, ...settings },
    workspaces: [
      workspace ?? {
        id: 'home',
        name: 'Home',
        cards: [],
        notes: [],
        columns: [[], [], [], []],
        layoutVersion: 3,
        settings: {}
      }
    ]
  };

  await page.addInitScript(
    ([storageKey, mirrorKey, serialized]) => {
      window.localStorage.setItem(storageKey, serialized);
      window.localStorage.setItem(mirrorKey, serialized);
    },
    [STORAGE_KEY, MIRROR_KEY, JSON.stringify(state)]
  );
}

export function cardWithBookmark({ cardId = 'card-1', cardTitle = 'Test Card', bookmarkId = 'bookmark-1', bookmarkTitle = 'Example Site', bookmarkUrl = 'https://example.com/' } = {}) {
  return {
    id: 'home',
    name: 'Home',
    cards: [
      {
        id: cardId,
        title: cardTitle,
        area: '',
        bookmarks: [{ id: bookmarkId, title: bookmarkTitle, url: bookmarkUrl, description: '' }]
      }
    ],
    notes: [],
    columns: [[cardId], [], [], []],
    layoutVersion: 3,
    settings: {}
  };
}

// Stubs every external navigation target the app can send the user to, so
// tests never depend on real network access and never flake on it.
export async function stubExternalNavigation(context) {
  await context.route(/^https:\/\/(www\.google\.com|duckduckgo\.com|www\.bing\.com|search\.brave\.com|example\.com)\//, (route) => (
    route.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><title>stub</title>' })
  ));
}
