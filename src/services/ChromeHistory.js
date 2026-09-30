// Pages from the browser's own history. Only available inside the extension,
// and only after the "history" permission has been granted.
const available = () => Boolean(globalThis.chrome?.history?.search);

export async function searchPages(text, limit = 3) {
  const query = text.trim();
  if (!available() || !query) {
    return [];
  }

  try {
    const results = await chrome.history.search({ text: query, maxResults: 40, startTime: 0 });
    const seen = new Set();
    return results
      .filter((page) => /^https?:\/\//i.test(page.url))
      // Typed visits are the strongest "I go here on purpose" signal, then plain visits.
      .sort((a, b) => (b.typedCount * 5 + b.visitCount) - (a.typedCount * 5 + a.visitCount))
      .filter((page) => {
        const key = page.url.replace(/[#?].*$/, '').replace(/\/$/, '');
        if (seen.has(key)) {
          return false;
        }
        seen.add(key);
        return true;
      })
      .slice(0, limit)
      .map((page) => ({ url: page.url, title: page.title || page.url }));
  } catch {
    return [];
  }
}
