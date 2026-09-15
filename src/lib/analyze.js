/**
 * The analysis pipeline: blocks in, a fully-classified document model out.
 *
 * Nothing here decides a final number. It records, for every piece of the
 * document, how many words it holds and whether it counts by default — the
 * live total is computed in totals.js so that user overrides apply instantly.
 */

import { countWords, normalize } from './tokenize.js'
import { classifyNote, classifyParenthetical } from './patterns.js'
import {
  ABSTRACT_OPENER,
  captionShape,
  classifyHeading,
  CONTENTS_TITLE,
  looksLikeHeading,
  stripHeadingNumber,
  tocEntryShape,
} from './sections.js'

export const WORD_LIMIT = 4000

const BRACKET_SPAN = /\(([^()]*)\)|\[([^[\]]*)\]/g

/**
 * Split prose into the words that always count plus the bracketed spans that
 * may not. Each span is removed from the core text and replaced with a space,
 * so stripping a citation never welds its neighbours into one word.
 */
export function analyzeProse(text, idPrefix) {
  const spans = []
  let core = ''
  let last = 0
  let index = 0
  BRACKET_SPAN.lastIndex = 0
  let match
  while ((match = BRACKET_SPAN.exec(text)) !== null) {
    const bracket = match[0][0]
    const inner = match[1] !== undefined ? match[1] : match[2]
    const verdict = classifyParenthetical(inner, bracket, text.slice(0, match.index))
    const words = countWords(match[0])
    if (words > 0) {
      spans.push({
        id: `${idPrefix}-s${index}`,
        text: match[0],
        words,
        verdict: verdict.verdict,
        confidence: verdict.confidence,
        reasons: verdict.reasons,
        context: snippet(text, match.index, match[0].length),
      })
      index += 1
    }
    core += text.slice(last, match.index) + ' '
    last = match.index + match[0].length
  }
  core += text.slice(last)
  return { coreWords: countWords(core), spans }
}

function snippet(text, start, length, pad = 45) {
  const from = Math.max(0, start - pad)
  const to = Math.min(text.length, start + length + pad)
  return (from > 0 ? '…' : '') + normalize(text.slice(from, to)) + (to < text.length ? '…' : '')
}

/**
 * Mark the entries of a typed contents page, which Word leaves as ordinary
 * paragraphs when the author did not use an automatic table of contents.
 *
 * Left alone, `Bibliography 14` reads as a real heading and everything after
 * it is excluded as back matter — silently dropping the entire essay.
 */
function markContentsEntries(blocks) {
  const isEntry = (b) => !!b && b.type === 'paragraph' && !b.list && tocEntryShape(b.text)
  const consume = (from) => {
    let j = from
    while (isEntry(blocks[j])) {
      blocks[j].type = 'toc'
      j += 1
    }
    return j
  }

  // A contents page is always at the front, so a bare run of entries is only
  // read as one near the start — three short numbered lines in the middle of
  // an essay are far more likely to be data.
  const firstStyledHeading = blocks.findIndex((b) => b.type === 'heading' && !b.inferred)
  const frontMatterEnd = firstStyledHeading >= 0 ? firstStyledHeading : Math.min(blocks.length, 30)

  for (let i = 0; i < blocks.length; i += 1) {
    const block = blocks[i]
    if (block.type !== 'paragraph' || block.list) continue

    if (CONTENTS_TITLE.test(normalize(block.text))) {
      i = consume(i + 1) - 1
      continue
    }
    if (i < frontMatterEnd && isEntry(blocks[i]) && isEntry(blocks[i + 1]) && isEntry(blocks[i + 2])) {
      i = consume(i) - 1
    }
  }
}

/** Promote heading-shaped paragraphs and mark figure/table captions. */
function refineBlocks(blocks, { allowInferredHeadings }) {
  const refined = blocks.map((block) => ({ ...block }))

  markContentsEntries(refined)

  if (allowInferredHeadings) {
    for (const block of refined) {
      if (block.type !== 'paragraph' || block.list) continue
      if (!looksLikeHeading(block.text)) continue
      block.type = 'heading'
      block.level = 1
      block.inferred = true
    }
  }

  for (let i = 0; i < refined.length; i += 1) {
    const block = refined[i]
    if (block.type !== 'paragraph' || block.list) continue
    const shape = captionShape(block.text)
    if (!shape) continue
    if (shape === 'certain') {
      block.type = 'caption'
      block.certainty = 'pattern'
    } else {
      const neighbours = [refined[i - 1], refined[i + 1]]
      if (neighbours.some((n) => n && n.type === 'table')) {
        block.type = 'caption'
        block.certainty = 'adjacent'
      }
    }
  }
  return refined
}

function segment(blocks) {
  const sections = []
  let current = { id: 'sec-0', heading: null, level: 0, blocks: [] }
  for (const block of blocks) {
    if (block.type === 'heading') {
      if (current.blocks.length || current.heading) sections.push(current)
      current = {
        id: `sec-${sections.length + 1}`,
        heading: block,
        level: block.level || 1,
        blocks: [],
      }
    } else {
      current.blocks.push(block)
    }
  }
  if (current.blocks.length || current.heading) sections.push(current)
  return sections
}

const AFTER_BACK_MATTER = new Set(['bibliography', 'appendix', 'rppf', 'notes'])

function classifySections(rawSections) {
  const sections = rawSections.map((raw, i) => {
    const title = raw.heading ? raw.heading.text : ''
    const meta = raw.heading
      ? classifyHeading(title)
      : { kind: 'frontmatter', label: 'Front matter', counted: false, reason: 'Before the first heading — title page / contents', sticky: false }
    return {
      ...raw,
      index: i,
      title,
      displayTitle: raw.heading ? stripHeadingNumber(title) || title : 'Front matter (before the first heading)',
      kind: meta.kind,
      label: meta.label,
      counted: meta.counted,
      reason: meta.reason,
      sticky: !!meta.sticky,
      inferredHeading: !!(raw.heading && raw.heading.inferred),
      uncertain: false,
      notes: [],
    }
  })

  // A back-matter heading swallows everything nested beneath it, up to the next
  // heading at the same or a shallower level.
  let owner = null
  for (const section of sections) {
    if (owner && section.level > owner.level) {
      section.counted = false
      section.inheritedFrom = owner.displayTitle
      section.reason = `Inside “${owner.displayTitle}” — not counted`
      continue
    }
    owner = null
    if (section.sticky && !section.counted) owner = section
  }

  // Everything before the Introduction is front matter (title page, contents,
  // abstract). Without an Introduction heading we only know about the blocks
  // that precede the very first heading.
  const introIndex = sections.findIndex((s) => s.kind === 'introduction')
  if (introIndex > 0) {
    for (const section of sections.slice(0, introIndex)) {
      if (section.kind === 'body' || section.kind === 'frontmatter') {
        section.counted = false
        section.reason =
          section.kind === 'frontmatter'
            ? 'Front matter before the Introduction — not counted'
            : 'Sits before the Introduction heading, so treated as front matter'
        if (section.kind === 'body') section.uncertain = true
      } else {
        section.counted = false
      }
    }
  }

  // Body prose after the bibliography or appendices is usually a stray heading
  // rather than real content. Two guards keep this from eating a whole essay:
  // only a genuinely styled heading may trigger the cut, and the cut must not
  // discard more prose than it keeps.
  const bulk = (section) => section.blocks.reduce((n, b) => n + countWords(b.text), 0)
  const backMatterIndex = sections.findIndex(
    (s) => AFTER_BACK_MATTER.has(s.kind) && s.heading && !s.heading.inferred,
  )
  if (backMatterIndex >= 0) {
    const after = sections.slice(backMatterIndex + 1).filter((s) => s.counted)
    const wordsAfter = after.reduce((n, s) => n + bulk(s), 0)
    const wordsBefore = sections.slice(0, backMatterIndex).reduce((n, s) => n + (s.counted ? bulk(s) : 0), 0)

    // The comparison only means something once there is real prose at stake;
    // on a three-word document "more after than before" is noise.
    if (wordsAfter > wordsBefore && wordsAfter >= 200) {
      // The essay is mostly *after* this heading, so the heading is the thing
      // that is wrong. Keep the words and say so.
      for (const section of after) section.backMatterSuspect = true
    } else {
      for (const section of after) {
        section.counted = false
        section.uncertain = true
        section.reason = 'Appears after the bibliography/appendices — excluded by default'
      }
    }
  }

  return sections
}

function measure(section) {
  const totals = {
    headingWords: section.heading ? countWords(section.heading.text) : 0,
    coreWords: 0,
    tableWords: 0,
    tableCount: 0,
    captionWords: 0,
    captionCount: 0,
    tocWords: 0,
    titleWords: 0,
    bibWords: 0,
    bibCount: 0,
    parens: [],
    noteRefs: section.heading ? [...section.heading.refs] : [],
  }

  section.blocks.forEach((block, i) => {
    totals.noteRefs.push(...(block.refs || []))
    switch (block.type) {
      case 'table':
        totals.tableWords += countWords(block.text)
        totals.tableCount += 1
        break
      case 'caption':
        totals.captionWords += countWords(block.text)
        totals.captionCount += 1
        break
      case 'toc':
        totals.tocWords += countWords(block.text)
        break
      case 'bibentry':
        totals.bibWords += countWords(block.text)
        totals.bibCount += 1
        break
      case 'title':
        totals.titleWords += countWords(block.text)
        break
      default: {
        const { coreWords, spans } = analyzeProse(block.text, `${section.id}-b${i}`)
        totals.coreWords += coreWords
        totals.parens.push(...spans)
      }
    }
  })

  const parenWords = totals.parens.reduce((sum, p) => sum + p.words, 0)
  totals.allWords =
    totals.headingWords +
    totals.coreWords +
    parenWords +
    totals.tableWords +
    totals.captionWords +
    totals.tocWords +
    totals.titleWords +
    totals.bibWords
  return totals
}

function attachNotes(sections, notes) {
  const owner = new Map()
  for (const section of sections) {
    for (const ref of section.noteRefs) owner.set(`${ref.kind}-${ref.id}`, section.id)
  }
  return notes.map((note) => {
    const uid = `${note.kind}-${note.id}`
    const verdict = classifyNote(note.text)
    return {
      uid,
      id: note.id,
      kind: note.kind,
      text: note.text,
      words: verdict.words,
      classification: verdict.classification,
      confidence: verdict.confidence,
      reasons: verdict.reasons,
      sectionId: owner.get(uid) || null,
    }
  })
}

/**
 * Run the full analysis.
 *
 * @param {object}  input
 * @param {Array}   input.blocks    blocks from htmlToBlocks() or textToBlocks()
 * @param {Array}   input.notes     raw notes from readDocx()
 * @param {string}  input.source    'docx' | 'text'
 * @param {string}  [input.fileName]
 * @param {object}  [input.docScan] equation/object counts from document.xml
 * @param {boolean} [input.hasHeaderFooter]
 * @param {Array}   [input.messages] mammoth conversion messages
 */
export function analyze({
  blocks: rawBlocks,
  notes: rawNotes = [],
  source = 'docx',
  fileName = '',
  docScan = {},
  hasHeaderFooter = false,
  messages = [],
}) {
  const hasRealHeadings = rawBlocks.some((b) => b.type === 'heading')
  const blocks = refineBlocks(rawBlocks, { allowInferredHeadings: true })
  const sections = classifySections(segment(blocks)).map((section) => ({ ...section, ...measure(section) }))
  const notes = attachNotes(sections, rawNotes)

  for (const note of notes) {
    const section = sections.find((s) => s.id === note.sectionId)
    if (section) section.notes.push(note.uid)
  }

  const flags = []
  const uncertain = []
  const flag = (level, title, detail) => flags.push({ id: `flag-${flags.length}`, level, title, detail })
  const unsure = (item) => uncertain.push({ id: `unsure-${uncertain.length}`, ...item })

  // --- Abstract ------------------------------------------------------------
  const abstractSection = sections.find((s) => s.kind === 'abstract')
  const abstractParagraph = sections
    .filter((s) => !s.counted && (s.kind === 'frontmatter' || s.index === 0))
    .flatMap((s) => s.blocks)
    .find((b) => ABSTRACT_OPENER.test(b.text) && countWords(b.text) > 12)
  if (abstractSection || abstractParagraph) {
    flag(
      'warn',
      'An abstract appears to be present',
      'The abstract stopped being a required — or permitted — part of the Extended Essay in the 2018 reform. ' +
        'It is excluded from the count here, but you should remove it from the essay before you submit.',
    )
  }

  // --- Did we just throw away the essay? ------------------------------------
  // The failure that matters most is silently excluding real body prose, so
  // say it loudly rather than reporting a confidently wrong number.
  const documentWords = sections.reduce((n, s) => n + s.allWords, 0)
  const keptWords = sections.reduce((n, s) => n + (s.counted ? s.allWords : 0), 0)
  if (documentWords >= 400 && keptWords < documentWords * 0.6) {
    flag(
      'warn',
      `Only ${keptWords} of ${documentWords} words in the document are being counted`,
      'That is a large share of the document excluded, which usually means a heading was misread — a contents ' +
        'entry taken for a real heading, or a section placed in the wrong order. Check the section breakdown ' +
        'below and tick anything back in that should count.',
    )
  }

  for (const section of sections) {
    if (!section.backMatterSuspect) continue
    unsure({
      kind: 'section',
      title: `“${section.displayTitle}” sits after a bibliography or appendix heading`,
      detail:
        'It is being counted anyway, because most of the essay is after that heading — which suggests the ' +
        'heading was misread rather than that this is stray text. Untick it if it really is back matter.',
      sectionId: section.id,
    })
  }

  // --- Structure -----------------------------------------------------------
  if (!hasRealHeadings) {
    flag(
      source === 'text' ? 'info' : 'warn',
      source === 'text' ? 'Pasted text has no styles to read' : 'No Word Heading styles found',
      source === 'text'
        ? 'Section detection falls back to recognising heading-like lines. Tables, footnotes and endnotes cannot be detected at all in pasted text — upload the .docx for a full check.'
        : 'Your document does not use Word’s built-in Heading 1/2/3 styles, so sections were guessed from heading-like lines. Applying real heading styles will make this far more accurate (and is good practice for the EE anyway).',
    )
  }
  if (!sections.some((s) => s.kind === 'introduction')) {
    flag(
      'warn',
      'No “Introduction” heading found',
      'Front matter could only be identified as the content before the first heading, so a title page or contents page may still be included in the count. Check the section list below.',
    )
  }
  if (!sections.some((s) => s.kind === 'conclusion')) {
    flag('info', 'No “Conclusion” heading found', 'Your conclusion is being counted as body text, which does not change the total.')
  }
  if (!sections.some((s) => s.kind === 'bibliography')) {
    flag(
      'info',
      'No bibliography heading found',
      'If your works cited list is in the document under a different heading, exclude it manually in the section list — otherwise it is being counted.',
    )
  }

  for (const section of sections) {
    if (section.inferredHeading) {
      unsure({
        kind: 'heading',
        title: `Heading guessed from a plain paragraph: “${section.displayTitle}”`,
        detail: `Not styled as a Word heading, but it reads like one. It is being treated as ${
          section.counted ? 'a counted section' : `“${section.label}” (excluded)`
        }.`,
        sectionId: section.id,
      })
    }
    if (section.uncertain) {
      unsure({
        kind: 'section',
        title: `Section “${section.displayTitle}” placed unusually`,
        detail: `${section.reason} It holds ${section.allWords} words. Re-include it in the section list if that is wrong.`,
        sectionId: section.id,
      })
    }
    for (const block of section.blocks) {
      if (block.type === 'caption' && block.certainty === 'adjacent') {
        unsure({
          kind: 'caption',
          title: 'Possible caption next to a table',
          detail: `“${block.text}” was treated as a caption (excluded) because it sits beside a table. If it is analysis of the table, it should count.`,
          sectionId: section.id,
        })
      }
    }
  }

  // --- Things docx cannot give us as text ----------------------------------
  if (docScan.equations) {
    flag(
      'info',
      `${docScan.equations} equation object${docScan.equations === 1 ? '' : 's'} detected`,
      'Equations, formulae and calculations do not count, and these are excluded. They cannot be read reliably as text, so check that none of your surrounding explanation was swallowed with them.',
    )
    unsure({
      kind: 'equation',
      title: `${docScan.equations} equation object${docScan.equations === 1 ? '' : 's'} in the document`,
      detail: 'Excluded, as IB rules require. Verify manually that no prose is embedded inside them.',
    })
  }
  if (docScan.textBoxes) {
    unsure({
      kind: 'textbox',
      title: `${docScan.textBoxes} text box${docScan.textBoxes === 1 ? '' : 'es'} detected`,
      detail: 'Text inside Word text boxes is not extracted and is therefore not counted. If any of it is body prose, count it by hand.',
    })
  }
  if (docScan.embeddedObjects) {
    unsure({
      kind: 'object',
      title: `${docScan.embeddedObjects} embedded object${docScan.embeddedObjects === 1 ? '' : 's'} detected`,
      detail: 'Embedded objects (older equation editors, spreadsheets, charts) are not readable as text and are excluded.',
    })
  }

  const orphanNotes = notes.filter((n) => !n.sectionId)
  if (orphanNotes.length) {
    unsure({
      kind: 'note',
      title: `${orphanNotes.length} note${orphanNotes.length === 1 ? '' : 's'} could not be located in the text`,
      detail: 'Their reference markers were not found in the body, so they are excluded by default. Turn them on individually in the footnote review if they belong to your essay.',
    })
  }
  for (const note of notes) {
    if (note.classification === 'ambiguous') {
      unsure({
        kind: 'note',
        title: `${note.kind === 'footnote' ? 'Footnote' : 'Endnote'} ${note.id} is hard to classify`,
        detail: `${note.words} words. ${note.reasons.map((r) => r.label).join('; ')}. Counted by default — check it.`,
        noteUid: note.uid,
      })
    }
  }

  const ambiguousParens = sections.flatMap((s) => s.parens.filter((p) => p.verdict === 'ambiguous').map((p) => ({ ...p, sectionId: s.id })))
  if (ambiguousParens.length) {
    unsure({
      kind: 'paren',
      title: `${ambiguousParens.length} bracketed span${ambiguousParens.length === 1 ? '' : 's'} could be a citation or could be content`,
      detail: 'Mostly bare years, which read the same way as a date in your prose. They are counted by default — review them in the brackets list.',
    })
  }

  if (source === 'docx' && !rawNotes.length) {
    flag('info', 'No footnotes or endnotes found', 'If your essay uses them, check that they are real Word footnotes rather than manually typed superscripts.')
  }

  const styleMessages = messages.filter((m) => m.type === 'warning').map((m) => m.message)

  return {
    source,
    fileName,
    limit: WORD_LIMIT,
    sections,
    notes,
    flags,
    uncertain,
    hasHeaderFooter,
    docScan,
    styleMessages,
  }
}
