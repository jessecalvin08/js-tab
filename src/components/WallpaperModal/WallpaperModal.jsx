import { motion } from 'framer-motion';
import { Trash2, UploadCloud, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { PRESET_WALLPAPERS } from '../../data/wallpapers.js';
import { WallpaperStore } from '../../services/WallpaperStore.js';
import styles from './WallpaperModal.module.css';

const MAX_UPLOAD_BYTES = 150 * 1024 * 1024;
// Hashing reads the whole file into memory on the main thread. Fine for a
// photo; a multi-hundred-MB video would stall the picker for seconds just to
// check for a duplicate, so large files skip the check and upload directly.
const HASH_CHECK_MAX_BYTES = 25 * 1024 * 1024;

function formatBytes(bytes) {
  if (!bytes) {
    return '0 MB';
  }
  const mb = bytes / (1024 * 1024);
  return mb >= 1024 ? `${(mb / 1024).toFixed(1)} GB` : `${mb.toFixed(0)} MB`;
}

export function WallpaperModal({ current, workspaceName, onSelect, onRemoveUpload, onClose }) {
  const [uploads, setUploads] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [usage, setUsage] = useState(null);
  const [scope, setScope] = useState('global');
  const inputRef = useRef(null);
  const urlsRef = useRef([]);

  async function refreshUsage() {
    try {
      const estimate = await navigator.storage?.estimate?.();
      if (estimate) {
        setUsage(estimate);
      }
    } catch {
      // usage display is optional
    }
  }

  async function refreshUploads() {
    const records = await WallpaperStore.list();
    urlsRef.current.forEach((url) => URL.revokeObjectURL(url));
    urlsRef.current = [];

    setUploads(records.map((record) => {
      const url = URL.createObjectURL(record.blob);
      urlsRef.current.push(url);
      return { ...record, url };
    }));
  }

  useEffect(() => {
    refreshUploads();
    refreshUsage();
    return () => urlsRef.current.forEach((url) => URL.revokeObjectURL(url));
  }, []);

  async function handleFiles(fileList) {
    const file = fileList?.[0];
    if (!file) {
      return;
    }

    if (!file.type.startsWith('image/') && !file.type.startsWith('video/')) {
      setError('Pick an image or video file.');
      return;
    }

    if (file.size > MAX_UPLOAD_BYTES) {
      setError(`That file is ${formatBytes(file.size)}. Keep uploads under ${formatBytes(MAX_UPLOAD_BYTES)}.`);
      return;
    }

    setError('');
    setBusy(true);

    try {
      // Browsing to the same file twice (or a re-download of it) shouldn't
      // create a second copy in "My uploads" — just select the existing one.
      const hash = file.size <= HASH_CHECK_MAX_BYTES ? await WallpaperStore.hashFile(file) : null;
      const duplicate = hash ? await WallpaperStore.findByHash(hash) : null;

      if (duplicate) {
        onSelect({ kind: 'upload', uploadId: duplicate.id, mediaKind: duplicate.kind }, scope);
        return;
      }

      const record = await WallpaperStore.add(file, hash);
      await refreshUploads();
      await refreshUsage();
      onSelect({ kind: 'upload', uploadId: record.id, mediaKind: record.kind }, scope);
    } catch {
      setError('Could not save that file. Storage may be full.');
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete(record) {
    await WallpaperStore.remove(record.id);
    // Clears the reference on every board that had this upload set, not just
    // the one currently open, so nothing is left pointing at a deleted blob.
    onRemoveUpload?.(record.id);
    await refreshUploads();
  }

  return (
    <div className={styles.backdrop} onPointerDown={onClose}>
      <motion.section
        className={styles.modal}
        initial={{ opacity: 0, scale: 0.97, y: 12 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        onPointerDown={(event) => event.stopPropagation()}
        aria-label="Wallpaper"
      >
        <header>
          <h2>Wallpaper</h2>
          <button type="button" aria-label="Close" onClick={onClose}><X size={18} /></button>
        </header>

        <div className={styles.body}>
          <div className={styles.scopeRow}>
            <span>Apply to</span>
            <div className={styles.segmented}>
              <button
                type="button"
                className={scope === 'global' ? styles.segmentOn : ''}
                onClick={() => setScope('global')}
              >
                All boards
              </button>
              <button
                type="button"
                className={scope === 'workspace' ? styles.segmentOn : ''}
                onClick={() => setScope('workspace')}
              >
                {workspaceName || 'This board'} only
              </button>
            </div>
          </div>

          <button
            type="button"
            className={styles.dropzone}
            onClick={() => inputRef.current?.click()}
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => {
              event.preventDefault();
              handleFiles(event.dataTransfer.files);
            }}
          >
            <UploadCloud size={26} />
            <strong>{busy ? 'Saving...' : 'Upload image or video'}</strong>
            <small>JPG · PNG · MP4</small>
          </button>
          <input
            ref={inputRef}
            type="file"
            accept="image/*,video/*"
            hidden
            onChange={(event) => {
              handleFiles(event.target.files);
              event.target.value = '';
            }}
          />

          {error && <p className={styles.error}>{error}</p>}

          {uploads.length > 0 && (
            <>
              <h3>My uploads</h3>
              <div className={styles.grid}>
                {uploads.map((record) => (
                  <div
                    key={record.id}
                    className={`${styles.tile} ${current?.uploadId === record.id ? styles.tileActive : ''}`}
                  >
                    <button
                      type="button"
                      className={styles.tileSelect}
                      aria-label={`Use ${record.name}`}
                      onClick={() => onSelect({ kind: 'upload', uploadId: record.id, mediaKind: record.kind }, scope)}
                    >
                      {record.kind === 'video'
                        ? <video src={record.url} muted playsInline preload="metadata" />
                        : <img src={record.url} alt="" />}
                      {record.kind === 'video' && <span className={styles.badge}>Video</span>}
                    </button>
                    <button
                      type="button"
                      className={styles.tileDelete}
                      aria-label={`Delete ${record.name}`}
                      onClick={() => handleDelete(record)}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
              </div>
            </>
          )}

          <h3>Presets</h3>
          <div className={styles.grid}>
            <button
              type="button"
              className={`${styles.tile} ${styles.tileSelect} ${!current || current.kind === 'default' ? styles.tileActive : ''}`}
              onClick={() => onSelect({ kind: 'default' }, scope)}
            >
              <span className={styles.defaultTile}>Default</span>
            </button>
            {PRESET_WALLPAPERS.map((wallpaper) => (
              <button
                key={wallpaper.id}
                type="button"
                className={`${styles.tile} ${styles.tileSelect} ${current?.presetId === wallpaper.id ? styles.tileActive : ''}`}
                title={`Photo by ${wallpaper.author}`}
                onClick={() => onSelect({ kind: 'preset', presetId: wallpaper.id, url: wallpaper.full }, scope)}
              >
                <img src={wallpaper.thumb} alt="" loading="lazy" />
              </button>
            ))}
          </div>
          <p className={styles.credit}>
            Preset photography from Unsplash contributors, served via picsum.photos.
            {usage?.usage ? ` · ${formatBytes(usage.usage)} of local storage used.` : ''}
          </p>
        </div>
      </motion.section>
    </div>
  );
}
