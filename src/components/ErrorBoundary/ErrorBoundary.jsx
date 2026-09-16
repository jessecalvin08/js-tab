import { Component } from 'react';
import styles from './ErrorBoundary.module.css';

// A render crash used to take the whole new tab down to a blank page with no way
// back. This catches it and always leaves the user an escape hatch.
export class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error('J\'s TAB crashed:', error, info);
  }

  handleReload = () => {
    window.location.reload();
  };

  handleResetLayout = async () => {
    try {
      const key = 'verdant-dashboard-state';
      if (globalThis.chrome?.storage?.local) {
        const stored = await chrome.storage.local.get(key);
        const state = stored[key];
        if (state?.workspaces) {
          state.workspaces = state.workspaces.map((workspace) => ({ ...workspace, columns: [[], [], [], []] }));
          await chrome.storage.local.set({ [key]: state });
        }
      } else {
        const raw = window.localStorage.getItem(key);
        if (raw) {
          const state = JSON.parse(raw);
          state.workspaces = (state.workspaces ?? []).map((workspace) => ({ ...workspace, columns: [[], [], [], []] }));
          window.localStorage.setItem(key, JSON.stringify(state));
        }
      }
    } catch {
      // fall through to reload regardless
    }
    window.location.reload();
  };

  handleHardReset = async () => {
    const confirmed = window.confirm('Erase all cards, notes and settings? This cannot be undone.');
    if (!confirmed) {
      return;
    }

    try {
      if (globalThis.chrome?.storage?.local) {
        await chrome.storage.local.clear();
      }
      window.localStorage.clear();
    } catch {
      // ignore
    }
    window.location.reload();
  };

  render() {
    if (!this.state.error) {
      return this.props.children;
    }

    return (
      <div className={styles.wrap}>
        <div className={styles.panel}>
          <h1>Something went wrong</h1>
          <p>Your bookmarks are safe. Try one of these:</p>
          <div className={styles.actions}>
            <button type="button" onClick={this.handleReload}>Reload page</button>
            <button type="button" onClick={this.handleResetLayout}>Reset layout</button>
            <button type="button" className={styles.danger} onClick={this.handleHardReset}>Erase everything</button>
          </div>
          <details>
            <summary>Technical details</summary>
            <pre>{String(this.state.error?.stack || this.state.error)}</pre>
          </details>
        </div>
      </div>
    );
  }
}
