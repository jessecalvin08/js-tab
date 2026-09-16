import { motion } from 'framer-motion';
import { CornerDownLeft, Search } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { faviconUrl, letterAvatar } from '../../utils/favicon.js';
import styles from './QuickLauncher.module.css';

// Subsequence match, so "gh" finds "github.com" and "drv" finds "drive.google.com".
function score(haystack, needle) {
  const text = haystack.toLowerCase();
  const query = needle.toLowerCase();

  if (!query) {
    return 0;
  }

  const direct = text.indexOf(query);
  if (direct === 0) {
    return 1000;
  }
  if (direct > 0) {
    return 700 - direct;
  }

  let index = 0;
  let hits = 0;
  for (const char of query) {
    const found = text.indexOf(char, index);
    if (found === -1) {
      return -1;
    }
    hits += 1;
    index = found + 1;
  }

  return hits * 10 - index;
}

export function QuickLauncher({ bookmarks, onClose, openInNewTab, searchUrl }) {
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const listRef = useRef(null);

  const results = useMemo(() => {
    if (!query.trim()) {
      return bookmarks.slice(0, 8);
    }

    return bookmarks
      .map((bookmark) => ({
        bookmark,
        rank: Math.max(
          score(bookmark.title ?? '', query),
          score(bookmark.url ?? '', query),
          score(bookmark.cardTitle ?? '', query) - 50
        )
      }))
      .filter((entry) => entry.rank > 0)
      .sort((a, b) => b.rank - a.rank)
      .slice(0, 8)
      .map((entry) => entry.bookmark);
  }, [bookmarks, query]);

  useEffect(() => {
    setActive(0);
  }, [query]);

  function open(bookmark) {
    if (!bookmark?.url) {
      return;
    }
    if (openInNewTab) {
      window.open(bookmark.url, '_blank', 'noreferrer');
    } else {
      window.location.assign(bookmark.url);
    }
  }

  function handleKeyDown(event) {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActive((index) => (index + 1) % Math.max(results.length, 1));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActive((index) => (index - 1 + results.length) % Math.max(results.length, 1));
    } else if (event.key === 'Enter') {
      event.preventDefault();
      const chosen = results[active];
      if (chosen) {
        open(chosen);
      } else if (query.trim()) {
        const target = searchUrl ? searchUrl(query.trim()) : `https://www.google.com/search?q=${encodeURIComponent(query.trim())}`;
        if (openInNewTab) {
          window.open(target, '_blank', 'noreferrer');
        } else {
          window.location.assign(target);
        }
      }
    } else if (event.key === 'Escape') {
      onClose();
    }
  }

  return (
    <div className={styles.backdrop} onPointerDown={onClose}>
      <motion.div
        className={styles.panel}
        initial={{ opacity: 0, y: -8, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        onPointerDown={(event) => event.stopPropagation()}
        role="dialog"
        aria-label="Quick launcher"
      >
        <div className={styles.field}>
          <Search size={18} />
          <input
            autoFocus
            value={query}
            placeholder="Jump to a bookmark, or search the web..."
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={handleKeyDown}
            aria-label="Quick search"
          />
          <kbd>esc</kbd>
        </div>

        <div className={styles.results} ref={listRef}>
          {results.map((bookmark, index) => (
            <button
              key={bookmark.id}
              type="button"
              className={index === active ? styles.active : ''}
              onMouseEnter={() => setActive(index)}
              onClick={() => open(bookmark)}
            >
              <img
                src={faviconUrl(bookmark.url)}
                alt=""
                onError={(event) => { event.currentTarget.src = letterAvatar(bookmark.url, bookmark.title); }}
              />
              <span className={styles.title}>{bookmark.title}</span>
              <span className={styles.card}>{bookmark.cardTitle}</span>
              {index === active && <CornerDownLeft size={14} />}
            </button>
          ))}

          {results.length === 0 && (
            <p className={styles.empty}>
              {query.trim() ? 'No bookmark matches — press Enter to search the web.' : 'No bookmarks yet.'}
            </p>
          )}
        </div>
      </motion.div>
    </div>
  );
}
