import { AnimatePresence, motion } from 'framer-motion';
import { Calendar, Clock, Cloud, Columns3, Edit3, Grid2x2Plus, Image, Menu, MoreHorizontal, Pencil, Plus, Search, Settings, Timer, Trash2, X } from 'lucide-react';
import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { WorkspaceSelector } from './components/WorkspaceSelector/WorkspaceSelector.jsx';
import { SearchBar } from './components/SearchBar/SearchBar.jsx';
import { GlassCard } from './components/GlassCard/GlassCard.jsx';
import { DraggableCard } from './components/DraggableCard/DraggableCard.jsx';
import { Pomodoro } from './components/Pomodoro/Pomodoro.jsx';
import { SEARCH_ENGINES, packColumns, searchUrlFor, useDashboard } from './context/DashboardContext.jsx';
import { useClock } from './hooks/useClock.js';
import { useWallpaperMedia } from './hooks/useWallpaperMedia.js';
import { useAdaptiveTheme } from './hooks/useAdaptiveTheme.js';
import { useWallpaperSampler } from './hooks/useWallpaperSampler.js';
import { useWeather } from './hooks/useWeather.js';
import { BookmarkService } from './services/BookmarkService.js';
import { BackupService, SnapshotService } from './services/BackupService.js';
import { faviconUrl, getHostname, letterAvatar } from './utils/favicon.js';
import styles from './App.module.css';

// Opened rarely, so they are fetched on demand instead of weighing down the
// first paint of every new tab.
const WallpaperModal = lazy(() => import('./components/WallpaperModal/WallpaperModal.jsx')
  .then((m) => ({ default: m.WallpaperModal })));
const QuickLauncher = lazy(() => import('./components/QuickLauncher/QuickLauncher.jsx')
  .then((m) => ({ default: m.QuickLauncher })));

const TINT_CACHE_KEY = 'js-tab-tint-cache';

// Drop targets are measured against the items EXCLUDING the one being dragged,
// but the dragged item stays in the list so it never moves mid-gesture. This
// converts that "index among the others" into a real array position.
function insertionIndex(ids, draggedId, indexAmongOthers) {
  const others = [];
  ids.forEach((id, position) => {
    if (id !== draggedId) {
      others.push(position);
    }
  });

  const clamped = Math.min(Math.max(indexAmongOthers, 0), others.length);
  return clamped < others.length ? others[clamped] : ids.length;
}

function buildCalendarDays(date) {
  const year = date.getFullYear();
  const month = date.getMonth();
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  return [
    ...Array.from({ length: firstDay }, () => null),
    ...Array.from({ length: daysInMonth }, (_, index) => index + 1)
  ];
}

export function App() {
  const now = useClock();
  const { state, dispatch } = useDashboard();
  const [modal, setModal] = useState(null);
  const [query, setQuery] = useState('');
  const [toolbarOpen, setToolbarOpen] = useState(false);
  const [monthOffset, setMonthOffset] = useState(0);
  const [launcherOpen, setLauncherOpen] = useState(false);
  const [importNotice, setImportNotice] = useState('');
  const [cardMenu, setCardMenu] = useState(null);
  // Deletions take whole cards (and every link inside) with them, so each one
  // stashes the previous state and offers it back for a few seconds.
  const [undoOffer, setUndoOffer] = useState(null);
  const undoTimerRef = useRef(null);

  const [urlDropTarget, setUrlDropTarget] = useState(null);
  const snapshots = useMemo(() => (modal?.type === 'settings' ? SnapshotService.list() : []), [modal]);

  // A link dragged in from another tab arrives as text; the title is derived from
  // the hostname, the same way the paste-a-URL popup does it.
  function handleDroppedUrl(cardId, dataTransfer) {
    const raw = (dataTransfer?.getData('text/uri-list') || dataTransfer?.getData('text/plain') || '')
      .split('\n')
      .map((line) => line.trim())
      .find((line) => line && !line.startsWith('#'));

    if (!raw) {
      return;
    }

    const url = /^(https?:\/\/)/i.test(raw) ? raw : `https://${raw}`;
    const host = getHostname(url).replace(/^www\./, '');

    if (!host) {
      return;
    }

    dispatch({ type: 'bookmark/create', payload: { cardId, title: host, url, description: '' } });
  }

  function offerUndo(label, snapshot) {
    if (undoTimerRef.current) {
      clearTimeout(undoTimerRef.current);
    }
    setUndoOffer({ label, snapshot });
    undoTimerRef.current = setTimeout(() => setUndoOffer(null), 9000);
  }

  function applyUndo() {
    if (!undoOffer) {
      return;
    }
    dispatch({ type: 'dashboard/import', payload: undoOffer.snapshot });
    setUndoOffer(null);
    if (undoTimerRef.current) {
      clearTimeout(undoTimerRef.current);
    }
  }
  const [linkPopover, setLinkPopover] = useState(null);
  const [confirmBookmarkId, setConfirmBookmarkId] = useState(null);
  const [bookmarkDrag, setBookmarkDrag] = useState(null);
  // Mirrored in a ref so the drop handler can read the latest target without
  // dispatching from inside a state updater (which React may run twice).
  const bookmarkDragRef = useRef(null);
  bookmarkDragRef.current = bookmarkDrag;

  function bookmarkTargetFromPointer(bookmark, event, info) {
    const x = typeof event?.clientX === 'number' ? event.clientX : info?.point?.x - window.scrollX;
    const y = typeof event?.clientY === 'number' ? event.clientY : info?.point?.y - window.scrollY;

    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      return null;
    }

    // The dragged row sits under the cursor and belongs to its ORIGIN card, so it
    // has to be skipped or every drop resolves back to the card it came from.
    const stack = document.elementsFromPoint(x, y);
    const list = stack.reduce((found, node) => {
      if (found || !node.closest) {
        return found;
      }

      const ownRow = node.closest('[data-row-id]');
      if (ownRow?.getAttribute('data-row-id') === bookmark.id) {
        return null;
      }

      return node.closest('[data-card-list]') || null;
    }, null);

    if (!list) {
      return null;
    }

    const toCardId = list.getAttribute('data-card-list');
    const rows = Array.from(list.querySelectorAll('[data-row-id]'))
      .filter((row) => row.getAttribute('data-row-id') !== bookmark.id);

    let index = rows.length;
    for (let i = 0; i < rows.length; i += 1) {
      const rect = rows[i].getBoundingClientRect();
      if (y < rect.top + rect.height / 2) {
        index = i;
        break;
      }
    }

    return { id: bookmark.id, toCardId, index };
  }

  function handleBookmarkDrag(bookmark, event, info) {
    const target = bookmarkTargetFromPointer(bookmark, event, info);
    if (!target) {
      return;
    }

    setBookmarkDrag((prev) => (
      prev && prev.id === target.id && prev.toCardId === target.toCardId && prev.index === target.index
        ? prev
        : target
    ));
  }

  function handleBookmarkDrop(bookmark, event, info) {
    // Resolved from the release point rather than the last processed drag frame.
    // Trusting that frame meant a quick drop could commit to a card the cursor
    // had merely passed over on the way.
    const drag = bookmarkTargetFromPointer(bookmark, event, info) ?? bookmarkDragRef.current;

    if (drag) {
      // The reducer keys off bookmarkId; passing the preview object straight
      // through silently matched nothing and the drop was discarded.
      dispatch({
        type: 'bookmark/move',
        payload: { bookmarkId: drag.id, toCardId: drag.toCardId, index: drag.index }
      });
    }

    setBookmarkDrag(null);
  }

  // Ctrl/Cmd+K opens the launcher; "/" focuses it too, as long as the user is
  // not already typing somewhere.
  useEffect(() => {
    const onKeyDown = (event) => {
      const target = event.target;
      const typing = target instanceof Element
        && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable);

      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setLauncherOpen(true);
      } else if (event.key === '/' && !typing) {
        event.preventDefault();
        setLauncherOpen(true);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  async function handleImportChromeBookmarks() {
    if (!BookmarkService.isAvailable()) {
      setImportNotice('Chrome bookmarks are only available when running as an extension.');
      return;
    }

    try {
      const groups = await BookmarkService.readGroups();
      if (!groups.length) {
        setImportNotice('No bookmarks found to import.');
        return;
      }

      dispatch({ type: 'bookmarks/import', payload: { groups } });
      const count = groups.reduce((total, group) => total + group.bookmarks.length, 0);
      setImportNotice(`Imported ${count} bookmarks into ${groups.length} cards.`);
    } catch {
      setImportNotice('Could not read Chrome bookmarks.');
    }
  }

  async function handleImportBackup(file) {
    if (!file) {
      return;
    }

    try {
      const imported = await BackupService.read(file);
      dispatch({ type: 'dashboard/import', payload: imported });
      setImportNotice('Backup restored.');
    } catch (error) {
      setImportNotice(error?.message || 'That backup could not be read.');
    }
  }

  useEffect(() => {
    if (!cardMenu) {
      return undefined;
    }

    const close = (event) => {
      const target = event.target;
      if (target instanceof Element && (target.closest(`.${styles.cardMenu}`) || target.closest(`.${styles.menuWrap}`))) {
        return;
      }
      setCardMenu(null);
    };

    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, [cardMenu]);

  function toggleCardMenu(id, kind) {
    setCardMenu((prev) => (prev?.id === id ? null : { id, kind, confirm: false }));
  }

  function handleMenuDelete() {
    if (!cardMenu) {
      return;
    }

    if (!cardMenu.confirm) {
      setCardMenu({ ...cardMenu, confirm: true });
      return;
    }

    const { isReady, ...snapshot } = state;

    if (cardMenu.kind === 'card') {
      const card = activeWorkspace.cards.find((entry) => entry.id === cardMenu.id);
      dispatch({ type: 'card/delete', payload: { cardId: cardMenu.id } });
      offerUndo(`Deleted "${card?.title ?? 'card'}"`, snapshot);
    } else if (cardMenu.kind === 'note') {
      dispatch({ type: 'note/delete', payload: { noteId: cardMenu.id } });
      offerUndo('Deleted note', snapshot);
    } else if (cardMenu.kind === 'calendar') {
      dispatch({ type: 'calendar/hide' });
      offerUndo('Removed calendar', snapshot);
    } else if (cardMenu.kind === 'pomodoro') {
      dispatch({ type: 'pomodoro/hide' });
      offerUndo('Removed pomodoro', snapshot);
    }
    setCardMenu(null);
  }

  function handleMenuRename(card) {
    const title = window.prompt('Rename card', card.title);
    if (title?.trim()) {
      dispatch({ type: 'card/rename', payload: { cardId: card.id, title: title.trim() } });
    }
    setCardMenu(null);
  }

  const settings = state.settings ?? {};
  // Persisted like every other setting, so it survives a reload instead of
  // resetting to "all on" every time a new tab opens.
  const widgetSettings = { clock: true, search: true, weather: true, ...settings.widgets };

  function toggleWidget(key) {
    dispatch({ type: 'settings/update', payload: { widgets: { ...widgetSettings, [key]: !widgetSettings[key] } } });
  }

  // Readability controls for busy wallpapers.
  const dimAmount = Math.min(Math.max(Number(settings.wallpaperDim) || 0, 0), 0.8);
  const blurPx = Math.min(Math.max(Number(settings.wallpaperBlur) || 0, 0), 24);
  const wallpaperFilter = blurPx > 0 ? `blur(${blurPx}px)` : undefined;
  const location = settings.location ?? 'Chennai';
  const units = settings.weatherUnits === 'fahrenheit' ? 'fahrenheit' : 'celsius';
  const [locationInput, setLocationInput] = useState(location);

  function applyLocation(event) {
    event.preventDefault();
    if (locationInput.trim()) {
      dispatch({ type: 'settings/update', payload: { location: locationInput.trim() } });
    }
  }

  const { weather, error: weatherError } = useWeather(location, units);

  // A looping video decoding in every background tab is a real battery drain.
  const wallpaperVideoRef = useRef(null);
  useEffect(() => {
    const onVisibility = () => {
      const video = wallpaperVideoRef.current;
      if (!video) {
        return;
      }

      if (document.hidden) {
        video.pause();
      } else {
        video.play().catch(() => {});
      }
    };

    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, []);

  const activeWorkspace = state.activeWorkspace;
  const activeWallpaper = activeWorkspace.wallpaper ?? state.wallpaper;
  const wallpaperMedia = useWallpaperMedia(activeWallpaper);
  const adaptiveTheme = useAdaptiveTheme(wallpaperMedia);

  // Sampling needs the wallpaper decoded first, so the tints from the last visit
  // are reused immediately and simply refreshed once the real sample lands.
  const wallpaperKey = activeWallpaper?.presetId ?? activeWallpaper?.uploadId ?? activeWallpaper?.kind ?? 'default';
  const cachedTints = useMemo(() => {
    try {
      const cached = JSON.parse(window.localStorage.getItem(TINT_CACHE_KEY) || 'null');
      return cached?.key === wallpaperKey ? cached : null;
    } catch {
      return null;
    }
  }, [wallpaperKey]);

  // Declared before themeVars reads it — a `const` referenced above its
  // declaration throws at render time.
  const [chromeTint, setChromeTint] = useState(cachedTints?.chrome ?? null);

  // Border/accent/shell come from the whole-image palette; the surfaces that sit
  // over a specific part of the wallpaper use the live sample instead.
  const themeVars = adaptiveTheme || chromeTint
    ? {
        ...(chromeTint
          ? { '--glass-bg': chromeTint, '--chrome-bg': chromeTint }
          : adaptiveTheme && { '--glass-bg': adaptiveTheme.tints[0], '--chrome-bg': adaptiveTheme.chrome }),
        ...(adaptiveTheme && {
          '--glass-border': adaptiveTheme.border,
          '--accent-strong': adaptiveTheme.accent,
          '--shell-bg': adaptiveTheme.shell
        })
      }
    : undefined;

  // Each card takes its colour from the patch of wallpaper directly behind it,
  // so moving a card to a different part of the background re-tints it.
  const { sampleRect, version: samplerVersion } = useWallpaperSampler(wallpaperMedia);
  const [cardTints, setCardTints] = useState(cachedTints?.cards ?? {});

  const recomputeTints = useCallback(() => {
    const next = {};
    document.querySelectorAll('[data-entity-id]').forEach((element) => {
      const id = element.getAttribute('data-entity-id');
      const tint = sampleRect(element.getBoundingClientRect());
      if (tint) {
        next[id] = tint;
      }
    });

    // While the wallpaper is (re)loading the sampler has no canvas and every read
    // comes back empty. Replacing the map in that moment blanked every card back
    // to the default glass — the green flash. Last good tints are kept instead,
    // and only successfully sampled cards are updated.
    setCardTints((prev) => {
      const keys = Object.keys(next);
      if (!keys.length) {
        return prev;
      }

      const merged = { ...prev, ...next };
      const unchanged = Object.keys(merged).length === Object.keys(prev).length
        && Object.keys(merged).every((key) => prev[key] === merged[key]);
      return unchanged ? prev : merged;
    });

    // The top bar reads the strip of wallpaper behind it, so the search field and
    // pills stay in step with the cards instead of holding a stale colour.
    const topBar = document.querySelector(`.${styles.topBar}`);
    let chrome = null;
    if (topBar) {
      chrome = sampleRect(topBar.getBoundingClientRect());
      // Same rule: a failed read must not reset the chrome to its default.
      if (chrome) {
        setChromeTint((prev) => (prev === chrome ? prev : chrome));
      }
    }

    if (Object.keys(next).length || chrome) {
      try {
        window.localStorage.setItem(TINT_CACHE_KEY, JSON.stringify({ key: wallpaperKey, cards: next, chrome }));
      } catch {
        // cache is best-effort
      }
    }
  }, [sampleRect, wallpaperKey]);

  const cardStyle = (id) => {
    const tint = cardTints[id];
    return tint ? { background: tint, '--card-tint': tint } : undefined;
  };

  // Re-sample whenever the wallpaper updates (including each video frame grab),
  // whenever the board re-arranges, and after the settle animation lands the
  // cards in their final positions.
  useEffect(() => {
    const settle = setTimeout(recomputeTints, 60);
    const afterAnimation = setTimeout(recomputeTints, 700);
    return () => {
      clearTimeout(settle);
      clearTimeout(afterAnimation);
    };
  }, [recomputeTints, samplerVersion, activeWorkspace.columns, activeWorkspace.cards, activeWorkspace.notes]);

  useEffect(() => {
    const onResize = () => recomputeTints();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [recomputeTints]);

  const draggedBookmark = useMemo(() => {
    if (!bookmarkDrag) {
      return null;
    }
    for (const card of activeWorkspace.cards) {
      const found = card.bookmarks.find((bookmark) => bookmark.id === bookmarkDrag.id);
      if (found) {
        return found;
      }
    }
    return null;
  }, [bookmarkDrag, activeWorkspace.cards]);

  // Same rule as the cards: the row being dragged never moves in the DOM, and a
  // dashed gap marks where it will land — whether that is inside its own card or
  // in another one.
  function bookmarksFor(card) {
    if (!bookmarkDrag || !draggedBookmark || card.id !== bookmarkDrag.toCardId) {
      return card.bookmarks;
    }

    const list = [...card.bookmarks];
    const insertAt = insertionIndex(
      list.map((bookmark) => bookmark.id),
      bookmarkDrag.id,
      bookmarkDrag.index
    );

    list.splice(insertAt, 0, { id: `${bookmarkDrag.id}::ghost`, __ghost: true });
    return list;
  }

  // Long cards fold down to a preview so one big card can't dominate its column.
  const COLLAPSE_AFTER = 6;

  function visibleBookmarks(card) {
    const list = bookmarksFor(card);
    return card.collapsed ? list.slice(0, COLLAPSE_AFTER) : list;
  }

  function hiddenCount(card) {
    const total = bookmarksFor(card).length;
    if (total <= COLLAPSE_AFTER) {
      return 0;
    }
    return card.collapsed ? total - COLLAPSE_AFTER : total - COLLAPSE_AFTER;
  }
  const viewedMonth = useMemo(
    () => new Date(now.getFullYear(), now.getMonth() + monthOffset, 1),
    [now, monthOffset]
  );
  const monthLabel = viewedMonth.toLocaleDateString([], { month: 'long', year: 'numeric' });
  const calendarDays = useMemo(() => buildCalendarDays(viewedMonth), [viewedMonth]);
  const showingCurrentMonth = monthOffset === 0;
  const allBookmarks = activeWorkspace.cards.flatMap((card) => (
    card.bookmarks.map((bookmark) => ({ ...bookmark, cardTitle: card.title }))
  ));
  const searchResults = query.trim()
    ? allBookmarks.filter((bookmark) => `${bookmark.title} ${bookmark.url} ${bookmark.cardTitle}`.toLowerCase().includes(query.toLowerCase()))
    : [];

  const [dragPreview, setDragPreview] = useState(null);
  const dragPreviewRef = useRef(null);
  dragPreviewRef.current = dragPreview;

  const baseColumns = useMemo(() => {
    const stored = Array.isArray(activeWorkspace.columns) ? activeWorkspace.columns : [[], [], [], []];
    const validIds = new Set([
      ...activeWorkspace.cards.map((card) => card.id),
      ...(activeWorkspace.calendarHidden ? [] : ['calendar']),
      ...(activeWorkspace.pomodoroEnabled ? ['pomodoro'] : []),
      ...(activeWorkspace.notes ?? []).map((note) => note.id)
    ]);

    const columns = stored.map((column) => column.filter((id) => validIds.has(id)));
    while (columns.length < 4) {
      columns.push([]);
    }

    const present = new Set(columns.flat());
    validIds.forEach((id) => {
      if (!present.has(id)) {
        const target = columns.reduce((min, column, index) => (column.length < columns[min].length ? index : min), 0);
        columns[target].push(id);
      }
    });

    return packColumns(columns);
  }, [activeWorkspace]);

  // The card being dragged deliberately keeps its own slot for the duration of
  // the gesture. Re-ordering it live moved it in the DOM, and its layout
  // animation then fought the drag transform — the card would lurch away from
  // the cursor instead of following it. Only the OTHER cards shift, which is
  // what shows where it will land.
  const displayColumns = useMemo(() => {
    if (!dragPreview) {
      return baseColumns;
    }

    const columns = baseColumns.map((column) => [...column]);
    const target = Math.min(Math.max(dragPreview.column, 0), columns.length - 1);

    // Works for the card's own column as well as any other: the gap is placed at
    // the drop position while the dragged card keeps its slot.
    const insertAt = insertionIndex(columns[target], dragPreview.id, dragPreview.index);
    columns[target].splice(insertAt, 0, `${dragPreview.id}::ghost`);
    return columns;
  }, [baseColumns, dragPreview]);

  // Drop target resolved from the live DOM: which column element is under the
  // pointer, and which card midpoints the pointer sits between. No height
  // arithmetic — the browser's own layout is the source of truth.
  const targetFromPointer = useCallback((id, event, info) => {
    const clientX = Number.isFinite(event?.clientX) ? event.clientX : info?.point?.x - window.scrollX;
    const clientY = Number.isFinite(event?.clientY) ? event.clientY : info?.point?.y - window.scrollY;

    if (!Number.isFinite(clientX) || !Number.isFinite(clientY)) {
      return null;
    }

    // The dragged card itself sits under the cursor; skip anything inside it so
    // the target never resolves back to the card being moved.
    const stack = document.elementsFromPoint(clientX, clientY);
    let columnEl = null;
    for (const node of stack) {
      if (!node.closest) {
        continue;
      }
      const own = node.closest('[data-entity-id]');
      if (own?.getAttribute('data-entity-id') === id) {
        continue;
      }
      const col = node.closest('[data-column]');
      if (col) {
        columnEl = col;
        break;
      }
    }

    // Falling back to horizontal position keeps drops working even when the
    // pointer is over a gap rather than a column box.
    if (!columnEl) {
      columnEl = [...document.querySelectorAll('[data-column]')].find((col) => {
        const rect = col.getBoundingClientRect();
        return clientX >= rect.left && clientX <= rect.right;
      }) ?? null;
    }

    if (!columnEl) {
      return null;
    }

    const column = Number(columnEl.getAttribute('data-column'));
    const siblings = [...columnEl.children]
      .filter((el) => el.hasAttribute?.('data-entity-id') && el.getAttribute('data-entity-id') !== id);

    let index = siblings.length;
    for (let i = 0; i < siblings.length; i += 1) {
      const rect = siblings[i].getBoundingClientRect();
      if (clientY < rect.top + rect.height / 2) {
        index = i;
        break;
      }
    }

    return { id, column, index };
  }, []);

  const handleDragMove = useCallback((id, event, info) => {
    const target = targetFromPointer(id, event, info);
    if (!target) {
      return;
    }

    setDragPreview((prev) => (
      prev && prev.id === id && prev.column === target.column && prev.index === target.index
        ? prev
        : target
    ));
  }, [targetFromPointer]);

  const handleDrop = useCallback((id, event, info) => {
    // Recomputed from the release point instead of trusting the last drag frame:
    // a fast flick can end before the final move is processed, which would drop
    // the card a column away from where it was let go.
    const target = targetFromPointer(id, event, info) ?? dragPreviewRef.current;

    if (target && target.id === id) {
      dispatch({ type: 'columns/move', payload: target });
    }

    setDragPreview(null);
    // Re-tint once the card has settled into its new position.
    setTimeout(recomputeTints, 650);
  }, [dispatch, targetFromPointer, recomputeTints]);

  // Keyboard alternative to dragging: Alt+arrows move the focused card between
  // columns and positions, so the board is usable without a mouse.
  function handleCardKeyDown(event, entityId) {
    if (!event.altKey || !event.key.startsWith('Arrow')) {
      return;
    }

    const from = baseColumns.findIndex((column) => column.includes(entityId));
    if (from === -1) {
      return;
    }

    event.preventDefault();
    const index = baseColumns[from].indexOf(entityId);

    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      const column = Math.min(Math.max(from + (event.key === 'ArrowRight' ? 1 : -1), 0), baseColumns.length - 1);
      if (column !== from) {
        dispatch({ type: 'columns/move', payload: { id: entityId, column, index: 0 } });
      }
      return;
    }

    const next = index + (event.key === 'ArrowDown' ? 1 : -1);
    if (next >= 0 && next <= baseColumns[from].length - 1) {
      dispatch({ type: 'columns/move', payload: { id: entityId, column: from, index: next } });
    }
  }

  function handleRowKeyDown(event, card, bookmark) {
    if (!event.altKey || (event.key !== 'ArrowUp' && event.key !== 'ArrowDown')) {
      return;
    }

    event.preventDefault();
    const index = card.bookmarks.findIndex((entry) => entry.id === bookmark.id);
    const next = index + (event.key === 'ArrowDown' ? 1 : -1);

    if (next >= 0 && next < card.bookmarks.length) {
      dispatch({ type: 'bookmark/move', payload: { bookmarkId: bookmark.id, toCardId: card.id, index: next } });
    }
  }

  function renderEntity(entityId) {
    // Insertion gap shown while a card is dragged over another column.
    if (entityId.endsWith('::ghost')) {
      const sourceId = entityId.slice(0, -7);
      const height = document.querySelector(`[data-entity-id="${CSS.escape(sourceId)}"]`)?.offsetHeight ?? 90;
      return <div key={entityId} className={styles.dropGap} style={{ height }} aria-hidden="true" />;
    }

    if (entityId === 'calendar') {
      return activeWorkspace.calendarHidden ? null : renderCalendarCard();
    }
    if (entityId === 'pomodoro') {
      return activeWorkspace.pomodoroEnabled ? renderPomodoroCard() : null;
    }

    const card = activeWorkspace.cards.find((entry) => entry.id === entityId);
    if (card) {
      return renderBookmarkCard(card);
    }

    const note = (activeWorkspace.notes ?? []).find((entry) => entry.id === entityId);
    return note ? renderNoteCard(note) : null;
  }

  function renderBookmarkCard(card) {
    if (!card) {
      return null;
    }

    return (
      <DraggableCard
        key={card.id}
        id={card.id}
        z={cardMenu?.id === card.id ? 40 : undefined}
        onDragMove={handleDragMove}
        onDrop={handleDrop}
      >
        {(
          <GlassCard
            className={`${styles.bookmarkCard} ${urlDropTarget === card.id ? styles.dropTarget : ''}`}
            style={cardStyle(card.id)}
            // Accepts a link dragged in from another tab or window.
            onDragOver={(event) => {
              if (event.dataTransfer?.types?.includes('text/uri-list') || event.dataTransfer?.types?.includes('text/plain')) {
                event.preventDefault();
                event.dataTransfer.dropEffect = 'copy';
                setUrlDropTarget(card.id);
              }
            }}
            onDragLeave={() => setUrlDropTarget((prev) => (prev === card.id ? null : prev))}
            onDrop={(event) => {
              event.preventDefault();
              setUrlDropTarget(null);
              handleDroppedUrl(card.id, event.dataTransfer);
            }}
          >
            <header
              tabIndex={0}
              role="group"
              aria-label={`${card.title} card. Alt plus arrow keys moves it.`}
              onKeyDown={(event) => handleCardKeyDown(event, card.id)}
            >
              <h2>{card.title}</h2>
              <div
                className={`${styles.cardActions} ${cardMenu?.id === card.id ? styles.actionsOpen : ''}`}
                onPointerDown={(event) => event.stopPropagation()}
              >
                <button type="button" aria-label={`Add bookmark to ${card.title}`} onClick={() => openAddBookmark(card.id)}>
                  <Plus size={16} />
                </button>
                <div className={styles.menuWrap}>
                  <button type="button" aria-label={`${card.title} options`} onClick={() => toggleCardMenu(card.id, 'card')}>
                    <MoreHorizontal size={16} />
                  </button>
                  {cardMenu?.id === card.id && (
                    <div className={styles.cardMenu}>
                      <button type="button" onClick={() => handleMenuRename(card)}>
                        <Edit3 size={15} /> Rename
                      </button>
                      <button type="button" className={styles.danger} onClick={handleMenuDelete}>
                        <Trash2 size={15} /> {cardMenu.confirm ? 'Confirm delete?' : 'Delete'}
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </header>
            <div className={styles.linkList} data-card-list={card.id}>
              {visibleBookmarks(card).map((bookmark) => (bookmark.__ghost ? (
                <div key={bookmark.id} className={styles.rowDropGap} aria-hidden="true" />
              ) : (
                <motion.div
                  // Layout projection and the drag gesture both write transform,
                  // which made the dragged row stutter between the two. The row
                  // being dragged opts out; the rest still animate into place.
                  layout={bookmarkDrag?.id === bookmark.id ? false : 'position'}
                  transition={{ type: 'spring', stiffness: 700, damping: 50 }}
                  className={`${styles.bookmarkRow} ${bookmarkDrag?.id === bookmark.id ? styles.rowDragging : ''}`}
                  key={bookmark.id}
                  data-row-id={bookmark.id}
                  drag
                  dragSnapToOrigin
                  dragElastic={0.1}
                  dragMomentum={false}
                  onDrag={(event, info) => handleBookmarkDrag(bookmark, event, info)}
                  onDragEnd={(event, info) => handleBookmarkDrop(bookmark, event, info)}
                  onMouseLeave={() => setConfirmBookmarkId((prev) => (prev === bookmark.id ? null : prev))}
                  tabIndex={0}
                  onKeyDown={(event) => handleRowKeyDown(event, card, bookmark)}
                >
                  <a
                    href={bookmark.url}
                    className={styles.bookmarkLink}
                    title={bookmark.description || undefined}
                    draggable={false}
                    target={settings.openInNewTab ? '_blank' : undefined}
                    rel={settings.openInNewTab ? 'noreferrer' : undefined}
                  >
                    <img
                      src={faviconUrl(bookmark.url)}
                      alt=""
                      draggable={false}
                      onError={(event) => { event.currentTarget.src = letterAvatar(bookmark.url, bookmark.title); }}
                    />
                    <span>{bookmark.title}</span>
                  </a>
                  <div className={styles.rowActions}>
                    {confirmBookmarkId === bookmark.id ? (
                      <button
                        type="button"
                        className={styles.confirmDelete}
                        onClick={() => {
                          const { isReady, ...snapshot } = state;
                          dispatch({ type: 'bookmark/delete', payload: { bookmarkId: bookmark.id } });
                          offerUndo(`Deleted "${bookmark.title}"`, snapshot);
                          setConfirmBookmarkId(null);
                        }}
                      >
                        Delete?
                      </button>
                    ) : (
                      <>
                        <button type="button" aria-label={`Edit ${bookmark.title}`} onClick={() => openEditBookmark(bookmark)}>
                          <Edit3 size={14} />
                        </button>
                        <button type="button" aria-label={`Delete ${bookmark.title}`} onClick={() => setConfirmBookmarkId(bookmark.id)}>
                          <X size={14} />
                        </button>
                      </>
                    )}
                  </div>
                </motion.div>
              )))}
              {bookmarksFor(card).length === 0 && (
                <button type="button" className={styles.emptyAction} onClick={() => openAddBookmark(card.id)}>
                  Add bookmark
                </button>
              )}
              {hiddenCount(card) > 0 && (
                <button
                  type="button"
                  className={styles.showMore}
                  onClick={() => dispatch({ type: 'card/toggleCollapse', payload: { cardId: card.id } })}
                >
                  {card.collapsed ? `Show ${hiddenCount(card)} more` : 'Show less'}
                </button>
              )}
            </div>
          </GlassCard>
        )}
      </DraggableCard>
    );
  }

  function renderCalendarCard() {

    return (
      <DraggableCard
        key="calendar"
        id="calendar"
        z={cardMenu?.id === 'calendar' ? 40 : undefined}
        onDragMove={handleDragMove}
        onDrop={handleDrop}
      >
        {(
          <GlassCard
            className={styles.calendarCard}
            style={cardStyle('calendar')}
          >
            <header>
              <button
                type="button"
                aria-label="Previous month"
                onPointerDown={(event) => event.stopPropagation()}
                onClick={() => setMonthOffset((value) => value - 1)}
              >
                &lt;
              </button>
              <h2
                onDoubleClick={() => setMonthOffset(0)}
                title={showingCurrentMonth ? undefined : 'Double-click to return to this month'}
              >
                {monthLabel}
              </h2>
              <button
                type="button"
                aria-label="Next month"
                onPointerDown={(event) => event.stopPropagation()}
                onClick={() => setMonthOffset((value) => value + 1)}
              >
                &gt;
              </button>
              <div
                className={`${styles.cardActions} ${cardMenu?.id === 'calendar' ? styles.actionsOpen : ''}`}
                onPointerDown={(event) => event.stopPropagation()}
              >
                <div className={styles.menuWrap}>
                  <button type="button" aria-label="Calendar options" onClick={() => toggleCardMenu('calendar', 'calendar')}>
                    <MoreHorizontal size={16} />
                  </button>
                  {cardMenu?.id === 'calendar' && (
                    <div className={styles.cardMenu}>
                      <button type="button" className={styles.danger} onClick={handleMenuDelete}>
                        <Trash2 size={15} /> {cardMenu.confirm ? 'Confirm delete?' : 'Delete board'}
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </header>
            <div className={styles.calendarGrid} aria-label={`${monthLabel} calendar`}>
              {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map((day) => <strong key={day}>{day}</strong>)}
              {calendarDays.map((day, index) => (
                day
                  ? <time key={day} className={showingCurrentMonth && day === now.getDate() ? styles.today : ''}>{day}</time>
                  : <span key={`empty-${index}`} />
              ))}
            </div>
          </GlassCard>
        )}
      </DraggableCard>
    );
  }

  function renderPomodoroCard() {

    return (
      <DraggableCard
        key="pomodoro"
        id="pomodoro"
        z={cardMenu?.id === 'pomodoro' ? 40 : undefined}
        onDragMove={handleDragMove}
        onDrop={handleDrop}
      >
        {(
          <GlassCard
            className={styles.bookmarkCard}
            style={cardStyle('pomodoro')}
          >
            <header>
              <h2>Pomodoro</h2>
              <div
                className={`${styles.cardActions} ${cardMenu?.id === 'pomodoro' ? styles.actionsOpen : ''}`}
                onPointerDown={(event) => event.stopPropagation()}
              >
                <div className={styles.menuWrap}>
                  <button type="button" aria-label="Pomodoro options" onClick={() => toggleCardMenu('pomodoro', 'pomodoro')}>
                    <MoreHorizontal size={16} />
                  </button>
                  {cardMenu?.id === 'pomodoro' && (
                    <div className={styles.cardMenu}>
                      <button type="button" className={styles.danger} onClick={handleMenuDelete}>
                        <Trash2 size={15} /> {cardMenu.confirm ? 'Confirm delete?' : 'Delete'}
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </header>
            <Pomodoro />
          </GlassCard>
        )}
      </DraggableCard>
    );
  }

  function renderNoteCard(note) {

    return (
      <DraggableCard
        key={note.id}
        id={note.id}
        z={cardMenu?.id === note.id ? 40 : undefined}
        onDragMove={handleDragMove}
        onDrop={handleDrop}
      >
        {(
          <GlassCard
            className={styles.bookmarkCard}
            style={cardStyle(note.id)}
          >
            <header>
              <h2>Notes</h2>
              <div
                className={`${styles.cardActions} ${cardMenu?.id === note.id ? styles.actionsOpen : ''}`}
                onPointerDown={(event) => event.stopPropagation()}
              >
                <div className={styles.menuWrap}>
                  <button type="button" aria-label="Note options" onClick={() => toggleCardMenu(note.id, 'note')}>
                    <MoreHorizontal size={16} />
                  </button>
                  {cardMenu?.id === note.id && (
                    <div className={styles.cardMenu}>
                      <button type="button" className={styles.danger} onClick={handleMenuDelete}>
                        <Trash2 size={15} /> {cardMenu.confirm ? 'Confirm delete?' : 'Delete'}
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </header>
            <textarea
              className={styles.noteTextarea}
              value={note.text}
              onChange={(event) => dispatch({ type: 'note/update', payload: { noteId: note.id, text: event.target.value } })}
              onPointerDown={(event) => event.stopPropagation()}
              placeholder="Write anything..."
            />
          </GlassCard>
        )}
      </DraggableCard>
    );
  }

  function openAddBookmark(cardId) {
    setLinkPopover({ cardId, step: 'url', url: '', title: '', description: '' });
  }

  function handleAddLink() {
    if (!linkPopover) {
      return;
    }

    if (linkPopover.step === 'url') {
      const raw = linkPopover.url.trim();
      if (!raw) {
        return;
      }
      const normalized = /^(https?:\/\/)/i.test(raw) ? raw : `https://${raw}`;
      const host = getHostname(normalized).replace(/^www\./, '');
      setLinkPopover({ ...linkPopover, step: 'details', url: normalized, title: host || raw });
      return;
    }

    const fallbackTitle = getHostname(linkPopover.url).replace(/^www\./, '') || linkPopover.url;
    dispatch({
      type: 'bookmark/create',
      payload: {
        cardId: linkPopover.cardId,
        title: linkPopover.title.trim() || fallbackTitle,
        url: linkPopover.url,
        description: linkPopover.description.trim()
      }
    });
    setLinkPopover(null);
  }

  function openEditBookmark(bookmark) {
    setModal({ type: 'bookmark', bookmarkId: bookmark.id, title: bookmark.title, url: bookmark.url });
  }

  function handleBookmarkSubmit(event) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const payload = {
      title: String(data.get('title') ?? '').trim(),
      url: String(data.get('url') ?? '').trim()
    };

    if (!payload.title || !payload.url) {
      return;
    }

    dispatch({
      type: modal.bookmarkId ? 'bookmark/update' : 'bookmark/create',
      payload: { ...payload, bookmarkId: modal.bookmarkId, cardId: modal.cardId }
    });
    setModal(null);
  }

  function handleCardSubmit(event) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const title = String(data.get('title') ?? '').trim();

    if (!title) {
      return;
    }

    dispatch({ type: 'card/create', payload: { title } });
    setModal(null);
  }

  return (
    <main
      // Keyed off the stored wallpaper, which is known on the first paint, rather
      // than the decoded media — otherwise the built-in forest image showed for a
      // beat before a custom wallpaper finished loading.
      className={`${styles.shell} ${(activeWallpaper?.kind ?? 'default') === 'default' ? '' : styles.shellCustom}`}
      style={themeVars}
    >
      {wallpaperMedia.kind === 'image' && (
        <div
          className={styles.wallpaperLayer}
          style={{ backgroundImage: `url(${wallpaperMedia.url})`, filter: wallpaperFilter }}
          aria-hidden="true"
        />
      )}
      {wallpaperMedia.kind === 'video' && (
        <video
          ref={wallpaperVideoRef}
          className={styles.wallpaperLayer}
          style={{ filter: wallpaperFilter }}
          src={wallpaperMedia.url}
          autoPlay
          loop
          muted
          playsInline
          aria-hidden="true"
        />
      )}
      {dimAmount > 0 && (
        <div className={styles.wallpaperDim} style={{ opacity: dimAmount }} aria-hidden="true" />
      )}
      <div className={styles.ambient} aria-hidden="true" />
      <section className={styles.topBar} aria-label="Dashboard controls">
        <WorkspaceSelector />
        {widgetSettings.search && (
          <SearchBar
            settings={settings}
            searchUrl={(q) => searchUrlFor(settings, q)}
            engineLabel={SEARCH_ENGINES[settings.searchEngine ?? 'google']?.label ?? 'Google'}
          />
        )}
        <div className={styles.widgetCluster}>
          {widgetSettings.weather && (
            <GlassCard className={styles.miniWidget} title={weather?.label ?? weatherError ?? 'Loading weather'}>
              <small>{weather?.place ?? location}</small>
              <strong>
                {weather
                  ? `${weather.temperature}°${units === 'fahrenheit' ? 'F' : 'C'}`
                  : (weatherError ? '--' : '...')}
              </strong>
              {weather && <span className={styles.weatherLabel}>{weather.label}</span>}
            </GlassCard>
          )}
          {widgetSettings.clock && (
            <GlassCard className={styles.miniWidget}>
              <small>{now.toLocaleDateString([], { weekday: 'short', day: '2-digit', month: 'short' })}</small>
              <strong>
                {now.toLocaleTimeString([], {
                  hour: '2-digit',
                  minute: '2-digit',
                  hour12: settings.clockFormat !== '24h'
                })}
              </strong>
            </GlassCard>
          )}
        </div>
      </section>

      <motion.section
        className={styles.dashboard}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.55, ease: 'easeOut' }}
      >
        <div className={styles.canvas} aria-label={`${activeWorkspace.name} bookmarks`}>
          {activeWorkspace.cards.length === 0 && (activeWorkspace.notes ?? []).length === 0 && (
            <div className={styles.emptyState}>
              <h2>Make this tab yours</h2>
              <p>Add bookmark cards, notes, and widgets to build your own home page.</p>
              <button type="button" onClick={() => setModal({ type: 'card' })}>Add your first card</button>
            </div>
          )}
          {displayColumns.map((column, columnIndex) => (
            <div className={styles.column} data-column={columnIndex} key={columnIndex}>
              {column.map((entityId) => renderEntity(entityId))}
            </div>
          ))}
        </div>
      </motion.section>

      {linkPopover && (
        <>
          <div className={styles.popoverBackdrop} onPointerDown={() => setLinkPopover(null)} />
          <motion.form
            className={styles.linkPopover}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            onSubmit={(event) => {
              event.preventDefault();
              handleAddLink();
            }}
          >
            <input
              value={linkPopover.url}
              placeholder="Paste URL..."
              autoFocus
              onChange={(event) => setLinkPopover({ ...linkPopover, url: event.target.value })}
            />
            {linkPopover.step === 'details' && (
              <>
                <input
                  value={linkPopover.title}
                  aria-label="Link title"
                  onChange={(event) => setLinkPopover({ ...linkPopover, title: event.target.value })}
                />
                <input
                  value={linkPopover.description}
                  placeholder="Description (optional)"
                  onChange={(event) => setLinkPopover({ ...linkPopover, description: event.target.value })}
                />
              </>
            )}
            <div className={styles.popoverActions}>
              <button type="button" onClick={() => setLinkPopover(null)}>Cancel</button>
              <button type="submit" className={styles.popoverPrimary}>Add Link</button>
            </div>
          </motion.form>
        </>
      )}

      {launcherOpen && (
        <Suspense fallback={null}>
          <QuickLauncher
          bookmarks={allBookmarks}
          onClose={() => setLauncherOpen(false)}
          openInNewTab={settings.openInNewTab}
            searchUrl={(q) => searchUrlFor(settings, q)}
          />
        </Suspense>
      )}

      <AnimatePresence>
        {undoOffer && (
          <motion.div
            className={styles.undoToast}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 16 }}
            role="status"
          >
            <span>{undoOffer.label}</span>
            <button type="button" onClick={applyUndo}>Undo</button>
            <button type="button" aria-label="Dismiss" className={styles.undoClose} onClick={() => setUndoOffer(null)}>
              <X size={14} />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      <aside className={styles.toolbar} aria-label="Dashboard toolbar">
        <motion.div className={styles.toolbarRail} initial={{ opacity: 0, x: 18 }} animate={{ opacity: 1, x: 0 }}>
          <AnimatePresence>
            {toolbarOpen && (
              <>
                <motion.button
                  type="button"
                  className={styles.railButton}
                  aria-label="Search bookmarks"
                  onClick={() => setModal({ type: 'search' })}
                  initial={{ opacity: 0, scale: 0.6 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.6 }}
                >
                  <Search size={20} />
                </motion.button>
                <motion.button
                  type="button"
                  className={styles.railButton}
                  aria-label="Wallpaper"
                  onClick={() => setModal({ type: 'wallpaper' })}
                  initial={{ opacity: 0, scale: 0.6 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.6 }}
                >
                  <Image size={20} />
                </motion.button>
                <motion.button
                  type="button"
                  className={styles.railButton}
                  aria-label="Widgets"
                  onClick={() => setModal({ type: 'widgets' })}
                  initial={{ opacity: 0, scale: 0.6 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.6 }}
                >
                  <Grid2x2Plus size={20} />
                </motion.button>
              </>
            )}
          </AnimatePresence>
          <button
            type="button"
            className={`${styles.railButton} ${toolbarOpen ? styles.toggleOpen : styles.toggleClosed}`}
            aria-label={toolbarOpen ? 'Close menu' : 'Open menu'}
            onClick={() => setToolbarOpen((open) => !open)}
          >
            {toolbarOpen ? <X size={22} /> : <Menu size={26} />}
          </button>
          <button
            type="button"
            className={`${styles.railButton} ${styles.settingsButton}`}
            aria-label="Open settings"
            onClick={() => setModal({ type: 'settings' })}
          >
            <Settings size={20} />
          </button>
        </motion.div>
      </aside>

      <AnimatePresence>
        {modal?.type === 'bookmark' && (
          <DashboardModal title={modal.bookmarkId ? 'Edit bookmark' : 'Add bookmark'} onClose={() => setModal(null)}>
            <form className={styles.form} onSubmit={handleBookmarkSubmit}>
              <label>
                Title
                <input name="title" defaultValue={modal.title} autoFocus />
              </label>
              <label>
                URL
                <input name="url" defaultValue={modal.url} placeholder="https://example.com" />
              </label>
              <button type="submit">Save</button>
            </form>
          </DashboardModal>
        )}

        {modal?.type === 'card' && (
          <DashboardModal title="Add card" onClose={() => setModal(null)}>
            <form className={styles.form} onSubmit={handleCardSubmit}>
              <label>
                Card name
                <input name="title" autoFocus />
              </label>
              <button type="submit">Create</button>
            </form>
          </DashboardModal>
        )}

        {modal?.type === 'search' && (
          <DashboardModal title="Search bookmarks" onClose={() => setModal(null)}>
            <div className={styles.searchPanel}>
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search..." autoFocus />
              <div>
                {searchResults.map((bookmark) => (
                  <a key={bookmark.id} href={bookmark.url}>
                    <span>{bookmark.title}</span>
                    <small>{bookmark.cardTitle}</small>
                  </a>
                ))}
              </div>
            </div>
          </DashboardModal>
        )}

        {modal?.type === 'widgets' && (
          <>
            <motion.div
              className={styles.widgetsBackdrop}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setModal(null)}
            />
            <motion.section
              className={styles.widgetsPanel}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 16 }}
              aria-label="Widgets"
            >
              <h3>Widgets</h3>
              <div className={styles.widgetList}>
                <div className={styles.widgetRow}>
                  <span><Columns3 size={18} /> Board</span>
                  <button type="button" className={styles.addPill} onClick={() => setModal({ type: 'card' })}>Add</button>
                </div>
                <div className={styles.widgetRow}>
                  <span><Pencil size={18} /> Notes</span>
                  <button
                    type="button"
                    className={styles.addPill}
                    onClick={() => {
                      dispatch({ type: 'note/create' });
                      setModal(null);
                    }}
                  >
                    Add
                  </button>
                </div>
                <div className={styles.widgetRow}>
                  <span><Calendar size={18} /> Calendar</span>
                  <button
                    type="button"
                    className={styles.addPill}
                    onClick={() => {
                      dispatch({ type: 'calendar/show' });
                      setModal(null);
                    }}
                  >
                    Add
                  </button>
                </div>
                <div className={styles.widgetRow}>
                  <span><Timer size={18} /> Pomodoro</span>
                  <button
                    type="button"
                    className={styles.addPill}
                    onClick={() => {
                      dispatch({ type: 'pomodoro/show' });
                      setModal(null);
                    }}
                  >
                    Add
                  </button>
                </div>
                <div className={styles.widgetRow}>
                  <span><Clock size={18} /> Clock</span>
                  <button
                    type="button"
                    className={`${styles.toggleSwitch} ${widgetSettings.clock ? styles.toggleSwitchOn : ''}`}
                    role="switch"
                    aria-checked={widgetSettings.clock}
                    aria-label="Toggle clock widget"
                    onClick={() => toggleWidget('clock')}
                  >
                    <span className={styles.toggleKnob} />
                  </button>
                </div>
                <div className={styles.widgetRow}>
                  <span><Search size={18} /> Search</span>
                  <button
                    type="button"
                    className={`${styles.toggleSwitch} ${widgetSettings.search ? styles.toggleSwitchOn : ''}`}
                    role="switch"
                    aria-checked={widgetSettings.search}
                    aria-label="Toggle search widget"
                    onClick={() => toggleWidget('search')}
                  >
                    <span className={styles.toggleKnob} />
                  </button>
                </div>
                <div className={styles.widgetRow}>
                  <span><Cloud size={18} /> Weather</span>
                  <button
                    type="button"
                    className={`${styles.toggleSwitch} ${widgetSettings.weather ? styles.toggleSwitchOn : ''}`}
                    role="switch"
                    aria-checked={widgetSettings.weather}
                    aria-label="Toggle weather widget"
                    onClick={() => toggleWidget('weather')}
                  >
                    <span className={styles.toggleKnob} />
                  </button>
                </div>
              </div>
              <form className={styles.locationRow} onSubmit={applyLocation}>
                <input value={locationInput} onChange={(event) => setLocationInput(event.target.value)} placeholder="Location" />
                <button type="submit">Apply</button>
              </form>
            </motion.section>
          </>
        )}

        {modal?.type === 'wallpaper' && (
          <Suspense fallback={null}><WallpaperModal
            current={activeWallpaper}
            workspaceName={activeWorkspace.name}
            onSelect={(wallpaper, scope) => dispatch({
              type: 'wallpaper/set',
              payload: scope === 'workspace' ? { scope: 'workspace', wallpaper } : { wallpaper }
            })}
            onRemoveUpload={(uploadId) => dispatch({ type: 'wallpaper/scrub', payload: { uploadId } })}
            onClose={() => setModal(null)}
          /></Suspense>
        )}

        {modal?.type === 'settings' && (
          <DashboardModal title="Settings" onClose={() => setModal(null)}>
            <div className={styles.settingsPanel}>
              <div className={styles.settingsGroup}>
                <span>Clock</span>
                <div className={styles.segmented}>
                  {['12h', '24h'].map((value) => (
                    <button
                      key={value}
                      type="button"
                      className={(settings.clockFormat ?? '12h') === value ? styles.segmentOn : ''}
                      onClick={() => dispatch({ type: 'settings/update', payload: { clockFormat: value } })}
                    >
                      {value}
                    </button>
                  ))}
                </div>
              </div>

              <div className={styles.settingsGroup}>
                <span>Temperature</span>
                <div className={styles.segmented}>
                  {[['celsius', '°C'], ['fahrenheit', '°F']].map(([value, label]) => (
                    <button
                      key={value}
                      type="button"
                      className={units === value ? styles.segmentOn : ''}
                      onClick={() => dispatch({ type: 'settings/update', payload: { weatherUnits: value } })}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              <div className={styles.settingsGroup}>
                <span>Search with</span>
                <div className={styles.segmented}>
                  {Object.entries(SEARCH_ENGINES).map(([value, engine]) => (
                    <button
                      key={value}
                      type="button"
                      className={(settings.searchEngine ?? 'google') === value ? styles.segmentOn : ''}
                      onClick={() => dispatch({ type: 'settings/update', payload: { searchEngine: value } })}
                    >
                      {engine.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className={styles.settingsGroup}>
                <span>Open links in</span>
                <div className={styles.segmented}>
                  {[[false, 'Same tab'], [true, 'New tab']].map(([value, label]) => (
                    <button
                      key={label}
                      type="button"
                      className={Boolean(settings.openInNewTab) === value ? styles.segmentOn : ''}
                      onClick={() => dispatch({ type: 'settings/update', payload: { openInNewTab: value } })}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              <div className={styles.settingsGroup}>
                <span>Dim wallpaper</span>
                <input
                  className={styles.slider}
                  type="range"
                  min="0"
                  max="70"
                  value={Math.round(dimAmount * 100)}
                  aria-label="Dim wallpaper"
                  onChange={(event) => dispatch({ type: 'settings/update', payload: { wallpaperDim: Number(event.target.value) / 100 } })}
                />
              </div>

              <div className={styles.settingsGroup}>
                <span>Blur wallpaper</span>
                <input
                  className={styles.slider}
                  type="range"
                  min="0"
                  max="24"
                  value={blurPx}
                  aria-label="Blur wallpaper"
                  onChange={(event) => dispatch({ type: 'settings/update', payload: { wallpaperBlur: Number(event.target.value) } })}
                />
              </div>

              <button type="button" onClick={() => setModal({ type: 'card' })}>Add card</button>
              <button type="button" onClick={() => {
                const name = window.prompt('New workspace name', 'New board');
                if (name?.trim()) {
                  dispatch({ type: 'workspace/create', payload: { name: name.trim() } });
                  setModal(null);
                }
              }}>Create workspace</button>

              <button type="button" onClick={handleImportChromeBookmarks}>Import bookmarks from Chrome</button>
              <button type="button" onClick={() => BackupService.export(state)}>Export backup (.json)</button>
              <label className={styles.fileButton}>
                Import backup (.json)
                <input
                  type="file"
                  accept="application/json"
                  hidden
                  onChange={(event) => {
                    handleImportBackup(event.target.files?.[0]);
                    event.target.value = '';
                  }}
                />
              </label>

              {importNotice && <p className={styles.notice}>{importNotice}</p>}

              {snapshots.length > 0 && (
                <div className={styles.snapshotList}>
                  <span>Automatic backups</span>
                  {snapshots.map((snapshot) => (
                    <button
                      key={snapshot.at}
                      type="button"
                      className={styles.snapshotRow}
                      onClick={() => {
                        const { isReady, ...current } = state;
                        dispatch({ type: 'dashboard/import', payload: snapshot.state });
                        offerUndo('Restored a backup', current);
                        setModal(null);
                      }}
                    >
                      <span>{new Date(snapshot.at).toLocaleString([], { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
                      <span className={styles.snapshotMeta}>
                        {snapshot.state?.workspaces?.[0]?.cards?.reduce((n, c) => n + (c.bookmarks?.length ?? 0), 0) ?? 0} links
                      </span>
                    </button>
                  ))}
                </div>
              )}

              <button type="button" onClick={() => dispatch({ type: 'layout/reset' })}>Reset layout</button>
              <button type="button" onClick={() => {
                if (window.confirm('Erase all cards, notes and settings?')) {
                  dispatch({ type: 'dashboard/reset' });
                }
              }}>Reset dashboard</button>
            </div>
          </DashboardModal>
        )}
      </AnimatePresence>
    </main>
  );
}

function DashboardModal({ title, children, onClose }) {
  return (
    <motion.div className={styles.modalBackdrop} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <motion.section className={styles.modal} initial={{ scale: 0.96, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.96, y: 20 }}>
        <header>
          <h2>{title}</h2>
          <button type="button" aria-label="Close" onClick={onClose}><X size={18} /></button>
        </header>
        {children}
      </motion.section>
    </motion.div>
  );
}
