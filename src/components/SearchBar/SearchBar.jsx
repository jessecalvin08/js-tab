import { motion } from 'framer-motion';
import { Mic, Plus, ScanSearch, Sparkles } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
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
    go(/^https?:\/\//i.test(value) ? value : searchUrl(value));
  }

  function handleSubmit(event) {
    event.preventDefault();
    search(active >= 0 ? suggestions[active] : text);
  }

  function handleKeyDown(event) {
    if (event.key === 'Escape') {
      setSuggestions([]);
      setMenuOpen(false);
      return;
    }
    if (!suggestions.length || !(event.key === 'ArrowDown' || event.key === 'ArrowUp')) {
      return;
    }
    event.preventDefault();
    const step = event.key === 'ArrowDown' ? 1 : -1;
    // -1 is the typed text itself; arrows cycle through it and the suggestions.
    setActive((current) => {
      const slots = suggestions.length + 1;
      return ((current + 1 + step + slots) % slots) - 1;
    });
  }

  function openComposer(intent = null) {
    setMenuOpen(false);
    setSuggestions([]);
    setComposer({ intent, text });
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

  const showSuggestions = focused && !menuOpen && suggestions.length > 0;

  return (
    <motion.form
      ref={formRef}
      className={styles.search}
      onSubmit={handleSubmit}
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

      {composer && <AiComposer initialText={composer.text} intent={composer.intent} onClose={closeComposer} />}

      {showSuggestions && (
        <ul className={styles.suggestions} role="listbox">
          {suggestions.map((suggestion, index) => (
            <li key={suggestion} role="option" aria-selected={index === active}>
              <button
                type="button"
                className={`${styles.suggestion} ${index === active ? styles.suggestionActive : ''}`}
                onMouseEnter={() => setActive(index)}
                onClick={() => search(suggestion)}
              >
                {suggestion}
              </button>
            </li>
          ))}
        </ul>
      )}
    </motion.form>
  );
}
