import test from 'node:test'
import assert from 'node:assert/strict'
import { captionShape, classifyHeading, looksLikeHeading, stripHeadingNumber } from '../src/lib/sections.js'

test('strips leading numbering and trailing punctuation from headings', () => {
  assert.equal(stripHeadingNumber('1. Introduction'), 'Introduction')
  assert.equal(stripHeadingNumber('2.3 Method of analysis'), 'Method of analysis')
  assert.equal(stripHeadingNumber('IV. Conclusion'), 'Conclusion')
  assert.equal(stripHeadingNumber('A) Background'), 'Background')
  assert.equal(stripHeadingNumber('Bibliography:'), 'Bibliography')
})

test('leaves an unnumbered heading untouched', () => {
  assert.equal(stripHeadingNumber('Research question'), 'Research question')
})

const kinds = [
  ['Contents', 'contents', false],
  ['Table of Contents', 'contents', false],
  ['Abstract', 'abstract', false],
  ['Acknowledgements', 'acknowledgements', false],
  ['Acknowledgments', 'acknowledgements', false],
  ['Bibliography', 'bibliography', false],
  ['Works Cited', 'bibliography', false],
  ['References', 'bibliography', false],
  ['Appendix A', 'appendix', false],
  ['Appendices', 'appendix', false],
  ['RPPF', 'rppf', false],
  ['Reflections on Planning and Progress', 'rppf', false],
  ['List of Figures', 'figures', false],
  ['Glossary', 'figures', false],
  ['Endnotes', 'notes', false],
  ['Introduction', 'introduction', true],
  ['Conclusion', 'conclusion', true],
  ['1. Introduction', 'introduction', true],
  ['Analysis of the data', 'body', true],
  ['Methodology', 'body', true],
]

for (const [title, kind, counted] of kinds) {
  test(`classifies “${title}” as ${kind}`, () => {
    const meta = classifyHeading(title)
    assert.equal(meta.kind, kind)
    assert.equal(meta.counted, counted)
  })
}

test('back-matter kinds are sticky so they swallow their subsections', () => {
  for (const title of ['Bibliography', 'Appendix A', 'Acknowledgements', 'RPPF']) {
    assert.equal(classifyHeading(title).sticky, true, title)
  }
})

test('a long line is never a section kind, even if it starts with one', () => {
  const meta = classifyHeading('Introduction to the many competing theories of reaction kinetics today')
  assert.equal(meta.kind, 'body')
})

test('looksLikeHeading accepts bare structural headings only', () => {
  assert.equal(looksLikeHeading('Conclusion'), true)
  assert.equal(looksLikeHeading('2. Bibliography'), true)
  // Ends in a full stop — it is a sentence, not a heading.
  assert.equal(looksLikeHeading('This is my conclusion.'), false)
  // Real heading, but not one of the known structural kinds.
  assert.equal(looksLikeHeading('Methodology'), false)
})

test('a caption with a separator is certain', () => {
  assert.equal(captionShape('Table 1: Results of the experiment'), 'certain')
  assert.equal(captionShape('Figure 3 — Rate against temperature'), 'certain')
  assert.equal(captionShape('Fig. 2. Apparatus used'), 'certain')
})

test('a label without a separator only reads as a caption beside a table', () => {
  assert.equal(captionShape('Table 3 shows a sharp rise'), 'adjacent-only')
})

test('ordinary prose is not a caption', () => {
  assert.equal(captionShape('The results were consistent across every trial run'), null)
})
