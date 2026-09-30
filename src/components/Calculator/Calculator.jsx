import { useCallback, useEffect, useRef, useState } from 'react';
import styles from './Calculator.module.css';

const SYMBOLS = { '+': '+', '-': '−', '*': '×', '/': '÷' };
const MAX_DIGITS = 15;

function compute(a, op, b) {
  switch (op) {
    case '+': return a + b;
    case '-': return a - b;
    case '*': return a * b;
    case '/': return b === 0 ? NaN : a / b;
    default: return b;
  }
}

function format(value) {
  if (!Number.isFinite(value)) {
    return 'Error';
  }
  const rounded = Number(value.toPrecision(12));
  const abs = Math.abs(rounded);
  if (abs !== 0 && (abs >= 1e15 || abs < 1e-9)) {
    return rounded.toExponential(6).replace(/\.?0+e/, 'e');
  }
  return String(rounded);
}

// Adds thousands separators to the integer part only, so "1234." and "0.50" stay as typed.
function pretty(display) {
  if (display === 'Error' || display.includes('e')) {
    return display;
  }
  const [whole, fraction] = display.split('.');
  const sign = whole.startsWith('-') ? '-' : '';
  const digits = whole.replace('-', '').replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${sign}${digits}${fraction !== undefined ? `.${fraction}` : ''}`;
}

const KEYS = [
  { label: 'AC', action: 'clear', kind: 'fn' },
  { label: '±', action: 'sign', kind: 'fn' },
  { label: '%', action: 'percent', kind: 'fn' },
  { label: '÷', action: 'op', value: '/', kind: 'op' },
  { label: '7', action: 'digit', value: '7' },
  { label: '8', action: 'digit', value: '8' },
  { label: '9', action: 'digit', value: '9' },
  { label: '×', action: 'op', value: '*', kind: 'op' },
  { label: '4', action: 'digit', value: '4' },
  { label: '5', action: 'digit', value: '5' },
  { label: '6', action: 'digit', value: '6' },
  { label: '−', action: 'op', value: '-', kind: 'op' },
  { label: '1', action: 'digit', value: '1' },
  { label: '2', action: 'digit', value: '2' },
  { label: '3', action: 'digit', value: '3' },
  { label: '+', action: 'op', value: '+', kind: 'op' },
  { label: '0', action: 'digit', value: '0', wide: true },
  { label: '.', action: 'dot' },
  { label: '=', action: 'equals', kind: 'op' }
];

export function Calculator({ onClose }) {
  const panelRef = useRef(null);
  const [display, setDisplay] = useState('0');
  const [acc, setAcc] = useState(null);
  const [op, setOp] = useState(null);
  const [fresh, setFresh] = useState(true);
  const [line, setLine] = useState('');

  const reset = useCallback(() => {
    setDisplay('0');
    setAcc(null);
    setOp(null);
    setFresh(true);
    setLine('');
  }, []);

  const press = useCallback((action, value) => {
    const failed = display === 'Error';
    const current = failed ? 0 : Number(display);

    switch (action) {
      case 'digit':
        if (fresh || failed) {
          setDisplay(value);
          setFresh(false);
          if (failed) {
            setAcc(null);
            setOp(null);
            setLine('');
          }
        } else if (display.replace(/[-.]/g, '').length < MAX_DIGITS) {
          setDisplay(display === '0' ? value : display + value);
        }
        break;
      case 'dot':
        if (fresh || failed) {
          setDisplay('0.');
          setFresh(false);
        } else if (!display.includes('.')) {
          setDisplay(`${display}.`);
        }
        break;
      case 'op': {
        if (failed) {
          break;
        }
        let base = current;
        if (acc !== null && op && !fresh) {
          base = compute(acc, op, current);
          setDisplay(format(base));
        }
        setAcc(Number.isFinite(base) ? base : null);
        setOp(Number.isFinite(base) ? value : null);
        setFresh(true);
        setLine(Number.isFinite(base) ? `${pretty(format(base))} ${SYMBOLS[value]}` : '');
        break;
      }
      case 'equals': {
        if (failed || !op || acc === null) {
          break;
        }
        const result = compute(acc, op, current);
        setLine(`${pretty(format(acc))} ${SYMBOLS[op]} ${pretty(format(current))} =`);
        setDisplay(format(result));
        setAcc(null);
        setOp(null);
        setFresh(true);
        break;
      }
      case 'percent':
        if (!failed) {
          setDisplay(format(current / 100));
          setFresh(true);
        }
        break;
      case 'sign':
        if (!failed && current !== 0) {
          setDisplay(display.startsWith('-') ? display.slice(1) : `-${display}`);
        }
        break;
      case 'back':
        if (failed) {
          reset();
        } else if (!fresh) {
          const next = display.slice(0, -1);
          setDisplay(next === '' || next === '-' ? '0' : next);
          if (next === '' || next === '-') {
            setFresh(true);
          }
        }
        break;
      case 'clear':
        reset();
        break;
      default:
        break;
    }
  }, [display, acc, op, fresh, reset]);

  useEffect(() => {
    panelRef.current?.focus({ preventScroll: true });
  }, []);

  useEffect(() => {
    function handleKey(event) {
      if (event.ctrlKey || event.metaKey || event.altKey) {
        return;
      }
      const { key } = event;
      if (key === 'Escape') {
        onClose();
      } else if (/^\d$/.test(key)) {
        press('digit', key);
      } else if (key === '.' || key === ',') {
        press('dot');
      } else if (['+', '-', '*', '/'].includes(key)) {
        event.preventDefault();
        press('op', key);
      } else if (key === 'x' || key === 'X') {
        press('op', '*');
      } else if (key === 'Enter' || key === '=') {
        event.preventDefault();
        press('equals');
      } else if (key === 'Backspace') {
        press('back');
      } else if (key === '%') {
        press('percent');
      } else if (key === 'c' || key === 'C' || key === 'Delete') {
        press('clear');
      } else {
        return;
      }
      // Keep a focused keypad button from also "clicking" on Enter / Space.
      if (key === 'Enter') {
        event.preventDefault();
      }
    }
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [press, onClose]);

  const text = pretty(display);
  const size = text.length > 13 ? 'small' : text.length > 9 ? 'medium' : 'large';

  return (
    <div className={styles.backdrop} onPointerDown={(event) => event.target === event.currentTarget && onClose()}>
      <div ref={panelRef} className={styles.panel} role="dialog" aria-label="Calculator" tabIndex={-1}>
        <div className={styles.screen} aria-live="polite">
          <span className={styles.line}>{line || ' '}</span>
          <span className={`${styles.value} ${styles[size]}`}>{text}</span>
        </div>
        <div className={styles.keys}>
          {KEYS.map((key) => (
            <button
              type="button"
              key={key.label}
              className={`${styles.key} ${key.kind === 'op' ? styles.op : key.kind === 'fn' ? styles.fn : ''} ${key.wide ? styles.wide : ''} ${key.action === 'op' && op === key.value && fresh ? styles.opActive : ''}`}
              onClick={() => press(key.action, key.value)}
            >
              {key.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
