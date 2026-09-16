import clsx from '../../utils/clsx.js';
import styles from './GlassCard.module.css';

export function GlassCard({ as: Component = 'div', className, children, ...props }) {
  return (
    <Component className={clsx(styles.card, className)} {...props}>
      {children}
    </Component>
  );
}
