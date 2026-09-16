import { createRoot } from 'react-dom/client';
import { useEffect, useState } from 'react';
import './styles/popup.css';

const STORAGE_KEY = 'verdant-dashboard-state';
const MIRROR_KEY = `js-tab-sync:${STORAGE_KEY}`;

function hostnameOf(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

async function readState() {
  if (globalThis.chrome?.storage?.local) {
    const result = await chrome.storage.local.get(STORAGE_KEY);
    return result[STORAGE_KEY] ?? null;
  }
  try {
    return JSON.parse(window.localStorage.getItem(STORAGE_KEY) || 'null');
  } catch {
    return null;
  }
}

async function writeState(state) {
  if (globalThis.chrome?.storage?.local) {
    await chrome.storage.local.set({ [STORAGE_KEY]: state });
  }
  // Keep the new tab page's synchronous mirror in step so the saved link shows
  // up immediately rather than after the next full load.
  try {
    window.localStorage.setItem(MIRROR_KEY, JSON.stringify(state));
  } catch {
    // best effort
  }
}

function Popup() {
  const [tab, setTab] = useState(null);
  const [state, setState] = useState(null);
  const [title, setTitle] = useState('');
  const [saved, setSaved] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const [active] = await chrome.tabs.query({ active: true, currentWindow: true });
        setTab(active ?? null);
        setTitle(hostnameOf(active?.url ?? '') || active?.title || '');
      } catch {
        setError('Could not read the current tab.');
      }
      setState(await readState());
    })();
  }, []);

  const workspace = state?.workspaces?.find((entry) => entry.id === state.activeWorkspaceId) ?? state?.workspaces?.[0];
  const cards = workspace?.cards ?? [];

  async function saveTo(cardId) {
    if (!tab?.url || !workspace) {
      return;
    }

    const bookmark = {
      id: `bookmark-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      title: title.trim() || hostnameOf(tab.url) || tab.url,
      url: tab.url,
      description: ''
    };

    const next = {
      ...state,
      workspaces: state.workspaces.map((entry) => (
        entry.id === workspace.id
          ? {
              ...entry,
              cards: entry.cards.map((card) => (
                card.id === cardId ? { ...card, bookmarks: [...card.bookmarks, bookmark] } : card
              ))
            }
          : entry
      ))
    };

    await writeState(next);
    setState(next);
    setSaved(cards.find((card) => card.id === cardId)?.title ?? 'card');
    setTimeout(() => window.close(), 900);
  }

  if (error) {
    return <main className="popup"><p className="error">{error}</p></main>;
  }

  if (!state) {
    return <main className="popup"><p className="muted">Loading…</p></main>;
  }

  if (!cards.length) {
    return (
      <main className="popup">
        <h1>Save to J's TAB</h1>
        <p className="muted">No cards yet — open a new tab and create one first.</p>
      </main>
    );
  }

  return (
    <main className="popup">
      <h1>Save this tab</h1>
      <p className="url" title={tab?.url}>{tab?.url ?? ''}</p>

      <label className="field">
        Name
        <input value={title} onChange={(event) => setTitle(event.target.value)} />
      </label>

      {saved ? (
        <p className="saved">Saved to “{saved}”</p>
      ) : (
        <>
          <span className="label">Add to</span>
          <div className="cards">
            {cards.map((card) => (
              <button key={card.id} type="button" onClick={() => saveTo(card.id)}>
                <span>{card.title}</span>
                <small>{card.bookmarks.length}</small>
              </button>
            ))}
          </div>
        </>
      )}
    </main>
  );
}

createRoot(document.getElementById('popup-root')).render(<Popup />);
