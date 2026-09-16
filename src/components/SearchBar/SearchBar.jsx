import { motion } from 'framer-motion';
import { Search } from 'lucide-react';
import styles from './SearchBar.module.css';

export function SearchBar({ settings, searchUrl, engineLabel = 'Google' }) {
  function handleSubmit(event) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const query = String(formData.get('query') ?? '').trim();

    if (!query) {
      return;
    }

    const target = /^https?:\/\//i.test(query) ? query : searchUrl(query);

    if (settings?.openInNewTab) {
      window.open(target, '_blank', 'noreferrer');
    } else {
      window.location.assign(target);
    }
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
      <Search size={20} aria-hidden="true" />
      <input name="query" type="search" placeholder="Search..." aria-label="Search Google or open a URL" />
      <button type="submit" aria-label={`Search with ${engineLabel}`}>{engineLabel.charAt(0)}</button>
    </motion.form>
  );
}
