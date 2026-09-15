import './helpers/dom.js'
import test from 'node:test'
import assert from 'node:assert/strict'
import { analyze, analyzeProse, WORD_LIMIT } from '../src/lib/analyze.js'
import { htmlToBlocks } from '../src/lib/docx.js'

const find = (sections, kind) => sections.find((s) => s.kind === kind)
const flagTitles = (a) => a.flags.map((f) => f.title)

test('the limit is the IB 4,000 words', () => {
  assert.equal(WORD_LIMIT, 4000)
})

test('analyzeProse separates core words from bracketed spans', () => {
  const { coreWords, spans } = analyzeProse('The rate rose sharply (Smith, 2019) in every trial.', 'b0')
  assert.equal(coreWords, 7)
  assert.equal(spans.length, 1)
  assert.equal(spans[0].verdict, 'citation')
  assert.equal(spans[0].words, 2)
})

test('removing a bracketed span never welds its neighbours into one word', () => {
  const { coreWords } = analyzeProse('rate(Smith 2019)rose', 'b0')
  assert.equal(coreWords, 2)
})

test('analyzeProse handles square brackets and keeps context for the UI', () => {
  const { spans } = analyzeProse('As shown [12] the rate is constant.', 'b0')
  assert.equal(spans[0].verdict, 'citation')
  assert.ok(spans[0].context.includes('[12]'))
})

test('a span with no countable words is ignored', () => {
  const { spans } = analyzeProse('a sentence (-) with an empty bracket', 'b0')
  assert.equal(spans.length, 0)
})

const ESSAY = [
  '<p class="doc-title">The Effect of Temperature on Reaction Rate</p>',
  '<p class="toc-entry">Introduction 1</p>',
  '<h1>Introduction</h1>',
  '<p>This essay examines the rate of reaction at 25C (77F) under controlled conditions (Smith, 2019).' +
    '<sup><a href="#footnote-2">[1]</a></sup></p>',
  '<table><tr><td>Trial</td><td>Rate</td></tr></table>',
  '<p class="caption">Table 1: Results of the experiment</p>',
  '<h1>Conclusion</h1>',
  '<p>The hypothesis was supported by the data.<sup><a href="#footnote-3">[2]</a></sup></p>',
  '<h1>Bibliography</h1>',
  '<p>Smith, J. (2019). Reaction Kinetics. Oxford University Press.</p>',
  '<h1>Appendix A</h1>',
  '<p>Raw data and additional calculations are presented here.</p>',
  '<h2>A.1 Calibration</h2>',
  '<p>Nested under the appendix, so it must not count either.</p>',
].join('')

const NOTES = [
  {
    id: '2',
    kind: 'footnote',
    text: 'Smith, J. (2019). Reaction Kinetics. Oxford: Oxford University Press, pp. 14-19.',
  },
  {
    id: '3',
    kind: 'footnote',
    text:
      'It is worth noting that this measurement was taken before the apparatus was recalibrated, ' +
      'which arguably explains the outlier.',
  },
  { id: '9', kind: 'endnote', text: 'An orphan note whose marker never appears in the body text at all.' },
]

const essay = () =>
  analyze({
    blocks: htmlToBlocks(ESSAY),
    notes: NOTES,
    source: 'docx',
    fileName: 'essay.docx',
    docScan: { equations: 1, textBoxes: 0, embeddedObjects: 0 },
    hasHeaderFooter: true,
    messages: [],
  })

test('front matter before the first heading is excluded', () => {
  assert.equal(find(essay().sections, 'frontmatter').counted, false)
})

test('introduction and conclusion count; bibliography and appendix do not', () => {
  const { sections } = essay()
  assert.equal(find(sections, 'introduction').counted, true)
  assert.equal(find(sections, 'conclusion').counted, true)
  assert.equal(find(sections, 'bibliography').counted, false)
  assert.equal(find(sections, 'appendix').counted, false)
})

test('a subsection nested under an appendix is swallowed by it', () => {
  const nested = essay().sections.find((s) => /Calibration/.test(s.displayTitle))
  assert.equal(nested.level, 2)
  assert.equal(nested.counted, false)
  assert.equal(nested.inheritedFrom, 'Appendix A')
})

test('notes are attached to the section holding their marker', () => {
  const a = essay()
  const intro = find(a.sections, 'introduction')
  assert.deepEqual(intro.notes, ['footnote-2'])
  assert.equal(a.notes.find((n) => n.uid === 'footnote-2').sectionId, intro.id)
})

test('a note whose marker is missing is left unplaced', () => {
  assert.equal(essay().notes.find((n) => n.uid === 'endnote-9').sectionId, null)
})

test('citation and explanatory notes are told apart', () => {
  const a = essay()
  assert.equal(a.notes.find((n) => n.uid === 'footnote-2').classification, 'citation')
  assert.equal(a.notes.find((n) => n.uid === 'footnote-3').classification, 'explanatory')
})

test('tables and styled captions are measured but kept out of the prose count', () => {
  const intro = find(essay().sections, 'introduction')
  assert.equal(intro.tableCount, 1)
  assert.equal(intro.tableWords, 2)
  assert.equal(intro.captionCount, 1)
})

test('equations and unplaced notes are surfaced as things to check', () => {
  const a = essay()
  assert.ok(flagTitles(a).some((t) => /equation object/.test(t)))
  assert.ok(a.uncertain.some((u) => u.kind === 'note' && /could not be located/.test(u.title)))
})

test('an abstract is excluded and flagged as no longer permitted', () => {
  const a = analyze({
    blocks: htmlToBlocks(
      '<h1>Abstract</h1><p>This essay investigates reaction rates.</p><h1>Introduction</h1><p>Body.</p>',
    ),
    notes: [],
  })
  assert.equal(find(a.sections, 'abstract').counted, false)
  assert.ok(flagTitles(a).some((t) => /abstract/i.test(t)))
})

test('a missing introduction heading is flagged', () => {
  const a = analyze({ blocks: htmlToBlocks('<h1>Methodology</h1><p>Body text here.</p>'), notes: [] })
  assert.ok(flagTitles(a).some((t) => /Introduction/.test(t) && /No/.test(t)))
})

test('a document with no heading styles is flagged', () => {
  const a = analyze({ blocks: htmlToBlocks('<p>Just a paragraph of body text.</p>'), notes: [] })
  assert.ok(flagTitles(a).some((t) => /No Word Heading styles/.test(t)))
})

test('pasted text is flagged more gently, as info rather than a warning', () => {
  const a = analyze({ blocks: htmlToBlocks('<p>Just a paragraph.</p>'), notes: [], source: 'text' })
  assert.equal(a.flags.find((f) => /no styles to read/.test(f.title)).level, 'info')
})

test('body prose after the bibliography is excluded but reported as uncertain', () => {
  const a = analyze({
    blocks: htmlToBlocks(
      '<h1>Introduction</h1><p>Body.</p><h1>Bibliography</h1><p>Smith.</p><h1>Extra Thoughts</h1><p>Stray text.</p>',
    ),
    notes: [],
  })
  const stray = a.sections.find((s) => s.displayTitle === 'Extra Thoughts')
  assert.equal(stray.counted, false)
  assert.equal(stray.uncertain, true)
  assert.ok(a.uncertain.some((u) => u.kind === 'section'))
})

test('a heading guessed from a plain paragraph is reported as a guess', () => {
  const a = analyze({
    blocks: htmlToBlocks('<p>Introduction</p><p>Body text follows here.</p>'),
    notes: [],
    source: 'text',
  })
  assert.equal(find(a.sections, 'introduction').inferredHeading, true)
  assert.ok(a.uncertain.some((u) => u.kind === 'heading'))
})

test('conversion warnings are passed through, other messages are not', () => {
  const a = analyze({
    blocks: htmlToBlocks('<p>Body.</p>'),
    notes: [],
    messages: [
      { type: 'warning', message: 'Unrecognised paragraph style' },
      { type: 'info', message: 'ignore me' },
    ],
  })
  assert.deepEqual(a.styleMessages, ['Unrecognised paragraph style'])
})
