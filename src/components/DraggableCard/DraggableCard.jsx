import { motion, useDragControls } from 'framer-motion';
import styles from './DraggableCard.module.css';

// Presses that land on these never drag the card: bookmark rows drag themselves,
// and controls/inputs need their normal click behaviour.
const NON_DRAG_TARGETS = '[data-row-id], button, a, input, textarea, select, [data-no-drag]';

// Cards sit in normal document flow inside flex columns — the browser owns their
// positions, so overlap cannot happen by construction.
//
// Nothing about this element changes while a drag is in flight: no React state,
// no prop churn. Toggling `layout` mid-gesture used to rebuild framer's
// projection and freeze the card a few pixels in, so the drag styling is handled
// entirely by `whileDrag` and CSS instead.
export function DraggableCard({ id, z, onDragMove, onDrop, children }) {
  const dragControls = useDragControls();

  return (
    <motion.div
      data-entity-id={id}
      layout="position"
      transition={{ type: 'spring', stiffness: 550, damping: 45 }}
      className={styles.draggable}
      style={{ zIndex: z }}
      drag
      dragListener={false}
      dragControls={dragControls}
      dragSnapToOrigin
      dragMomentum={false}
      dragElastic={0.08}
      whileDrag={{ scale: 1.02, zIndex: 60, cursor: 'grabbing' }}
      onPointerDown={(event) => {
        if (event.button !== 0) {
          return;
        }

        if (event.target?.closest?.(NON_DRAG_TARGETS)) {
          return;
        }

        dragControls.start(event);
      }}
      onDrag={(event, info) => onDragMove(id, event, info)}
      onDragEnd={(event, info) => onDrop(id, event, info)}
    >
      {children}
    </motion.div>
  );
}
