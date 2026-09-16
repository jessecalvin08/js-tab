import { Pause, Play, RotateCcw } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import styles from './Pomodoro.module.css';

const MODES = {
  focus: { label: 'Focus', minutes: 25 },
  short: { label: 'Short break', minutes: 5 },
  long: { label: 'Long break', minutes: 15 }
};

function format(seconds) {
  const mins = Math.floor(seconds / 60).toString().padStart(2, '0');
  const secs = Math.floor(seconds % 60).toString().padStart(2, '0');
  return `${mins}:${secs}`;
}

export function Pomodoro() {
  const [mode, setMode] = useState('focus');
  const [remaining, setRemaining] = useState(MODES.focus.minutes * 60);
  const [running, setRunning] = useState(false);
  const [completed, setCompleted] = useState(0);
  const deadlineRef = useRef(null);

  useEffect(() => {
    if (!running) {
      deadlineRef.current = null;
      return undefined;
    }

    // Anchor to a wall-clock deadline so the countdown stays accurate even when
    // the tab is backgrounded and timers get throttled.
    deadlineRef.current = Date.now() + remaining * 1000;

    const tick = () => {
      const left = Math.max(0, Math.round((deadlineRef.current - Date.now()) / 1000));
      setRemaining(left);

      if (left === 0) {
        setRunning(false);
        setCompleted((count) => (mode === 'focus' ? count + 1 : count));
      }
    };

    const timer = setInterval(tick, 250);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running, mode]);

  function switchMode(next) {
    setMode(next);
    setRunning(false);
    setRemaining(MODES[next].minutes * 60);
  }

  function reset() {
    setRunning(false);
    setRemaining(MODES[mode].minutes * 60);
  }

  const total = MODES[mode].minutes * 60;
  const progress = total ? 1 - remaining / total : 0;

  return (
    <div className={styles.pomodoro}>
      <div className={styles.modes}>
        {Object.entries(MODES).map(([key, value]) => (
          <button
            key={key}
            type="button"
            className={mode === key ? styles.modeActive : ''}
            onClick={() => switchMode(key)}
          >
            {value.label}
          </button>
        ))}
      </div>

      <div className={styles.time} role="timer" aria-live="off">{format(remaining)}</div>

      <div className={styles.track} aria-hidden="true">
        <span style={{ width: `${Math.round(progress * 100)}%` }} />
      </div>

      <div className={styles.controls}>
        <button type="button" onClick={() => setRunning((value) => !value)}>
          {running ? <Pause size={16} /> : <Play size={16} />}
          {running ? 'Pause' : 'Start'}
        </button>
        <button type="button" onClick={reset} aria-label="Reset timer">
          <RotateCcw size={16} />
        </button>
      </div>

      {completed > 0 && <small className={styles.count}>{completed} focus session{completed === 1 ? '' : 's'} done</small>}
    </div>
  );
}
