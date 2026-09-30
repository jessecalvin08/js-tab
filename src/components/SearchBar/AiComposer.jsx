import { ArrowRight, FileText, History, Mic, Plus, ScanSearch, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { PlusMenu } from './PlusMenu.jsx';
import {
  MAX_ATTACHMENT_BYTES,
  askGemini,
  fileToPart,
  getGeminiKey,
  saveGeminiKey
} from '../../services/GeminiService.js';
import { addHistory, loadHistory, matchHistory, removeHistory } from '../../services/SearchHistory.js';
import styles from './AiComposer.module.css';

const FILE_ACCEPT = 'application/pdf,text/*,image/*,.md,.csv,.json';
const IMAGE_ACCEPT = 'image/*';

const SUGGESTIONS = {
  document: ['Explain this document', 'Tell me more about this', 'What are the key points?'],
  image: ['What is in this image?', 'Describe this image in detail', 'Extract any text from this image']
};

function makeEntry(file) {
  const isImage = file.type.startsWith('image/');
  return {
    id: `${file.name}-${file.size}-${Math.random().toString(36).slice(2, 7)}`,
    file,
    isImage,
    previewUrl: isImage ? URL.createObjectURL(file) : null
  };
}

export function AiComposer({ initialText = '', intent = null, initialFiles = [], onClose }) {
  const fileInputRef = useRef(null);
  const inputRef = useRef(null);
  const recognitionRef = useRef(null);
  const controllerRef = useRef(null);
  const [text, setText] = useState(initialText);
  const [files, setFiles] = useState(() => initialFiles.filter((file) => file.size <= MAX_ATTACHMENT_BYTES).map(makeEntry));
  const filesRef = useRef(files);
  filesRef.current = files;
  const [mode, setMode] = useState(intent === 'create-images' ? 'image' : 'chat');
  const [model, setModel] = useState(intent === 'pro' ? 'pro' : 'fast');
  const [turns, setTurns] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);
  const [listening, setListening] = useState(false);
  const [apiKey, setApiKey] = useState(getGeminiKey);
  const [keyDraft, setKeyDraft] = useState('');
  const [needsKey, setNeedsKey] = useState(false);
  const [accept, setAccept] = useState(FILE_ACCEPT);
  const [history, setHistory] = useState(() => loadHistory('ai'));
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

  // Opening from "Add images" / "Add files" goes straight to the file picker. The
  // click that opened the composer is still a live user gesture here.
  useEffect(() => {
    if (intent === 'add-images' || intent === 'add-files') {
      openPicker(intent === 'add-images' ? IMAGE_ACCEPT : FILE_ACCEPT);
    } else {
      inputRef.current?.focus();
    }
    return () => {
      recognitionRef.current?.abort();
      controllerRef.current?.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => () => filesRef.current.forEach((item) => item.previewUrl && URL.revokeObjectURL(item.previewUrl)), []);

  function openPicker(nextAccept) {
    setAccept(nextAccept);
    setMenuOpen(false);
    // The accept attribute has to be applied before the dialog opens.
    requestAnimationFrame(() => fileInputRef.current?.click());
  }

  function handleMenuSelect(key) {
    if (key === 'add-images') {
      openPicker(IMAGE_ACCEPT);
    } else if (key === 'add-files') {
      openPicker(FILE_ACCEPT);
    } else if (key === 'create-images') {
      setMode((current) => (current === 'image' ? 'chat' : 'image'));
      setMenuOpen(false);
      inputRef.current?.focus();
    } else {
      setModel(key);
      setMode('chat');
      setMenuOpen(false);
      inputRef.current?.focus();
    }
  }

  function addFiles(picked) {
    const tooBig = picked.find((file) => file.size > MAX_ATTACHMENT_BYTES);
    setError(tooBig ? `${tooBig.name} is larger than 15 MB.` : '');
    setFiles((current) => [
      ...current,
      ...picked.filter((file) => file.size <= MAX_ATTACHMENT_BYTES).map(makeEntry)
    ]);
    inputRef.current?.focus();
  }

  function handleFiles(event) {
    const picked = Array.from(event.target.files ?? []);
    event.target.value = '';
    addFiles(picked);
  }

  function handlePaste(event) {
    const pasted = Array.from(event.clipboardData?.files ?? []);
    if (pasted.length) {
      event.preventDefault();
      addFiles(pasted);
    }
  }

  function handleDrop(event) {
    const dropped = Array.from(event.dataTransfer?.files ?? []);
    if (dropped.length) {
      event.preventDefault();
      addFiles(dropped);
    }
  }

  function removeFile(id) {
    setFiles((current) => current.filter((item) => item.id !== id));
  }

  async function handleVoice() {
    if (listening) {
      recognitionRef.current?.stop();
      return;
    }
    setError('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((track) => track.stop());
    } catch {
      setError('Microphone blocked. Allow it from the lock icon in the address bar.');
      return;
    }
    const recognition = new SpeechRecognition();
    recognition.lang = navigator.language || 'en-US';
    recognition.interimResults = true;
    recognition.onresult = (event) => {
      setText(Array.from(event.results).map((result) => result[0].transcript).join(''));
    };
    recognition.onend = () => setListening(false);
    recognition.onerror = () => setListening(false);
    recognitionRef.current = recognition;
    setListening(true);
    recognition.start();
  }

  async function send(overrideText, keyOverride) {
    const question = (overrideText ?? text).trim();
    const key = keyOverride ?? apiKey;
    if ((!question && !files.length) || busy) {
      return;
    }
    if (!key) {
      setNeedsKey(true);
      return;
    }

    setError('');
    setNeedsKey(false);
    setBusy(true);
    if (question) {
      setHistory(addHistory('ai', question));
    }
    const attached = files;
    let turnAdded = false;
    const controller = new AbortController();
    controllerRef.current = controller;

    try {
      const fileParts = await Promise.all(attached.map((item) => fileToPart(item.file)));
      const parts = [
        ...fileParts,
        { text: question || (attached.length ? 'Describe this.' : '') }
      ];
      const history = turns.map((turn) => ({ role: turn.role, parts: turn.parts }));

      turnAdded = true;
      setTurns((current) => [...current, {
        role: 'user',
        parts,
        text: question,
        chips: attached.map((item) => ({ id: item.id, name: item.file.name, previewUrl: item.isImage ? URL.createObjectURL(item.file) : null }))
      }]);
      setText('');
      setFiles([]);

      const answer = await askGemini({ key, mode, model, history, parts, signal: controller.signal });
      setTurns((current) => [...current, {
        role: 'model',
        parts: [{ text: answer.text || '(image)' }],
        text: answer.text,
        images: answer.images
      }]);
    } catch (caught) {
      if (caught.name === 'AbortError') {
        return;
      }
      if ((caught.status === 400 && /api key/i.test(caught.message)) || caught.status === 403) {
        setNeedsKey(true);
        setApiKey('');
        setError('Gemini rejected that API key. Paste a valid one to continue.');
      } else if (caught.status === 429) {
        setError('Gemini rate limit reached. Wait a moment and try again.');
      } else {
        setError(caught.message || 'Something went wrong.');
      }
      // The failed turn was already shown; put the question back so it can be retried.
      if (turnAdded) {
        setTurns((current) => current.slice(0, -1));
      }
      setText(question);
      setFiles(attached);
    } finally {
      setBusy(false);
    }
  }

  function handleSaveKey(event) {
    event.preventDefault();
    const key = keyDraft.trim();
    if (!key) {
      return;
    }
    saveGeminiKey(key);
    setApiKey(key);
    setKeyDraft('');
    setNeedsKey(false);
    setError('');
    send(undefined, key);
  }

  function handleKeyDown(event) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      send();
    } else if (event.key === 'Escape') {
      onClose();
    }
  }

  const suggestions = !turns.length && files.length
    ? (files.every((item) => item.isImage) ? SUGGESTIONS.image : SUGGESTIONS.document)
    : [];
  const recent = !turns.length && !files.length ? matchHistory(history, text, 6) : [];
  const canSend = (text.trim() || files.length) && !busy;
  const selectedKeys = [mode === 'image' ? 'create-images' : model];

  return (
    <div className={styles.panel} role="dialog" aria-label="Ask Gemini" onDragOver={(event) => event.preventDefault()} onDrop={handleDrop}>
      <input ref={fileInputRef} type="file" accept={accept} multiple hidden onChange={handleFiles} />

      <div className={styles.head}>
        <div className={styles.plusWrap}>
          <button
            type="button"
            className={`${styles.icon} ${menuOpen ? styles.iconOpen : ''}`}
            aria-label="Add to prompt"
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((open) => !open)}
          >
            <Plus size={22} />
          </button>
          {menuOpen && <PlusMenu onSelect={handleMenuSelect} selected={selectedKeys} />}
        </div>
        <input
          ref={inputRef}
          className={styles.input}
          value={text}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
          onFocus={() => setMenuOpen(false)}
          placeholder={listening ? 'Listening…' : (mode === 'image' ? 'Describe an image to create' : 'Ask anything')}
          aria-label="Ask anything"
          autoComplete="off"
        />
        {SpeechRecognition && (
          <button
            type="button"
            className={`${styles.icon} ${listening ? styles.listening : ''}`}
            aria-label={listening ? 'Stop voice input' : 'Voice input'}
            aria-pressed={listening}
            onClick={handleVoice}
          >
            <Mic size={20} />
          </button>
        )}
        <button type="button" className={styles.icon} aria-label="Close" onClick={onClose}>
          <X size={20} />
        </button>
      </div>

      <div className={styles.attachRow}>
        <div className={styles.chips}>
          {files.map((item) => (
            <span className={styles.chip} key={item.id}>
              {item.previewUrl
                ? <img src={item.previewUrl} alt="" />
                : <span className={styles.fileBadge}><FileText size={16} aria-hidden="true" /></span>}
              <span className={styles.chipName}>{item.file.name}</span>
              <button type="button" aria-label={`Remove ${item.file.name}`} onClick={() => removeFile(item.id)}><X size={13} /></button>
            </span>
          ))}
          <button type="button" className={styles.pill} onClick={() => setModel((current) => (current === 'fast' ? 'pro' : 'fast'))} aria-label="Switch model">
            {model === 'fast' ? 'Fast' : 'Pro'}
          </button>
          {mode === 'image' && (
            <button type="button" className={styles.pill} onClick={() => setMode('chat')} aria-label="Turn off image creation">
              🍌 Create images <X size={12} />
            </button>
          )}
        </div>
        <button type="button" className={styles.send} aria-label="Send" disabled={!canSend} onClick={() => send()}>
          <ArrowRight size={20} />
        </button>
      </div>

      {turns.length > 0 && (
        <div className={styles.thread} aria-live="polite">
          {turns.map((turn, index) => (
            <div className={turn.role === 'user' ? styles.userTurn : styles.modelTurn} key={index}>
              {turn.chips?.length > 0 && (
                <div className={styles.turnChips}>
                  {turn.chips.map((chip) => (
                    chip.previewUrl
                      ? <img key={chip.id} src={chip.previewUrl} alt={chip.name} />
                      : <span className={styles.chip} key={chip.id}><span className={styles.fileBadge}><FileText size={16} /></span><span className={styles.chipName}>{chip.name}</span></span>
                  ))}
                </div>
              )}
              {turn.text && <p>{turn.text}</p>}
              {turn.images?.map((image, imageIndex) => (
                <img className={styles.generated} key={imageIndex} src={`data:${image.mimeType};base64,${image.data}`} alt="Generated" />
              ))}
            </div>
          ))}
          {busy && <p className={styles.thinking}>Thinking…</p>}
        </div>
      )}
      {busy && turns.length === 0 && <p className={styles.thinking}>Thinking…</p>}

      {needsKey && (
        <form className={styles.keyForm} onSubmit={handleSaveKey}>
          <p>
            Add a Gemini API key to get answers here. It's free from{' '}
            <a href="https://aistudio.google.com/apikey" target="_blank" rel="noreferrer">Google AI Studio</a>,
            and it stays in this browser only.
          </p>
          <div>
            <input
              type="password"
              value={keyDraft}
              onChange={(event) => setKeyDraft(event.target.value)}
              placeholder="Paste API key"
              aria-label="Gemini API key"
              autoComplete="off"
              autoFocus
            />
            <button type="submit" disabled={!keyDraft.trim()}>Save &amp; send</button>
          </div>
        </form>
      )}

      {error && <p className={styles.error} role="alert">{error}</p>}

      {recent.length > 0 && (
        <ul className={styles.suggestions}>
          {recent.map((item) => (
            <li key={item} className={styles.recentRow}>
              <button type="button" className={styles.recentMain} onClick={() => send(item)}>
                <History size={20} aria-hidden="true" /> <span>{item}</span>
              </button>
              <button type="button" className={styles.recentRemove} aria-label={`Remove ${item} from history`} onClick={() => setHistory(removeHistory('ai', item))}>
                <X size={15} />
              </button>
            </li>
          ))}
        </ul>
      )}

      {suggestions.length > 0 && (
        <ul className={styles.suggestions}>
          {suggestions.map((suggestion) => (
            <li key={suggestion}>
              <button type="button" onClick={() => send(suggestion)}>
                <ScanSearch size={20} aria-hidden="true" /> {suggestion}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
