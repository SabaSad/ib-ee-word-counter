/**
 * Regression tests for the failure that mattered most: a typed contents page
 * being read as real headings, which excluded an entire 4,000-word essay as
 * "back matter" and reported 4 words.
 */
import './helpers/dom.js'
import test from 'node:test'
import assert from 'node:assert/strict'
import { analyze } from '../src/lib/analyze.js'
import { htmlToBlocks } from '../src/lib/docx.js'
import { computeTotals, emptyOverrides } from '../src/lib/totals.js'
import { looksLikeHeading, tocEntryShape } from '../src/lib/sections.js'

const body = (n) => `<p>${'word '.repeat(n).trim()}</p>`

const essayWith = (contents) =>
  [
    '<p>An Investigation Into Reaction Rates</p>',
    ...contents,
    '<h1>Introduction</h1>',
    body(400),
    '<h1>Methodology</h1>',
    body(900),
    '<h1>Analysis</h1>',
    body(1600),
    '<h1>Conclusion</h1>',
    body(800),
    '<h1>Bibliography</h1>',
    body(200),
  ].join('')

const countOf = (html) => {
  const a = analyze({ blocks: htmlToBlocks(html), notes: [], source: 'docx', fileName: 'ee.docx' })
  return { analysis: a, totals: computeTotals(a, emptyOverrides()) }
}

test('a contents entry is recognised by its page number', () => {
  assert.equal(tocEntryShape('Bibliography 14'), true)
  assert.equal(tocEntryShape('Introduction .......... 3'), true)
  assert.equal(tocEntryShape('Conclusion … 12'), true)
  assert.equal(tocEntryShape('Introduction'), false)
  assert.equal(tocEntryShape('Bibliography'), false)
})

test('a contents entry never reads as a heading', () => {
  assert.equal(looksLikeHeading('Bibliography'), true)
  assert.equal(looksLikeHeading('Bibliography 14'), false)
  assert.equal(looksLikeHeading('Introduction .......... 3'), false)
})

test('a typed contents page does not swallow the essay', () => {
  const { totals } = countOf(
    essayWith([
      '<p>Contents</p>',
      '<p>Introduction 1</p>',
      '<p>Methodology 3</p>',
      '<p>Analysis 6</p>',
      '<p>Conclusion 12</p>',
      '<p>Bibliography 14</p>',
    ]),
  )
  assert.equal(totals.total, 3700)
})

test('a contents page with dot leaders does not swallow the essay', () => {
  const { totals } = countOf(
    essayWith([
      '<p>Table of Contents</p>',
      '<p>Introduction .......... 1</p>',
      '<p>Methodology ........... 3</p>',
      '<p>Analysis .............. 6</p>',
      '<p>Bibliography .......... 14</p>',
    ]),
  )
  assert.equal(totals.total, 3700)
})

test('a contents list with no “Contents” title above it is still recognised', () => {
  const { totals } = countOf([
    '<p>Introduction 1</p>',
    '<p>Methodology 3</p>',
    '<p>Analysis 6</p>',
    '<p>Bibliography 14</p>',
    '<h1>Introduction</h1>',
    body(400),
    '<h1>Analysis</h1>',
    body(1600),
    '<h1>Bibliography</h1>',
    body(200),
  ].join(''))
  assert.equal(totals.total, 2000)
})

test('the contents page itself is still excluded, not counted', () => {
  const { totals } = countOf(
    essayWith(['<p>Contents</p>', '<p>Introduction 1</p>', '<p>Analysis 6</p>', '<p>Bibliography 14</p>']),
  )
  const contents = totals.sections.find((s) => s.kind === 'contents')
  assert.equal(contents.included, false)
  assert.equal(totals.total, 3700)
})

test('a real stray section after the bibliography is still excluded', () => {
  // Small amount of trailing text, large essay before it: the heading is right.
  const { analysis } = countOf(
    [
      '<h1>Introduction</h1>',
      body(2000),
      '<h1>Bibliography</h1>',
      body(200),
      '<h1>Extra Thoughts</h1>',
      body(30),
    ].join(''),
  )
  const stray = analysis.sections.find((s) => s.displayTitle === 'Extra Thoughts')
  assert.equal(stray.counted, false)
  assert.equal(stray.uncertain, true)
})

test('an essay sitting mostly after a bibliography heading is kept, not dropped', () => {
  // The inverse: almost everything is after the heading, so the heading is wrong.
  const { analysis, totals } = countOf(
    ['<h1>Bibliography</h1>', body(50), '<h1>Analysis</h1>', body(3000)].join(''),
  )
  assert.equal(totals.total, 3000)
  const kept = analysis.sections.find((s) => s.displayTitle === 'Analysis')
  assert.equal(kept.counted, true)
  assert.ok(analysis.uncertain.some((u) => /sits after a bibliography/.test(u.title)))
})

test('excluding most of the document raises a loud warning', () => {
  const { analysis } = countOf(['<h1>Appendix A</h1>', body(3000), '<h1>Introduction</h1>', body(100)].join(''))
  const warning = analysis.flags.find((f) => /are being counted/.test(f.title))
  assert.ok(warning, 'expected an undercount warning')
  assert.equal(warning.level, 'warn')
})

test('a normal essay raises no undercount warning', () => {
  const { analysis } = countOf(essayWith(['<p>Contents</p>', '<p>Introduction 1</p>', '<p>Bibliography 14</p>']))
  assert.equal(
    analysis.flags.some((f) => /are being counted/.test(f.title)),
    false,
  )
})

test('short numbered lines in the middle of an essay are not mistaken for contents', () => {
  const { totals } = countOf(
    ['<h1>Introduction</h1>', body(1500), '<p>Trial 1</p>', '<p>Trial 2</p>', '<p>Trial 3</p>', body(1500)].join(''),
  )
  // The three data lines still count as body prose.
  assert.equal(totals.total, 3006)
})

test('a “Summary” heading before the introduction is an abstract and is excluded', () => {
  const { analysis, totals } = countOf(
    ['<h1>Summary</h1>', body(200), '<h1>Introduction</h1>', body(1000)].join(''),
  )
  const summary = analysis.sections.find((s) => s.displayTitle === 'Summary')
  assert.equal(summary.kind, 'abstract')
  assert.equal(summary.counted, false)
  assert.equal(totals.total, 1000)
  assert.ok(analysis.flags.some((f) => /abstract/i.test(f.title)))
})

test('a “Summary” heading after the introduction is body text and counts', () => {
  const { analysis, totals } = countOf(
    ['<h1>Introduction</h1>', body(1000), '<h1>Conclusion</h1>', body(500), '<h3>Summary</h3>', body(200)].join(''),
  )
  const summary = analysis.sections.find((s) => s.displayTitle === 'Summary')
  assert.equal(summary.kind, 'body')
  assert.equal(summary.counted, true)
  assert.equal(totals.total, 1700)
})

test('a late summary raises no “remove your abstract” warning, but is listed for review', () => {
  const { analysis } = countOf(
    ['<h1>Introduction</h1>', body(1000), '<h3>Summary</h3>', body(200)].join(''),
  )
  assert.equal(
    analysis.flags.some((f) => /abstract/i.test(f.title)),
    false,
  )
  assert.ok(analysis.uncertain.some((u) => /not as an abstract/.test(u.title)))
})
