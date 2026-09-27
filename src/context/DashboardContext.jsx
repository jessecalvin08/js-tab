import { createContext, useContext, useEffect, useMemo, useReducer } from 'react';
import { StorageService } from '../services/StorageService.js';
import { SnapshotService } from '../services/BackupService.js';

const STORAGE_KEY = 'verdant-dashboard-state';

const defaultCards = [];

export const CARD_STACK_GAP = 18;
const KNOWN_AREAS = ['youtube', 'db', 'ui', 'tools', 'ai', 'web'];
const CALENDAR_HEIGHT = 300;
const NOTE_HEIGHT = 195;
const POMODORO_HEIGHT = 250;
const LAYOUT_VERSION = 3;

function estimateCardHeight(card) {
  const rowsHeight = card.bookmarks.length > 0 ? card.bookmarks.length * 24 : 36;
  return 60 + rowsHeight;
}

export function estimateEntityHeight(workspace, id) {
  if (id === 'calendar') {
    return CALENDAR_HEIGHT;
  }

  if (id === 'pomodoro') {
    return POMODORO_HEIGHT;
  }

  const card = workspace.cards.find((entry) => entry.id === id);
  if (card) {
    return estimateCardHeight(card);
  }

  return NOTE_HEIGHT;
}

export function computeDefaultColumns(workspace) {
  const columns = [[], [], [], []];
  const heights = [0, 0, 0, 0];

  const push = (id, column) => {
    columns[column].push(id);
    heights[column] += estimateEntityHeight(workspace, id) + CARD_STACK_GAP;
  };

  const byArea = new Map(workspace.cards.filter((card) => card.area).map((card) => [card.area, card]));

  [['youtube', 0], ['db', 1], ['ui', 1], ['tools', 2], ['ai', 2], ['web', 3]].forEach(([key, column]) => {
    const card = byArea.get(key);
    if (card) {
      push(card.id, column);
    }
  });

  const pushShortest = (id) => {
    push(id, heights.indexOf(Math.min(...heights)));
  };

  workspace.cards.filter((card) => !KNOWN_AREAS.includes(card.area)).forEach((card) => pushShortest(card.id));
  (workspace.notes ?? []).forEach((note) => pushShortest(note.id));

  if (workspace.pomodoroEnabled) {
    pushShortest('pomodoro');
  }

  return columns;
}

function stripFromColumns(columns, id) {
  return columns.map((column) => column.filter((entry) => entry !== id));
}

// Dragging the last card out of the left column used to leave a hole and push
// the whole board right. Leading empties are trimmed so content always starts at
// the left edge; gaps between occupied columns are left alone.
export function packColumns(columns) {
  // An id listed in two columns reserves space in the first while the card
  // actually renders in the last, which shows up as phantom gaps or overlapping
  // cards. Earlier buggy moves could leave that behind, so duplicates are
  // dropped here (first occurrence wins) and the layout heals itself on load.
  const seen = new Set();
  const next = columns.map((column) => column.filter((id) => {
    if (seen.has(id)) {
      return false;
    }
    seen.add(id);
    return true;
  }));

  const firstUsed = next.findIndex((column) => column.length > 0);

  if (firstUsed <= 0) {
    return next;
  }

  const packed = next.slice(firstUsed);
  while (packed.length < next.length) {
    packed.push([]);
  }

  return packed;
}

function appendToShortestColumn(workspace, columns, id) {
  const next = columns.map((column) => [...column]);
  const validIds = new Set([
    ...workspace.cards.map((card) => card.id),
    ...(workspace.calendarHidden ? [] : ['calendar']),
    ...(workspace.notes ?? []).map((note) => note.id)
  ]);

  const heights = next.map((column) => (
    column
      .filter((entry) => validIds.has(entry) && entry !== id)
      .reduce((sum, entry) => sum + estimateEntityHeight(workspace, entry) + CARD_STACK_GAP, 0)
  ));

  const target = heights.indexOf(Math.min(...heights));
  next[target].push(id);
  return next;
}

const initialWorkspace = {
  id: 'home',
  name: 'Home',
  cards: defaultCards,
  notes: [],
  calendarHidden: true,
  columns: computeDefaultColumns({ cards: defaultCards, notes: [] }),
  layoutVersion: LAYOUT_VERSION,
  settings: {}
};

const initialState = {
  isReady: false,
  workspaces: [initialWorkspace],
  activeWorkspaceId: initialWorkspace.id,
  toolbarExpanded: false,
  wallpaper: { kind: 'default' },
  settings: {
    animations: true,
    clockFormat: '12h',
    weatherUnits: 'celsius',
    searchEngine: 'google',
    openInNewTab: false,
    wallpaperDim: 0,
    wallpaperBlur: 0,
    widgets: { clock: true, search: true, weather: true }
  }
};

export const SEARCH_ENGINES = {
  google: { label: 'Google', url: 'https://www.google.com/search?q=' },
  duckduckgo: { label: 'DuckDuckGo', url: 'https://duckduckgo.com/?q=' },
  bing: { label: 'Bing', url: 'https://www.bing.com/search?q=' },
  brave: { label: 'Brave', url: 'https://search.brave.com/search?q=' }
};

export function searchUrlFor(settings, query) {
  const engine = SEARCH_ENGINES[settings?.searchEngine] ?? SEARCH_ENGINES.google;
  return engine.url + encodeURIComponent(query);
}

const DashboardContext = createContext(null);

function createId(prefix) {
  return `${prefix}-${crypto.randomUUID()}`;
}

function normalizeUrl(url) {
  const value = String(url ?? '').trim();

  if (!value) {
    return '';
  }

  if (/^(https?:\/\/|chrome:\/\/|file:\/\/)/i.test(value)) {
    return value;
  }

  if (value.includes('.') || value.startsWith('localhost')) {
    return `https://${value}`;
  }

  return `https://www.google.com/search?q=${encodeURIComponent(value)}`;
}

function migrateWorkspace(workspace) {
  const calendarWasPlaced = workspace.columns?.some((column) => column.includes('calendar')) ?? false;
  const calendarEmptyVisible = workspace.calendarEmptyVisible
    ?? (calendarWasPlaced && workspace.calendarHidden !== true);

  if (workspace.layoutVersion === LAYOUT_VERSION && Array.isArray(workspace.columns)) {
    return calendarEmptyVisible === workspace.calendarEmptyVisible
      ? workspace
      : { ...workspace, calendarEmptyVisible };
  }

  const { layout, ...rest } = workspace;
  return {
    ...rest,
    calendarEmptyVisible,
    columns: computeDefaultColumns(workspace),
    layoutVersion: LAYOUT_VERSION
  };
}

function updateActiveWorkspace(state, updater) {
  const workspaces = state.workspaces.map((workspace) => (
    workspace.id === state.activeWorkspaceId ? updater(workspace) : workspace
  ));

  return {
    ...state,
    workspaces
  };
}

function dashboardReducer(state, action) {
  switch (action.type) {
    case 'hydrate': {
      const merged = { ...state, ...action.payload, isReady: true };
      return {
        ...merged,
        workspaces: merged.workspaces.map((workspace) => migrateWorkspace(workspace))
      };
    }
    case 'workspace/switch': {
      return {
        ...state,
        activeWorkspaceId: action.payload
      };
    }
    case 'workspace/create': {
      const cards = defaultCards.map((card) => ({ ...card, id: createId('card'), bookmarks: [] }));
      const workspace = {
        id: createId('workspace'),
        name: action.payload.name || 'New board',
        cards,
        notes: [],
        calendarHidden: true,
        columns: computeDefaultColumns({ cards, notes: [] }),
        layoutVersion: LAYOUT_VERSION,
        settings: {}
      };

      return {
        ...state,
        workspaces: [...state.workspaces, workspace],
        activeWorkspaceId: workspace.id
      };
    }
    case 'workspace/rename':
      return {
        ...state,
        workspaces: state.workspaces.map((workspace) => (
          workspace.id === state.activeWorkspaceId ? { ...workspace, name: action.payload.name } : workspace
        ))
      };
    case 'workspace/delete': {
      if (state.workspaces.length === 1) {
        return state;
      }

      const workspaces = state.workspaces.filter((workspace) => workspace.id !== state.activeWorkspaceId);

      return {
        ...state,
        workspaces,
        activeWorkspaceId: workspaces[0].id
      };
    }
    case 'card/create':
      return updateActiveWorkspace(state, (workspace) => {
        const id = createId('card');
        return {
          ...workspace,
          cards: [
            ...workspace.cards,
            {
              id,
              title: action.payload.title || 'New card',
              area: '',
              bookmarks: []
            }
          ],
          columns: appendToShortestColumn(workspace, workspace.columns ?? [[], [], [], []], id)
        };
      });
    case 'card/delete':
      return updateActiveWorkspace(state, (workspace) => ({
        ...workspace,
        cards: workspace.cards.filter((card) => card.id !== action.payload.cardId),
        columns: stripFromColumns(workspace.columns ?? [[], [], [], []], action.payload.cardId)
      }));
    case 'card/rename':
      return updateActiveWorkspace(state, (workspace) => ({
        ...workspace,
        cards: workspace.cards.map((card) => (
          card.id === action.payload.cardId ? { ...card, title: action.payload.title } : card
        ))
      }));
    case 'bookmark/create':
      return updateActiveWorkspace(state, (workspace) => ({
        ...workspace,
        cards: workspace.cards.map((card) => (
          card.id === action.payload.cardId
            ? {
                ...card,
                bookmarks: [
                  ...card.bookmarks,
                  {
                    id: createId('bookmark'),
                    title: action.payload.title,
                    url: normalizeUrl(action.payload.url),
                    description: action.payload.description ?? ''
                  }
                ]
              }
            : card
        ))
      }));
    case 'bookmark/update':
      return updateActiveWorkspace(state, (workspace) => ({
        ...workspace,
        cards: workspace.cards.map((card) => ({
          ...card,
          bookmarks: card.bookmarks.map((bookmark) => (
            bookmark.id === action.payload.bookmarkId
              ? { ...bookmark, title: action.payload.title, url: normalizeUrl(action.payload.url) }
              : bookmark
          ))
        }))
      }));
    case 'bookmark/move': {
      const { bookmarkId, toCardId, index } = action.payload;

      return updateActiveWorkspace(state, (workspace) => {
        const moved = workspace.cards
          .flatMap((card) => card.bookmarks)
          .find((bookmark) => bookmark.id === bookmarkId);
        const targetExists = workspace.cards.some((card) => card.id === toCardId);

        // Bail out before removing anything. Stripping first and only
        // re-inserting on a match meant an unresolved target silently deleted
        // the bookmark.
        if (!moved || !targetExists) {
          return workspace;
        }

        const stripped = workspace.cards.map((card) => ({
          ...card,
          bookmarks: card.bookmarks.filter((bookmark) => bookmark.id !== bookmarkId)
        }));

        return {
          ...workspace,
          cards: stripped.map((card) => (
            card.id === toCardId
              ? {
                  ...card,
                  bookmarks: [
                    ...card.bookmarks.slice(0, index),
                    moved,
                    ...card.bookmarks.slice(index)
                  ]
                }
              : card
          ))
        };
      });
    }
    case 'bookmark/delete':
      return updateActiveWorkspace(state, (workspace) => ({
        ...workspace,
        cards: workspace.cards.map((card) => ({
          ...card,
          bookmarks: card.bookmarks.filter((bookmark) => bookmark.id !== action.payload.bookmarkId)
        }))
      }));
    case 'note/create':
      return updateActiveWorkspace(state, (workspace) => {
        const id = createId('note');
        return {
          ...workspace,
          notes: [...(workspace.notes ?? []), { id, text: '' }],
          columns: appendToShortestColumn(workspace, workspace.columns ?? [[], [], [], []], id)
        };
      });
    case 'note/update':
      return updateActiveWorkspace(state, (workspace) => ({
        ...workspace,
        notes: (workspace.notes ?? []).map((note) => (
          note.id === action.payload.noteId ? { ...note, text: action.payload.text } : note
        ))
      }));
    case 'note/delete':
      return updateActiveWorkspace(state, (workspace) => ({
        ...workspace,
        notes: (workspace.notes ?? []).filter((note) => note.id !== action.payload.noteId),
        columns: stripFromColumns(workspace.columns ?? [[], [], [], []], action.payload.noteId)
      }));
    case 'wallpaper/set':
      // Stored per workspace so each board can have its own backdrop; the root
      // value stays as the fallback for boards that never set one.
      if (action.payload?.scope === 'workspace') {
        return updateActiveWorkspace(state, (workspace) => ({ ...workspace, wallpaper: action.payload.wallpaper }));
      }
      return { ...state, wallpaper: action.payload.wallpaper ?? action.payload };
    case 'wallpaper/scrub': {
      // An upload can be the backdrop of several boards at once; deleting it
      // has to clear every reference, not just the one currently on screen.
      const { uploadId } = action.payload;
      const scrub = (wallpaper) => (
        wallpaper?.kind === 'upload' && wallpaper.uploadId === uploadId ? { kind: 'default' } : wallpaper
      );

      return {
        ...state,
        wallpaper: scrub(state.wallpaper),
        workspaces: state.workspaces.map((workspace) => ({ ...workspace, wallpaper: scrub(workspace.wallpaper) }))
      };
    }
    case 'settings/update':
      return { ...state, settings: { ...state.settings, ...action.payload } };
    case 'pomodoro/show':
      return updateActiveWorkspace(state, (workspace) => ({ ...workspace, pomodoroEnabled: true }));
    case 'pomodoro/hide':
      return updateActiveWorkspace(state, (workspace) => ({ ...workspace, pomodoroEnabled: false }));
    case 'dashboard/import':
      return { ...action.payload, isReady: true };
    case 'card/toggleCollapse':
      return updateActiveWorkspace(state, (workspace) => ({
        ...workspace,
        cards: workspace.cards.map((card) => (
          card.id === action.payload.cardId ? { ...card, collapsed: !card.collapsed } : card
        ))
      }));
    case 'bookmarks/import': {
      const groups = action.payload.groups ?? [];

      return updateActiveWorkspace(state, (workspace) => {
        const cards = groups.map((group) => ({
          id: createId('card'),
          title: group.title || 'Imported',
          area: '',
          bookmarks: group.bookmarks.map((bookmark) => ({
            id: createId('bookmark'),
            title: bookmark.title,
            url: normalizeUrl(bookmark.url),
            description: ''
          }))
        }));

        let columns = workspace.columns ?? [[], [], [], []];
        cards.forEach((card) => {
          columns = appendToShortestColumn({ ...workspace, cards: [...workspace.cards, ...cards] }, columns, card.id);
        });

        return { ...workspace, cards: [...workspace.cards, ...cards], columns };
      });
    }
    case 'calendar/hide':
      return updateActiveWorkspace(state, (workspace) => ({ ...workspace, calendarHidden: true, calendarEmptyVisible: false }));
    case 'calendar/show':
      return updateActiveWorkspace(state, (workspace) => ({ ...workspace, calendarHidden: false, calendarEmptyVisible: true }));
    case 'layout/reset':
      return updateActiveWorkspace(state, (workspace) => ({
        ...workspace,
        columns: computeDefaultColumns(workspace)
      }));
    case 'columns/move':
      return updateActiveWorkspace(state, (workspace) => {
        const columns = stripFromColumns(workspace.columns ?? [[], [], [], []], action.payload.id);
        const target = Math.min(Math.max(action.payload.column, 0), columns.length - 1);
        const index = Math.min(Math.max(action.payload.index, 0), columns[target].length);
        columns[target] = [
          ...columns[target].slice(0, index),
          action.payload.id,
          ...columns[target].slice(index)
        ];
        return { ...workspace, columns: packColumns(columns) };
      });
    case 'dashboard/reset':
      return {
        ...initialState,
        isReady: true
      };
    case 'toolbar/toggle':
      return {
        ...state,
        toolbarExpanded: !state.toolbarExpanded
      };
    default:
      return state;
  }
}

// Seeded from the synchronous mirror so the first paint already shows the user's
// wallpaper and cards. Without this the board rendered built-in defaults for a
// beat while chrome.storage resolved, which read as a green flash on every tab.
function bootState() {
  const mirrored = StorageService.getSync(STORAGE_KEY, null);

  if (!mirrored?.workspaces?.length) {
    return initialState;
  }

  return {
    ...initialState,
    ...mirrored,
    isReady: false,
    workspaces: mirrored.workspaces.map((workspace) => migrateWorkspace(workspace))
  };
}

export function DashboardProvider({ children }) {
  const [state, dispatch] = useReducer(dashboardReducer, undefined, bootState);
  const activeWorkspace = useMemo(
    () => state.workspaces.find((workspace) => workspace.id === state.activeWorkspaceId) ?? state.workspaces[0],
    [state.activeWorkspaceId, state.workspaces]
  );

  useEffect(() => {
    let mounted = true;

    StorageService.get(STORAGE_KEY, null).then((storedState) => {
      if (!mounted) {
        return;
      }

      dispatch({ type: 'hydrate', payload: storedState ?? initialState });
    });

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (!state.isReady) {
      return;
    }

    const { isReady, ...persistedState } = state;
    StorageService.set(STORAGE_KEY, persistedState);
    SnapshotService.maybeRecord(state);
  }, [state]);

  const value = useMemo(() => ({ state: { ...state, activeWorkspace }, dispatch }), [activeWorkspace, state]);

  return (
    <DashboardContext.Provider value={value}>
      {children}
    </DashboardContext.Provider>
  );
}

export function useDashboard() {
  const context = useContext(DashboardContext);

  if (!context) {
    throw new Error('useDashboard must be used inside DashboardProvider');
  }

  return context;
}
