export const BookmarkService = {
  isAvailable() {
    return Boolean(globalThis.chrome?.bookmarks?.getTree);
  },

  // Flattens Chrome's bookmark tree into one group per folder so each folder
  // arrives as its own card. Folders with no direct links are skipped.
  async readGroups({ limitPerGroup = 40 } = {}) {
    if (!this.isAvailable()) {
      throw new Error('Chrome bookmarks are not available here');
    }

    const tree = await chrome.bookmarks.getTree();
    const groups = [];

    const walk = (node, path) => {
      if (!node.children) {
        return;
      }

      const links = node.children
        .filter((child) => child.url && /^https?:/i.test(child.url))
        .slice(0, limitPerGroup)
        .map((child) => ({ title: child.title || child.url, url: child.url }));

      if (links.length) {
        groups.push({ title: node.title || path || 'Bookmarks', bookmarks: links });
      }

      node.children
        .filter((child) => child.children)
        .forEach((child) => walk(child, child.title));
    };

    tree.forEach((root) => walk(root, ''));
    return groups;
  }
};
