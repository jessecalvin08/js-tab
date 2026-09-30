import { Gauge, ImagePlus, Paperclip, Zap } from 'lucide-react';
import styles from './PlusMenu.module.css';

const GROUPS = [
  {
    items: [
      { key: 'add-images', label: 'Add images', icon: ImagePlus },
      { key: 'add-files', label: 'Add files', icon: Paperclip }
    ]
  },
  {
    title: 'Tools',
    items: [{ key: 'create-images', label: 'Create images', emoji: '🍌' }]
  },
  {
    title: 'Gemini models',
    items: [
      { key: 'fast', label: 'Fast', icon: Zap },
      { key: 'pro', label: 'Pro', icon: Gauge }
    ]
  }
];

export function PlusMenu({ onSelect, selected = [] }) {
  return (
    <div className={styles.menu} role="menu">
      {GROUPS.map((group, index) => (
        <div className={styles.group} key={index}>
          {group.title && <span className={styles.groupTitle}>{group.title}</span>}
          {group.items.map(({ key, label, icon: Icon, emoji }) => (
            <button
              type="button"
              role="menuitem"
              className={`${styles.item} ${selected.includes(key) ? styles.selected : ''}`}
              key={key}
              onClick={() => onSelect(key)}
            >
              {Icon ? <Icon size={18} aria-hidden="true" /> : <span className={styles.emoji} aria-hidden="true">{emoji}</span>}
              {label}
            </button>
          ))}
        </div>
      ))}
    </div>
  );
}
