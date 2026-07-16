/** Match a word or phrase without allowing substrings inside larger words. */
export function containsSignal(text: string, signal: string): boolean {
  const normalizedText = text.toLowerCase().replace(/[^a-z0-9\s-]/g, " ").replace(/\s+/g, " ").trim();
  const normalizedSignal = signal.toLowerCase().replace(/[^a-z0-9\s-]/g, " ").replace(/\s+/g, " ").trim();
  if (!normalizedSignal) return false;
  const escaped = normalizedSignal.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+");
  return new RegExp(`(?:^|[^a-z0-9])${escaped}(?=$|[^a-z0-9])`).test(normalizedText);
}
