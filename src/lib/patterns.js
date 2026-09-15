/**
 * Heuristics for telling citations apart from prose.
 *
 * Two classifiers live here:
 *   - classifyParenthetical() for `(...)` / `[...]` spans inside body text
 *   - classifyNote() for whole footnote / endnote entries
 *
 * Both return one of 'citation' | 'content' | 'ambiguous' (notes use
 * 'explanatory' in place of 'content') together with the reasons that drove the
 * decision, so the UI can show its working and the user can overrule it.
 */

import { countWords, normalize } from './tokenize.js'

export const YEAR = /\b(1[5-9]\d{2}|20\d{2})[a-z]?\b/
export const PAGE_REF = /\bpp?\.\s*\d|\bpages?\s+\d/i
export const URLISH = /(https?:\/\/|www\.|doi:|10\.\d{4}\/|\bisbn\b|\bissn\b)/i
export const LATIN = /\b(ibid|op\.?\s?cit|loc\.?\s?cit|et\s+al|n\.\s?d\.|passim|supra|infra)\b/i
export const PUBLISH = /\b(vols?|nos?|eds?|edn|trans|rev|chaps?)\.\s*/i
export const ACCESS = /\b(retrieved|accessed|available\s+(at|from|online)|viewed\s+on|last\s+accessed)\b/i
export const PUBLISHER = /\b(press|university|journal|publish(ers?|ing)|ltd|inc\.|routledge|springer|wiley|elsevier)\b/i
/** `Smith, J.` / `Smith, J. A.` — surname followed by initials. */
export const AUTHOR_INITIALS = /^[\p{Lu}][\p{L}'’-]+,\s*[\p{Lu}]\.(\s*[\p{Lu}]\.)*/u
/** Capitalised opener with a year close behind it: `Smith 2020`, `WHO, 2021`. */
export const AUTHOR_YEAR = /^[\p{Lu}][\p{L}'’.-]+[^()[\]]{0,40}?\b(1[5-9]\d{2}|20\d{2})[a-z]?\b/u
/** `1`, `12-14`, `3, 7` — numeric reference markers. */
export const NUMERIC_CITE = /^\d{1,3}([–—-]\d{1,3})?([,;]\s*\d{1,3}([–—-]\d{1,3})?)*$/
export const SIGNAL_PHRASE = /^(see\s+(also\s+)?[\p{Lu}\d]|cf\.|compare\s+[\p{Lu}]|as\s+cited\s+in|(as\s+)?quoted\s+in|qtd\.\s*in|adapted\s+from|source:|data\s+from)/u
/** Discourse markers that only appear in real prose, never in a reference. */
export const PROSE_MARKERS =
  /\b(however|therefore|because|although|whereas|moreover|nevertheless|in\s+other\s+words|note\s+that|worth\s+noting|this\s+(is|was|means|suggests|shows|implies)|which\s+(is|was|means|suggests)|it\s+(is|was|should)|i\s+(have|chose|use[d]?|decided)|arguably|interestingly|in\s+contrast)\b/i

const FUNCTION_WORDS = new Set(
  ('a an the is are was were be been being of to in on at by for with from as that this these those it its ' +
    'not but or if then than so such can could would should may might will do does did have has had more ' +
    'most only also into about over under between while when where which who whom whose because although ' +
    'however therefore they their there here we our you your he she his her them us')
    .split(' '),
)

/** Share of tokens that are grammatical glue — high in prose, low in a bibliography entry. */
export function functionWordRatio(text) {
  const words = normalize(text)
    .toLowerCase()
    .replace(/[^\p{L}\s'’-]/gu, ' ')
    .split(/\s+/)
    .filter(Boolean)
  if (!words.length) return 0
  return words.filter((w) => FUNCTION_WORDS.has(w)).length / words.length
}

function scorer() {
  const reasons = []
  let positive = 0
  let negative = 0
  return {
    hit(condition, points, label) {
      if (!condition) return
      if (points >= 0) positive += points
      else negative += points
      reasons.push({ label, points })
    },
    get score() {
      return positive + negative
    },
    get positive() {
      return positive
    },
    get negative() {
      return negative
    },
    reasons,
  }
}

function confidenceFor(score) {
  const magnitude = Math.abs(score)
  if (magnitude >= 4) return 'high'
  if (magnitude >= 2) return 'medium'
  return 'low'
}

/**
 * Classify a bracketed span found in body prose.
 *
 * @param {string} inner    text between the brackets
 * @param {string} bracket  the opening bracket, '(' or '['
 * @param {string} before   body text preceding the span (used for `Smith (2020)`)
 */
export function classifyParenthetical(inner, bracket = '(', before = '') {
  const text = normalize(inner)
  if (!text) return { verdict: 'content', confidence: 'high', reasons: [] }

  const words = countWords(text)
  const hasYear = YEAR.test(text)

  // Numeric markers: `[1]`, `[3-5]` are references; a bare `(3)` in round
  // brackets is far more often a list marker or a quantity, so it stays.
  if (NUMERIC_CITE.test(text)) {
    return bracket === '['
      ? { verdict: 'citation', confidence: 'high', reasons: [{ label: 'Numeric reference marker', points: 4 }] }
      : {
          verdict: 'content',
          confidence: 'medium',
          reasons: [{ label: 'Bare number in round brackets — not a reference marker', points: 0 }],
        }
  }

  // A bare year is genuinely undecidable: `Smith (2020)` is a citation, but
  // `the Treaty of Versailles (1919)` is a date and does count. Surface it.
  if (/^(1[5-9]\d{2}|20\d{2})[a-z]?$/.test(text)) {
    const namedBefore = /[\p{Lu}][\p{L}'’.-]+[\s,]*$/u.test(before)
    return {
      verdict: 'ambiguous',
      confidence: 'low',
      reasons: [
        {
          label: namedBefore
            ? 'Bare year after a capitalised name — could be an author–date citation or a date'
            : 'Bare year — could be an author–date citation or a date in your prose',
          points: 0,
        },
      ],
    }
  }

  // Measurements and quantities always count: `(77°F)`, `(3.5 km)`, `(approx. 40%)`.
  const quantity = /^([~≈<>±≥≤]\s*)?[\d.,]/.test(text) || /^(approx|approximately|about|roughly|circa|c\.|ca\.)\b/i.test(text)
  if (quantity && !hasYear && words <= 6) {
    return {
      verdict: 'content',
      confidence: 'high',
      reasons: [{ label: 'Measurement or quantity — counts as its own word(s)', points: 0 }],
    }
  }

  const s = scorer()
  s.hit(URLISH.test(text), 4, 'Contains a URL, DOI or ISBN')
  s.hit(PAGE_REF.test(text), 3, 'Contains a page reference')
  s.hit(LATIN.test(text), 3, 'Contains citation shorthand (ibid., et al., n.d.)')
  s.hit(ACCESS.test(text), 3, 'Contains access or retrieval wording')
  s.hit(AUTHOR_INITIALS.test(text), 3, 'Opens like a surname followed by initials')
  s.hit(words <= 8 && AUTHOR_YEAR.test(text), 3, 'Matches an author–date citation shape')
  s.hit(SIGNAL_PHRASE.test(text), 2, 'Opens with a citation signal phrase')
  s.hit(hasYear && /(^|\s)[\p{Lu}][\p{L}'’-]+/u.test(text) && words <= 10, 2, 'Year alongside a proper noun')
  s.hit(PROSE_MARKERS.test(text), -3, 'Contains explanatory prose')
  s.hit(words > 12, -2, 'Longer than a typical in-text citation')

  const score = s.score
  let verdict
  if (score >= 3) verdict = 'citation'
  else if (score >= 2) verdict = 'ambiguous'
  else verdict = 'content'

  if (!s.reasons.length) s.reasons.push({ label: 'No citation signals found', points: 0 })
  return { verdict, confidence: confidenceFor(score), reasons: s.reasons, score }
}

/**
 * Classify a whole footnote or endnote entry as a pure reference or as
 * explanatory text. Explanatory notes count toward the 4,000 words.
 */
export function classifyNote(rawText) {
  const text = normalize(rawText)
  const words = countWords(text)
  if (!words) {
    return { classification: 'citation', confidence: 'high', reasons: [{ label: 'Empty note', points: 0 }], words: 0 }
  }

  const ratio = functionWordRatio(text)
  const s = scorer()

  s.hit(URLISH.test(text), 3, 'Contains a URL, DOI or ISBN')
  s.hit(PAGE_REF.test(text), 2, 'Contains a page reference')
  s.hit(LATIN.test(text), 3, 'Contains citation shorthand (ibid., et al., n.d.)')
  s.hit(ACCESS.test(text), 3, 'Contains access or retrieval wording')
  s.hit(PUBLISH.test(text), 2, 'Contains publication details (vol., ed., trans.)')
  s.hit(PUBLISHER.test(text), 2, 'Names a publisher, university or journal')
  s.hit(AUTHOR_INITIALS.test(text), 3, 'Opens like a surname followed by initials')
  s.hit(/[“"«][^”"»]{3,150}[”"»]/.test(text) && ratio < 0.2, 1, 'Quoted title in a reference-style entry')
  s.hit(YEAR.test(text), 1, 'Contains a year')
  s.hit(words <= 10, 2, 'Very short entry')
  s.hit(words <= 15 && SIGNAL_PHRASE.test(text), 2, 'Cross-reference to a source only')
  s.hit(words >= 12 && ratio < 0.12, 2, 'Reads like a reference list entry (little grammatical glue)')

  s.hit(words >= 15 && ratio >= 0.22, -3, 'Reads like prose (high proportion of function words)')
  s.hit(PROSE_MARKERS.test(text), -3, 'Contains explanatory prose markers')
  s.hit(words >= 35, -2, 'Long enough to be a discussion rather than a reference')

  const score = s.score
  let classification
  if (score >= 3) classification = 'citation'
  else if (score <= 0) classification = 'explanatory'
  else classification = 'ambiguous'

  // A reference with commentary bolted on: the commentary counts, the
  // reference does not, and no automatic split is trustworthy.
  const mixed = s.positive >= 3 && s.negative <= -3
  if (mixed) {
    classification = 'ambiguous'
    s.reasons.push({ label: 'Looks like a reference followed by commentary — check what should count', points: 0 })
  }

  return {
    classification,
    confidence: mixed ? 'low' : confidenceFor(score),
    reasons: s.reasons,
    score,
    words,
  }
}
