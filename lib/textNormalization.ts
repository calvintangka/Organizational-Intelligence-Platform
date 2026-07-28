/**
 * TODO-058 — Unicode-safe text folding for language-neutral matching.
 *
 * The existing signal matcher (lib/textSignal.ts, lib/analyzer.ts,
 * lib/domainClassifier.ts) normalizes with `[^a-z0-9\s-] -> " "`, which is an
 * English/ASCII assumption with two consequences the Phase A audit measured:
 *
 *   - CJK text is erased entirely: "ログインできません" -> "" so nothing can match.
 *   - Accented Latin words are split mid-word: "sesión" -> "sesi n",
 *     "não" -> "n o" — the token is destroyed rather than folded.
 *
 * `foldForMatching` keeps letters and digits from EVERY script and folds
 * diacritics to their base letter, so "sesión" and "sesion" compare equal while
 * Japanese, Korean, and Chinese survive normalization intact.
 *
 * This is a NEW function used by the concept layer. It deliberately does not
 * replace the existing English normalizers — swapping those is Phase C and
 * changes retrieval behavior for every existing organization, so it is designed
 * and staged separately (docs/TODO-058-LANGUAGE-NEUTRAL-DESIGN.md).
 */

/**
 * Lowercase, fold diacritics, keep letters/digits of all scripts, collapse
 * whitespace. Pure and allocation-light; safe to call per alias.
 */
export function foldForMatching(value: unknown): string {
  if (typeof value !== "string") return "";
  return value
    .toLowerCase()
    // Decompose so combining marks become separate code points...
    .normalize("NFD")
    // ...then drop ONLY the Latin combining diacritics (U+0300–U+036F):
    // é -> e, ñ -> n, ã -> a, ü -> u.
    //
    // Stripping every \p{M} would be wrong for Japanese: dakuten and handakuten
    // (U+3099/U+309A) are combining marks that distinguish real characters, so
    // "ログイン" would decompose and flatten to "ロクイン" — a different word.
    .replace(/[̀-ͯ]+/gu, "")
    // Recompose, so kana that were decomposed above become single characters again.
    .normalize("NFC")
    // Keep letters and numbers from every script; everything else separates.
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();
}

/**
 * True when two strings mean the same token once folded. Used for alias
 * de-duplication so an organization cannot register "Factura" and "factura" as
 * two different surface forms.
 */
export function foldedEquals(left: unknown, right: unknown): boolean {
  const a = foldForMatching(left);
  return a.length > 0 && a === foldForMatching(right);
}
