/**
 * Recognising the structural sections of an Extended Essay from heading text.
 */

import { countWords, normalize } from './tokenize.js'

/** Strip `1.`, `2.3`, `IV.`, `A)` and trailing colons from a heading. */
export function stripHeadingNumber(title) {
  return normalize(title)
    .replace(/^\s*(\d+(\.\d+)*[.):]?|[IVXLCivxlc]{1,6}[.)]|[A-Za-z][.)])\s+/, '')
    .replace(/[:.–—-]\s*$/, '')
    .trim()
}

/**
 * Section kinds, in match order. `counted: false` sections are excluded from
 * the 4,000 words; `sticky: true` means the section swallows everything under
 * it until a heading at the same or a shallower level.
 */
export const SECTION_KINDS = [
  {
    kind: 'contents',
    label: 'Contents',
    counted: false,
    reason: 'Contents page — not counted',
    test: /^(table of )?contents$/i,
  },
  {
    kind: 'abstract',
    label: 'Abstract',
    counted: false,
    reason: 'Abstract — not counted (and no longer part of the EE format)',
    test: /^(abstract|summary|synopsis)$/i,
    sticky: true,
  },
  {
    kind: 'acknowledgements',
    label: 'Acknowledgements',
    counted: false,
    reason: 'Acknowledgements — not counted',
    test: /^acknowledge?ments?$/i,
    sticky: true,
  },
  {
    kind: 'rppf',
    label: 'Reflections on Planning and Progress',
    counted: false,
    reason: 'RPPF — assessed separately, not counted',
    test: /^(reflections? on planning and progress( form)?|rppf|(candidate|student) reflections?|viva voce)\b/i,
    sticky: true,
  },
  {
    kind: 'bibliography',
    label: 'Bibliography',
    counted: false,
    reason: 'Bibliography / reference list — not counted',
    test: /^(bibliography|works? cited|works? consulted|references?( list)?|list of references|sources?( cited| consulted)?)\b/i,
    sticky: true,
  },
  {
    kind: 'notes',
    label: 'Notes list',
    counted: false,
    reason: 'End-of-document notes list — counted via the footnote review instead',
    test: /^(end ?notes|foot ?notes|notes)$/i,
    sticky: true,
  },
  {
    kind: 'appendix',
    label: 'Appendix',
    counted: false,
    reason: 'Appendix — nothing inside an appendix counts',
    test: /^appendi(x|ces|xes)\b/i,
    sticky: true,
  },
  {
    kind: 'figures',
    label: 'List of figures/tables',
    counted: false,
    reason: 'List of figures/tables — not counted',
    test: /^(list of (figures|tables|illustrations|abbreviations|maps)|glossary)\b/i,
    sticky: true,
  },
  {
    kind: 'introduction',
    label: 'Introduction',
    counted: true,
    reason: 'Introduction — counts',
    test: /^(introduction|introduction and (background|context)|background and introduction)\b/i,
  },
  {
    kind: 'conclusion',
    label: 'Conclusion',
    counted: true,
    reason: 'Conclusion — counts',
    test: /^(conclusions?|conclusion and evaluation|evaluation and conclusion|concluding (remarks|thoughts))\b/i,
  },
]

/** Identify a heading. Returns the matching kind descriptor, or the `body` default. */
export function classifyHeading(title) {
  const cleaned = stripHeadingNumber(title)
  if (cleaned && countWords(cleaned) <= 8) {
    for (const kind of SECTION_KINDS) {
      if (kind.test.test(cleaned)) return kind
    }
  }
  return { kind: 'body', label: 'Body', counted: true, reason: 'Main body — counts', sticky: false }
}

/** True when a plain paragraph is short enough and worded like a section heading. */
export function looksLikeHeading(text) {
  const cleaned = stripHeadingNumber(text)
  if (!cleaned || countWords(cleaned) > 8) return false
  if (/[.!?;,]$/.test(normalize(text))) return false
  // `Bibliography 14` is a contents entry, not a heading. Promoting it would
  // cut the essay off as back matter, so we would rather lose a real
  // `Appendix 2` heading (which merely over-counts) than drop the whole essay.
  if (tocEntryShape(text)) return false
  return SECTION_KINDS.some((kind) => kind.test.test(cleaned))
}

/** The heading of a contents page, typed or styled. */
export const CONTENTS_TITLE = /^(table of )?contents$/i

/**
 * A contents-page entry: `Introduction .......... 3`, `Bibliography 14`.
 *
 * A typed contents page is just ordinary paragraphs, so its lines otherwise
 * read as section headings — and a line like `Bibliography 14` would then cut
 * the whole essay off as back matter. Dot leaders or a trailing page number
 * are what distinguish an entry from a real heading.
 */
export function tocEntryShape(text) {
  const cleaned = normalize(text)
  if (!cleaned || countWords(cleaned) > 14) return false
  return /(\.{2,}|…|_{2,})\s*\d{1,4}$/.test(cleaned) || /\s\d{1,4}$/.test(cleaned)
}

const CAPTION_PATTERN = /^(table|figure|fig|chart|diagram|graph|image|map|plate|exhibit|photograph|illustration)\s*\.?\s*(\d+[a-z]?|[ivxlc]+|[A-Z])\b/i
/** A caption proper puts a separator between the label and the description. */
const CAPTION_WITH_SEPARATOR = new RegExp(CAPTION_PATTERN.source + /\s*[:.–—-]\s*\S/.source, 'i')

export function captionShape(text) {
  const cleaned = normalize(text)
  if (CAPTION_WITH_SEPARATOR.test(cleaned)) return 'certain'
  // `Table 3 shows a sharp rise…` is analysis prose and must keep counting, so
  // a label without a separator only reads as a caption next to a table.
  if (CAPTION_PATTERN.test(cleaned) && countWords(cleaned) <= 12) return 'adjacent-only'
  return null
}

export const ABSTRACT_OPENER = /^abstract\b[\s:.–—-]*/i
