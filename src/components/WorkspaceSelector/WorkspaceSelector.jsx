import { ChevronDown, Home, Plus } from 'lucide-react';
import { useState } from 'react';
import { GlassCard } from '../GlassCard/GlassCard.jsx';
import { useDashboard } from '../../context/DashboardContext.jsx';
import styles from './WorkspaceSelector.module.css';

export function WorkspaceSelector() {
  const { state, dispatch } = useDashboard();
  const [isOpen, setIsOpen] = useState(false);

  function createWorkspace() {
    const name = window.prompt('Workspace name', 'New board');

    if (name?.trim()) {
      dispatch({ type: 'workspace/create', payload: { name: name.trim() } });
      setIsOpen(false);
    }
  }

  return (
    <GlassCard className={styles.workspace}>
      <button type="button" className={styles.workspaceButton} aria-expanded={isOpen} aria-label="Select workspace" onClick={() => setIsOpen((value) => !value)}>
        <Home size={18} aria-hidden="true" />
        <span>{state.activeWorkspace.name}</span>
        <ChevronDown size={16} aria-hidden="true" />
      </button>
      <button type="button" className={styles.addButton} aria-label="Create workspace" onClick={createWorkspace}>
        <Plus size={18} aria-hidden="true" />
      </button>
      {isOpen && (
        <div className={styles.menu} role="menu">
          {state.workspaces.map((workspace) => (
            <button
              key={workspace.id}
              type="button"
              role="menuitem"
              onClick={() => {
                dispatch({ type: 'workspace/switch', payload: workspace.id });
                setIsOpen(false);
              }}
            >
              {workspace.name}
            </button>
          ))}
          <button type="button" role="menuitem" onClick={() => {
            const name = window.prompt('Rename workspace', state.activeWorkspace.name);
            if (name?.trim()) {
              dispatch({ type: 'workspace/rename', payload: { name: name.trim() } });
            }
            setIsOpen(false);
          }}>
            Rename current
          </button>
          <button type="button" role="menuitem" onClick={() => {
            dispatch({ type: 'workspace/delete' });
            setIsOpen(false);
          }}>
            Delete current
          </button>
        </div>
      )}
    </GlassCard>
  );
}
