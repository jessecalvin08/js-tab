import { Calculator as CalculatorIcon } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Calculator } from './Calculator.jsx';
import styles from './Calculator.module.css';

// Small icon that opens the calculator as an overlay on this tab.
export function CalculatorLauncher() {
  const [open, setOpen] = useState(false);
  const buttonRef = useRef(null);

  useEffect(() => {
    if (!open) {
      buttonRef.current?.focus({ preventScroll: true });
    }
  }, [open]);

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        className={styles.launcher}
        aria-label="Open calculator"
        aria-haspopup="dialog"
        aria-expanded={open}
        title="Calculator"
        onClick={() => setOpen(true)}
      >
        <CalculatorIcon size={18} />
      </button>
      {open && createPortal(<Calculator onClose={() => setOpen(false)} />, document.body)}
    </>
  );
}
