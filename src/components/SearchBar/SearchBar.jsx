import { motion } from 'framer-motion';
import { Mic, Plus, ScanSearch, Sparkles } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import styles from './SearchBar.module.css';

const LENS_URL = 'https://lens.google.com/';
const AI_MODE_URL = 'https://www.google.com/search?udm=50';

export function SearchBar({ settings, searchUrl, engineLabel = 'Google' }) {
  const inputRef = useRef(null);
  const recognitionRef = useRef(null);
  const [listening, setListening] = useState(false);
  const isGoogle = (settings?.searchEngine ?? 'google') === 'google';
  const SpeechRecognition = typeof window === 'undefined'
    ? null
    : window.SpeechRecognition || window.webkitSpeechRecognition;

  useEffect(() => () => recognitionRef.current?.abort(), []);

  function go(target) {
    if (settings?.openInNewTab) {
      window.open(target, '_blank', 'noreferrer');
    } else {
      window.location.assign(target);
    }
  }

  function search(query) {
    const text = query.trim();
    if (!text) {
      return;
    }
    go(/^https?:\/\//i.test(text) ? text : searchUrl(text));
  }

  function handleSubmit(event) {
    event.preventDefault();
    search(inputRef.current?.value ?? '');
  }

  function handleAiMode() {
    const text = (inputRef.current?.value ?? '').trim();
    go(text ? `${AI_MODE_URL}&q=${encodeURIComponent(text)}` : AI_MODE_URL);
  }

  function handleVoice() {
    if (listening) {
      recognitionRef.current?.stop();
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = navigator.language || 'en-US';
    recognition.interimResults = true;
    recognition.onresult = (event) => {
      const transcript = Array.from(event.results).map((result) => result[0].transcript).join('');
      if (inputRef.current) {
        inputRef.current.value = transcript;
      }
      if (event.results[event.results.length - 1].isFinal) {
        search(transcript);
      }
    };
    recognition.onend = () => setListening(false);
    recognition.onerror = () => setListening(false);
    recognitionRef.current = recognition;
    setListening(true);
    recognition.start();
  }

  return (
    <motion.form
      className={styles.search}
      onSubmit={handleSubmit}
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35 }}
      role="search"
    >
      <button type="button" className={styles.icon} aria-label="New search" onClick={() => inputRef.current?.focus()}>
        <Plus size={22} />
      </button>
      <input
        ref={inputRef}
        name="query"
        type="search"
        placeholder={isGoogle ? 'Ask Google' : `Search ${engineLabel}`}
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
          <button type="button" className={styles.aiMode} onClick={handleAiMode}>
            <Sparkles size={16} aria-hidden="true" /> AI Mode
          </button>
        </>
      )}
    </motion.form>
  );
}
