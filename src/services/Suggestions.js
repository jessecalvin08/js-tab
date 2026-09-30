// Live query suggestions. Only Google and DuckDuckGo are supported; the typed text
// is sent to whichever engine is asked.
export async function fetchSuggestions(engine, query, signal) {
  if (engine === 'duckduckgo') {
    const response = await fetch(`https://duckduckgo.com/ac/?q=${encodeURIComponent(query)}&type=list`, { signal });
    const data = await response.json();
    return Array.isArray(data?.[1]) ? data[1] : [];
  }
  const response = await fetch(`https://suggestqueries.google.com/complete/search?client=chrome&q=${encodeURIComponent(query)}`, { signal });
  const data = await response.json();
  return Array.isArray(data?.[1]) ? data[1] : [];
}
