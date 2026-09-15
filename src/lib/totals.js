/**
 * Live totals. Pure function of (analysis, overrides) so every toggle in the
 * UI recomputes the whole count without re-parsing the document.
 */

export function emptyOverrides() {
  return { sections: {}, notes: {}, parens: {} }
}

export function isSectionIncluded(section, overrides) {
  const override = overrides.sections[section.id]
  return override === undefined ? section.counted : override
}

export function isParenIncluded(paren, overrides) {
  const override = overrides.parens[paren.id]
  return override === undefined ? paren.verdict !== 'citation' : override
}

export function isNoteIncluded(note, overrides, sectionIncluded) {
  const override = overrides.notes[note.uid]
  if (override !== undefined) return override
  if (!note.sectionId) return false
  if (!sectionIncluded(note.sectionId)) return false
  return note.classification !== 'citation'
}

const SECTION_GROUP_ORDER = [
  'frontmatter',
  'contents',
  'abstract',
  'acknowledgements',
  'figures',
  'bibliography',
  'notes',
  'appendix',
  'rppf',
  'body',
  'introduction',
  'conclusion',
]

export function computeTotals(analysis, overrides) {
  const includedById = new Map()
  for (const section of analysis.sections) includedById.set(section.id, isSectionIncluded(section, overrides))
  const sectionIncluded = (id) => includedById.get(id) === true

  const sections = analysis.sections.map((section) => {
    const included = sectionIncluded(section.id)
    const parens = section.parens.map((paren) => ({ ...paren, included: isParenIncluded(paren, overrides) }))
    const parenWords = parens.reduce((sum, p) => (p.included ? sum + p.words : sum), 0)
    const excludedParenWords = parens.reduce((sum, p) => (p.included ? sum : sum + p.words), 0)
    const noteWords = analysis.notes
      .filter((n) => n.sectionId === section.id && isNoteIncluded(n, overrides, sectionIncluded))
      .reduce((sum, n) => sum + n.words, 0)
    const proseWords = section.coreWords + parenWords
    return {
      ...section,
      included,
      parens,
      excludedParenWords,
      excludedParenCount: parens.filter((p) => !p.included).length,
      proseWords,
      noteWords,
      words: included ? proseWords + noteWords : 0,
    }
  })

  const notes = analysis.notes.map((note) => ({
    ...note,
    included: isNoteIncluded(note, overrides, sectionIncluded),
    sectionExcluded: note.sectionId ? !sectionIncluded(note.sectionId) : true,
  }))

  const total = sections.reduce((sum, s) => sum + s.words, 0)

  // --- What was left out, and why -----------------------------------------
  const counted = sections.filter((s) => s.included)
  const dropped = sections.filter((s) => !s.included && s.allWords > 0)

  const excluded = []
  const push = (key, label, words, count, detail) => {
    if (!words && !count) return
    excluded.push({ key, label, words, count, detail })
  }

  const grouped = new Map()
  for (const section of dropped) {
    const entry = grouped.get(section.kind) || { words: 0, count: 0, titles: [] }
    entry.words += section.allWords
    entry.count += 1
    if (section.displayTitle) entry.titles.push(section.displayTitle)
    grouped.set(section.kind, entry)
  }
  const kindLabel = {
    frontmatter: 'Front matter (title page / contents)',
    contents: 'Contents page',
    abstract: 'Abstract',
    acknowledgements: 'Acknowledgements',
    figures: 'List of figures / glossary',
    bibliography: 'Bibliography / works cited',
    notes: 'Notes list',
    appendix: 'Appendices',
    rppf: 'Reflections on Planning and Progress (RPPF)',
    body: 'Sections excluded manually',
    introduction: 'Introduction (excluded manually)',
    conclusion: 'Conclusion (excluded manually)',
  }
  for (const kind of SECTION_GROUP_ORDER) {
    const entry = grouped.get(kind)
    if (!entry) continue
    push(
      `section:${kind}`,
      kindLabel[kind] || kind,
      entry.words,
      entry.count,
      entry.titles.length ? entry.titles.join(', ') : null,
    )
  }

  const sum = (list, key) => list.reduce((acc, s) => acc + s[key], 0)
  push('headings', 'Headings and subheadings', sum(counted, 'headingWords'), counted.filter((s) => s.headingWords).length, 'Structural text, not body prose')
  push('tables', 'Tables', sum(counted, 'tableWords'), sum(counted, 'tableCount'), 'Table contents never count')
  push('captions', 'Figure and table captions', sum(counted, 'captionWords'), sum(counted, 'captionCount'), 'Captions and headings of visuals never count')
  push('toc', 'Contents entries', sum(counted, 'tocWords'), 0, null)
  push('titles', 'Title / subtitle lines', sum(counted, 'titleWords'), 0, null)
  push(
    'bibentries',
    'Reference list entries',
    sum(counted, 'bibWords'),
    sum(counted, 'bibCount'),
    'Styled as Word bibliography entries, so excluded even outside a bibliography section',
  )
  push(
    'citations',
    'In-text citations',
    sum(counted, 'excludedParenWords'),
    sum(counted, 'excludedParenCount'),
    'Parenthetical and numbered references removed from the surrounding sentence',
  )

  const citationNotes = notes.filter((n) => !n.included && !n.sectionExcluded)
  const notesInDroppedSections = notes.filter((n) => !n.included && n.sectionExcluded)
  push(
    'notes-citation',
    'Citation-only footnotes / endnotes',
    citationNotes.reduce((a, n) => a + n.words, 0),
    citationNotes.length,
    'Pure references do not count',
  )
  push(
    'notes-elsewhere',
    'Notes attached to excluded sections',
    notesInDroppedSections.reduce((a, n) => a + n.words, 0),
    notesInDroppedSections.length,
    'Including notes whose markers were not found in the body',
  )
  if (analysis.hasHeaderFooter) {
    excluded.push({
      key: 'headers',
      label: 'Page headers and footers',
      words: null,
      count: null,
      detail: 'Not extracted at all, so they cannot affect the count',
    })
  }

  const includedNotes = notes.filter((n) => n.included)
  const excludedTotal = excluded.reduce((acc, row) => acc + (row.words || 0), 0)

  return {
    total,
    limit: analysis.limit,
    over: Math.max(0, total - analysis.limit),
    remaining: Math.max(0, analysis.limit - total),
    percent: analysis.limit ? total / analysis.limit : 0,
    sections,
    notes,
    excluded,
    excludedTotal,
    noteStats: {
      total: notes.length,
      included: includedNotes.length,
      includedWords: includedNotes.reduce((a, n) => a + n.words, 0),
      excluded: notes.length - includedNotes.length,
      excludedWords: notes.filter((n) => !n.included).reduce((a, n) => a + n.words, 0),
    },
  }
}
