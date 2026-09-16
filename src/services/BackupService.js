// Uploaded wallpaper blobs live in IndexedDB and are deliberately left out of
// backups so the exported file stays small enough to email or message.
const EXPORT_VERSION = 1;

// Rolling local snapshots, so a bad delete or a reset is recoverable even when
// nobody remembered to export first.
const SNAPSHOT_KEY = 'js-tab-snapshots';
const MAX_SNAPSHOTS = 5;
const SNAPSHOT_INTERVAL_MS = 10 * 60 * 1000;

export const SnapshotService = {
  list() {
    try {
      return JSON.parse(window.localStorage.getItem(SNAPSHOT_KEY) || '[]');
    } catch {
      return [];
    }
  },

  // Called on every save, but only actually records occasionally so the history
  // spans hours rather than the last few keystrokes.
  maybeRecord(state) {
    try {
      const snapshots = this.list();
      const newest = snapshots[0];

      if (newest && Date.now() - newest.at < SNAPSHOT_INTERVAL_MS) {
        return;
      }

      const { isReady, ...rest } = state;
      const next = [{ at: Date.now(), state: rest }, ...snapshots].slice(0, MAX_SNAPSHOTS);
      window.localStorage.setItem(SNAPSHOT_KEY, JSON.stringify(next));
    } catch {
      // snapshots are best-effort
    }
  }
};

export const BackupService = {
  export(state) {
    const { isReady, ...rest } = state;
    const payload = {
      app: "J's TAB",
      exportVersion: EXPORT_VERSION,
      exportedAt: new Date().toISOString(),
      state: rest
    };

    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const stamp = new Date().toISOString().slice(0, 10);

    link.href = url;
    link.download = `js-tab-backup-${stamp}.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  },

  async read(file) {
    const text = await file.text();
    const parsed = JSON.parse(text);
    const state = parsed?.state ?? parsed;

    if (!state || !Array.isArray(state.workspaces) || !state.workspaces.length) {
      throw new Error('That file does not look like a J\'s TAB backup.');
    }

    // Uploaded wallpapers cannot travel with the file, so fall back to default
    // rather than pointing at a blob id that does not exist on this machine.
    const scrub = (wallpaper) => (wallpaper?.kind === 'upload' ? { kind: 'default' } : wallpaper);

    return {
      ...state,
      wallpaper: scrub(state.wallpaper),
      workspaces: state.workspaces.map((workspace) => ({
        ...workspace,
        wallpaper: scrub(workspace.wallpaper)
      }))
    };
  }
};
