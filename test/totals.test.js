import './helpers/dom.js'
import test from 'node:test'
import assert from 'node:assert/strict'
import { analyze } from '../src/lib/analyze.js'
import { htmlToBlocks } from '../src/lib/docx.js'
import { computeTotals, emptyOverrides, isNoteIncluded, isParenIncluded, isSectionIncluded } from '../src/lib/totals.js'

const ESSAY = [
  '<p class="doc-title">An Essay</p>',
  '<h1>Introduction</h1>',
  '<p>The rate of reaction rose sharply under heat (Smith, 2019).<sup><a href="#footnote-2">[1]</a></sup></p>',
  '<table><tr><td>Trial</td><td>Rate</td></tr></table>',
  '<p class="caption">Table 1: Results of the experiment</p>',
  '<h1>Conclusion</h1>',
  '<p>The hypothesis was supported.<sup><a href="#footnote-3">[2]</a></sup></p>',
  '<h1>Bibliography</h1>',
  '<p>Smith, J. (2019). Reaction Kinetics. Oxford University Press.</p>',
  '<h1>Appendix A</h1>',
  '<p>Raw data and calculations are presented here.</p>',
].join('')

const NOTES = [
  { id: '2', kind: 'footnote', text: 'Smith, J. (2019). Reaction Kinetics. Oxford University Press, pp. 14-19.' },
  {
    id: '3',
    kind: 'footnote',
    text:
      'It is worth noting that this measurement was taken before the apparatus was recalibrated, ' +
      'which arguably explains the outlier in the third trial.',
  },
  { id: '9', kind: 'endnote', text: 'An orphan note whose marker never appears in the body text.' },
]

const analysis = analyze({
  blocks: htmlToBlocks(ESSAY),
  notes: NOTES,
  source: 'docx',
  fileName: 'essay.docx',
  hasHeaderFooter: true,
})

const base = () => computeTotals(analysis, emptyOverrides())
const sectionOfKind = (kind) => analysis.sections.find((s) => s.kind === kind)
const row = (totals, key) => totals.excluded.find((e) => e.key === key)

test('emptyOverrides starts with all three groups empty', () => {
  assert.deepEqual(emptyOverrides(), { sections: {}, notes: {}, parens: {} })
})

test('the total is the sum of the included sections only', () => {
  const t = base()
  const sum = t.sections.reduce((acc, s) => acc + s.words, 0)
  assert.equal(t.total, sum)
  assert.ok(t.total > 0)
  for (const s of t.sections.filter((x) => !x.included)) assert.equal(s.words, 0)
})

test('remaining, over and percent are derived from the limit', () => {
  const t = base()
  assert.equal(t.limit, 4000)
  assert.equal(t.remaining, 4000 - t.total)
  assert.equal(t.over, 0)
  assert.equal(t.percent, t.total / 4000)
})

test('going over the limit reports the overage and zero remaining', () => {
  const long = analyze({
    blocks: htmlToBlocks(`<h1>Introduction</h1><p>${'word '.repeat(4200)}</p>`),
    notes: [],
  })
  const t = computeTotals(long, emptyOverrides())
  assert.equal(t.total, 4200)
  assert.equal(t.over, 200)
  assert.equal(t.remaining, 0)
})

test('an explanatory note adds to its section, a citation note does not', () => {
  const t = base()
  const intro = t.sections.find((s) => s.kind === 'introduction')
  const conclusion = t.sections.find((s) => s.kind === 'conclusion')
  assert.equal(intro.noteWords, 0)
  assert.ok(conclusion.noteWords > 0)
})

test('re-including the appendix adds its prose but never its heading', () => {
  const appendix = sectionOfKind('appendix')
  const before = base().total
  const after = computeTotals(analysis, { ...emptyOverrides(), sections: { [appendix.id]: true } })
  assert.ok(appendix.headingWords > 0)
  assert.equal(after.total, before + appendix.allWords - appendix.headingWords)
})

test('excluding the introduction lowers the total and drops its notes with it', () => {
  const intro = sectionOfKind('introduction')
  const t = computeTotals(analysis, { ...emptyOverrides(), sections: { [intro.id]: false } })
  assert.ok(t.total < base().total)
  for (const note of t.notes.filter((n) => n.sectionId === intro.id)) {
    assert.equal(note.included, false)
    assert.equal(note.sectionExcluded, true)
  }
})

test('turning a citation note back on adds its words', () => {
  const before = base().total
  const t = computeTotals(analysis, { ...emptyOverrides(), notes: { 'footnote-2': true } })
  assert.equal(t.total, before + analysis.notes.find((n) => n.uid === 'footnote-2').words)
})

test('an unplaced note can still be counted by hand', () => {
  const orphan = analysis.notes.find((n) => n.uid === 'endnote-9')
  assert.equal(base().notes.find((n) => n.uid === orphan.uid).included, false)
  const t = computeTotals(analysis, { ...emptyOverrides(), notes: { 'endnote-9': true } })
  assert.equal(t.notes.find((n) => n.uid === orphan.uid).included, true)
})

test('turning a citation bracket back on adds its words', () => {
  const intro = base().sections.find((s) => s.kind === 'introduction')
  const cite = intro.parens.find((p) => !p.included)
  const before = base().total
  const t = computeTotals(analysis, { ...emptyOverrides(), parens: { [cite.id]: true } })
  assert.equal(t.total, before + cite.words)
})

test('headings, tables, captions and citations are itemised as exclusions', () => {
  const t = base()
  for (const key of ['headings', 'tables', 'captions', 'citations']) {
    assert.ok(row(t, key), `missing exclusion row: ${key}`)
  }
  assert.equal(row(t, 'tables').words, 2)
  assert.equal(row(t, 'tables').count, 1)
})

test('a title line inside a counted section is itemised as an exclusion', () => {
  const withTitle = analyze({
    blocks: htmlToBlocks('<h1>Introduction</h1><p class="doc-title">A Subtitle Line</p><p>Body text.</p>'),
    notes: [],
  })
  const t = computeTotals(withTitle, emptyOverrides())
  assert.equal(row(t, 'titles').words, 3)
})

test('a Word bibliography entry inside a counted section is excluded', () => {
  const withBib = analyze({
    blocks: htmlToBlocks('<h1>Introduction</h1><p>Body text.</p><p class="bib-entry">Smith, J. (2019). Kinetics.</p>'),
    notes: [],
  })
  const t = computeTotals(withBib, emptyOverrides())
  assert.equal(row(t, 'bibentries').count, 1)
  assert.ok(row(t, 'bibentries').words > 0)
  assert.equal(t.total, 2)
})

test('excluded sections are grouped by kind with their titles listed', () => {
  const t = base()
  assert.equal(row(t, 'section:bibliography').words, sectionOfKind('bibliography').allWords)
  assert.equal(row(t, 'section:appendix').detail, 'Appendix A')
})

test('citation-only notes and notes in dropped sections are itemised separately', () => {
  const t = base()
  assert.ok(row(t, 'notes-citation').words > 0)
  assert.ok(row(t, 'notes-elsewhere').words > 0)
})

test('headers and footers are reported as present but unmeasurable', () => {
  const headers = row(base(), 'headers')
  assert.equal(headers.words, null)
  assert.equal(base().excludedTotal, base().excluded.reduce((a, r) => a + (r.words || 0), 0))
})

test('note statistics add up', () => {
  const { noteStats, notes } = base()
  assert.equal(noteStats.total, notes.length)
  assert.equal(noteStats.included + noteStats.excluded, noteStats.total)
})

test('rows with neither words nor items are left out entirely', () => {
  const t = base()
  for (const r of t.excluded) assert.ok(r.words || r.count || r.words === null, `empty row: ${r.key}`)
})

test('the predicates fall back to the classification when no override is set', () => {
  const overrides = emptyOverrides()
  const intro = sectionOfKind('introduction')
  assert.equal(isSectionIncluded(intro, overrides), true)
  assert.equal(isSectionIncluded(intro, { ...overrides, sections: { [intro.id]: false } }), false)

  const cite = intro.parens.find((p) => p.verdict === 'citation')
  assert.equal(isParenIncluded(cite, overrides), false)
  assert.equal(isParenIncluded(cite, { ...overrides, parens: { [cite.id]: true } }), true)

  const note = analysis.notes.find((n) => n.uid === 'footnote-3')
  assert.equal(isNoteIncluded(note, overrides, () => true), true)
  assert.equal(isNoteIncluded(note, overrides, () => false), false)
})

test('computeTotals never mutates the analysis it is given', () => {
  const snapshot = JSON.stringify(analysis)
  computeTotals(analysis, { ...emptyOverrides(), sections: { [sectionOfKind('appendix').id]: true } })
  assert.equal(JSON.stringify(analysis), snapshot)
})
