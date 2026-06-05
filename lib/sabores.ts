export function normalizeSaboresList(items: string[] | null | undefined) {
  if (!Array.isArray(items)) {
    return [];
  }

  const expanded = items.flatMap((item) => {
    const cleaned = item.trim();

    if (!cleaned) {
      return [];
    }

    if (/^\s*-\s*/.test(cleaned) && cleaned.includes(" - ")) {
      return cleaned
        .replace(/^\s*-\s*/, "")
        .split(/\s+-\s+/)
        .map((part) => part.trim())
        .filter(Boolean);
    }

    return cleaned
      .split(/[\n,;]+/)
      .map((part) => part.replace(/^\s*-\s*/, "").trim())
      .filter(Boolean);
  });

  return Array.from(new Set(expanded));
}
