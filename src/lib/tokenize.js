/**
 * Word tokenizer for IB Extended Essay counting.
 *
 * A "word" is any whitespace-delimited token containing at least one letter or
 * digit. Brackets are split off their neighbours first, so that each unit of a
 * multi-unit measurement is counted separately — the IB counts `25°C (77°F)`
 * as two words, and that holds even when the source has no space: `25°C(77°F)`.
 *
 * Hyphenated compounds (`well-known`) stay as one word, matching Word's own
 * count, and standalone punctuation (`—`, `:`) contributes nothing.
 */

const WORD_CHAR = /[\p{L}\p{N}]/u

export function tokenize(text) {
  if (!text) return []
  return String(text)
    .replace(/[   ]/g, ' ')
    .replace(/[(\[{]/g, ' $& ')
    .replace(/[)\]}]/g, ' $& ')
    .split(/\s+/)
    .filter((token) => WORD_CHAR.test(token))
}

export function countWords(text) {
  return tokenize(text).length
}

/** Collapse runs of whitespace so heuristics and UI previews see clean text. */
export function normalize(text) {
  return String(text || '')
    .replace(/[   ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}
