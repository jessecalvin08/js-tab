import { motion } from 'framer-motion';
import { Calculator, History, Mic, Plus, ScanSearch, Search, Sparkles, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { searchPages } from '../../services/ChromeHistory.js';
import { addHistory, loadHistory, matchHistory, removeHistory } from '../../services/SearchHistory.js';
import { faviconUrl } from '../../utils/favicon.js';
import { quickAnswer } from '../../utils/quickAnswer.js';
import { AiComposer } from './AiComposer.jsx';
import { PlusMenu } from './PlusMenu.jsx';
import styles from './SearchBar.module.css';

const LENS_URL = 'https://lens.google.com/';

async function fetchSuggestions(engine, query, signal) {
  if (engine === 'duckduckgo') {
    const response = await fetch(`https://duckduckgo.com/ac/?q=${encodeURIComponent(query)}&type=list`, { signal });
    const data = await response.json();
    return Array.isArray(data?.[1]) ? data[1] : [];
  }
  const response = await fetch(`https://suggestqueries.google.com/complete/search?client=chrome&q=${encodeURIComponent(query)}`, { signal });
  const data = await response.json();
  return Array.isArray(data?.[1]) ? data[1] : [];
}

export function SearchBar({ settings, searchUrl, engineLabel = 'Google' }) {
  const formRef = useRef(null);
  const inputRef = useRef(null);
  const recognitionRef = useRef(null);
  const [listening, setListening] = useState(false);
  const [voiceError, setVoiceError] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);
  const [text, setText] = useState('');
  const [suggestions, setSuggestions] = useState([]);
  const [active, setActive] = useState(-1);
  const [focused, setFocused] = useState(false);
  const [composer, setComposer] = useState(null);
  const [history, setHistory] = useState(() => loadHistory('search'));
  const [pages, setPages] = useState([]);
  const [copied, setCopied] = useState(false);
  const engine = settings?.searchEngine ?? 'google';
  const isGoogle = engine === 'google';
  const canSuggest = isGoogle || engine === 'duckduckgo';
  const SpeechRecognition = typeof window === 'undefined'
    ? null
    : window.SpeechRecognition || window.webkitSpeechRecognition;

  useEffect(() => () => recognitionRef.current?.abort(), []);

  useEffect(() => {
    function handlePointerDown(event) {
      if (!formRef.current?.contains(event.target)) {
        setMenuOpen(false);
        setFocused(false);
      }
    }
    document.addEventListener('pointerdown', handlePointerDown);
    return () => document.removeEventListener('pointerdown', handlePointerDown);
  }, []);

  useEffect(() => {
    const query = text.trim();
    if (!canSuggest || !query) {
      setSuggestions([]);
      return undefined;
    }
    const controller = new AbortController();
    const timer = setTimeout(() => {
      fetchSuggestions(engine, query, controller.signal)
        .then((list) => {
          setSuggestions(list.slice(0, 6));
          setActive(-1);
        })
        .catch(() => {});
    }, 120);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [text, engine, canSuggest]);

  useEffect(() => {
    if (!text.trim()) {
      setPages([]);
      return undefined;
    }
    let cancelled = false;
    const timer = setTimeout(() => {
      searchPages(text).then((found) => {
        if (!cancelled) {
          setPages(found);
        }
      });
    }, 120);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [text]);

  // Past searches, then pages you have visited, then live suggestions that are not repeats.
  const items = useMemo(() => {
    const past = matchHistory(history, text, text.trim() ? 3 : 8).map((value) => ({ kind: 'past', value }));
    const visited = pages.map((page) => ({ kind: 'page', value: page.title, url: page.url }));
    const seen = new Set(past.map((item) => item.value.toLowerCase()));
    const fresh = suggestions
      .filter((value) => !seen.has(value.toLowerCase()))
      .map((value) => ({ kind: 'suggest', value }));
    const answer = quickAnswer(text);
    const head = answer ? [{ kind: 'answer', value: answer.result, label: answer.label, copy: answer.copy }] : [];
    return [...head, ...past, ...visited, ...fresh].slice(0, 8);
  }, [history, pages, suggestions, text]);

  function copyAnswer(item) {
    navigator.clipboard?.writeText(item.copy).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }).catch(() => {});
  }

  function go(target) {
    if (settings?.openInNewTab) {
      window.open(target, '_blank', 'noreferrer');
    } else {
      window.location.assign(target);
    }
  }

  function search(query) {
    const value = query.trim();
    if (!value) {
      return;
    }
    if (!/^https?:\/\//i.test(value)) {
      setHistory(addHistory('search', value));
    }
    go(/^https?:\/\//i.test(value) ? value : searchUrl(value));
  }

  function handleSubmit(event) {
    event.preventDefault();
    const chosen = active >= 0 ? items[active] : null;
    if (chosen?.kind === 'page') {
      go(chosen.url);
      return;
    }
    if (chosen?.kind === 'answer') {
      copyAnswer(chosen);
      return;
    }
    search(chosen ? chosen.value : text);
  }

  function handleKeyDown(event) {
    if (event.key === 'Escape') {
      setFocused(false);
      setMenuOpen(false);
      return;
    }
    if (!items.length || !(event.key === 'ArrowDown' || event.key === 'ArrowUp')) {
      return;
    }
    event.preventDefault();
    const step = event.key === 'ArrowDown' ? 1 : -1;
    // -1 is the typed text itself; arrows cycle through it and the suggestions.
    setActive((current) => {
      const slots = items.length + 1;
      return ((current + 1 + step + slots) % slots) - 1;
    });
  }

  function openComposer(intent = null, files = []) {
    setMenuOpen(false);
    setSuggestions([]);
    setComposer({ intent, text, files });
  }

  // Pasting or dropping an image opens the AI panel with it attached.
  function handlePaste(event) {
    const pasted = Array.from(event.clipboardData?.files ?? []);
    if (pasted.length) {
      event.preventDefault();
      openComposer(null, pasted);
    }
  }

  function handleDrop(event) {
    const dropped = Array.from(event.dataTransfer?.files ?? []);
    if (dropped.length) {
      event.preventDefault();
      openComposer(null, dropped);
    }
  }

  function closeComposer() {
    setComposer(null);
    inputRef.current?.focus();
  }

  async function handleVoice() {
    if (listening) {
      recognitionRef.current?.stop();
      return;
    }

    setVoiceError('');
    // Speech recognition on an extension page fails silently with "not-allowed" until
    // the extension origin has been granted the microphone, so ask for it explicitly.
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((track) => track.stop());
    } catch {
      setVoiceError('Microphone blocked. Allow it from the lock icon in the address bar, or chrome://settings/content/microphone.');
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = navigator.language || 'en-US';
    recognition.interimResults = true;
    recognition.onresult = (event) => {
      const transcript = Array.from(event.results).map((result) => result[0].transcript).join('');
      setText(transcript);
      if (event.results[event.results.length - 1].isFinal) {
        search(transcript);
      }
    };
    recognition.onend = () => setListening(false);
    recognition.onerror = (event) => {
      setListening(false);
      if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
        setVoiceError('Microphone blocked. Allow it from the lock icon in the address bar.');
      } else if (event.error === 'network') {
        setVoiceError('Voice search needs an internet connection.');
      } else if (event.error === 'no-speech') {
        setVoiceError("Didn't catch that. Try again.");
      }
    };
    recognitionRef.current = recognition;
    setListening(true);
    recognition.start();
  }

  const showSuggestions = focused && !menuOpen && !composer && items.length > 0;

  return (
    <motion.form
      ref={formRef}
      className={styles.search}
      onSubmit={handleSubmit}
      onDragOver={(event) => event.preventDefault()}
      onDrop={handleDrop}
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35 }}
      role="search"
    >
      <button
        type="button"
        className={`${styles.icon} ${menuOpen ? styles.iconOpen : ''}`}
        aria-label="Add to search"
        aria-haspopup="menu"
        aria-expanded={menuOpen}
        onClick={() => setMenuOpen((open) => !open)}
      >
        <Plus size={22} />
      </button>
      <input
        ref={inputRef}
        name="query"
        type="search"
        value={text}
        onChange={(event) => setText(event.target.value)}
        onFocus={() => { setFocused(true); setMenuOpen(false); }}
        onClick={() => setFocused(true)}
        onPaste={handlePaste}
        onKeyDown={handleKeyDown}
        placeholder={voiceError || (listening ? 'Listening…' : (isGoogle ? 'Ask Google' : `Search ${engineLabel}`))}
        aria-label={`Search ${engineLabel} or open a URL`}
        autoComplete="off"
      />
      {SpeechRecognition && (
        <button
          type="button"
          className={`${styles.icon} ${listening ? styles.listening : ''}`}
          aria-label={listening ? 'Stop voice search' : 'Search by voice'}
          aria-pressed={listening}
          onClick={handleVoice}
        >
          <Mic size={20} />
        </button>
      )}
      {isGoogle && (
        <>
          <button type="button" className={styles.icon} aria-label="Search with Google Lens" onClick={() => go(LENS_URL)}>
            <ScanSearch size={20} />
          </button>
          <button type="button" className={styles.aiMode} onClick={() => openComposer()}>
            <Sparkles size={16} aria-hidden="true" /> AI Mode
          </button>
        </>
      )}

      {menuOpen && <PlusMenu onSelect={openComposer} />}

      {composer && <AiComposer initialText={composer.text} intent={composer.intent} initialFiles={composer.files} onClose={closeComposer} />}

      {showSuggestions && (
        <ul className={styles.suggestions} role="listbox">
          {items.map((item, index) => (
            <li key={`${item.kind}-${item.url ?? item.value}`} role="option" aria-selected={index === active}>
              <div
                className={`${styles.suggestion} ${index === active ? styles.suggestionActive : ''}`}
                onMouseEnter={() => setActive(index)}
              >
                {item.kind === 'answer' ? (
                  <button type="button" className={`${styles.suggestionMain} ${styles.answer}`} onClick={() => copyAnswer(item)}>
                    <Calculator size={17} aria-hidden="true" />
                    <small>{item.label} =</small>
                    <strong>{item.value}</strong>
                    <em>{copied ? 'Copied' : 'Click to copy'}</em>
                  </button>
                ) : (
                <button
                  type="button"
                  className={styles.suggestionMain}
                  onClick={() => (item.kind === 'page' ? go(item.url) : search(item.value))}
                >
                  {item.kind === 'page' && <img className={styles.pageIcon} src={faviconUrl(item.url)} alt="" />}
                  {item.kind === 'past' && <History size={17} aria-hidden="true" />}
                  {item.kind === 'suggest' && <Search size={17} aria-hidden="true" />}
                  <span>{item.value}</span>
                  {item.kind === 'page' && <small>{item.url.replace(/^https?:\/\/(www\.)?/i, '').replace(/\/$/, '')}</small>}
                </button>
                )}
                {item.kind === 'past' && (
                  <button
                    type="button"
                    className={styles.suggestionRemove}
                    aria-label={`Remove ${item.value} from history`}
                    onClick={() => setHistory(removeHistory('search', item.value))}
                  >
                    <X size={15} />
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </motion.form>
  );
}
