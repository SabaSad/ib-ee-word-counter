import './helpers/dom.js'
import test from 'node:test'
import assert from 'node:assert/strict'
import { htmlToBlocks, textToBlocks } from '../src/lib/docx.js'

const types = (blocks) => blocks.map((b) => b.type)

test('maps mammoth headings to heading blocks with their level', () => {
  const blocks = htmlToBlocks('<h1>Introduction</h1><h3>Method</h3>')
  assert.deepEqual(types(blocks), ['heading', 'heading'])
  assert.equal(blocks[0].level, 1)
  assert.equal(blocks[1].level, 3)
})

test('table cells do not weld into one another', () => {
  const blocks = htmlToBlocks('<table><tr><td>Trial</td><td>Rate</td></tr><tr><td>One</td><td>Fast</td></tr></table>')
  assert.equal(blocks[0].type, 'table')
  assert.equal(blocks[0].text, 'Trial Rate One Fast')
  assert.equal(blocks[0].rows, 2)
})

test('paragraphs inside a table cell stay separate words too', () => {
  const blocks = htmlToBlocks('<table><tr><td><p>first</p><p>second</p></td></tr></table>')
  assert.equal(blocks[0].text, 'first second')
})

test('list items do not weld together', () => {
  const blocks = htmlToBlocks('<ul><li>alpha</li><li>beta</li></ul>')
  assert.equal(blocks[0].type, 'paragraph')
  assert.equal(blocks[0].list, true)
  assert.equal(blocks[0].text, 'alpha beta')
})

test('styled captions, contents entries and titles get their own block types', () => {
  const blocks = htmlToBlocks(
    '<p class="doc-title">An Essay</p><p class="toc-entry">Introduction 1</p><p class="caption">Table 1: Results</p>',
  )
  assert.deepEqual(types(blocks), ['title', 'toc', 'caption'])
  assert.equal(blocks[2].certainty, 'style')
})

test("Word's Bibliography paragraph style is recognised", () => {
  const blocks = htmlToBlocks('<p class="bib-entry">Smith, J. (2019). Reaction Kinetics.</p>')
  assert.deepEqual(types(blocks), ['bibentry'])
})

test('footnote markers are stripped from the text and recorded as refs', () => {
  const blocks = htmlToBlocks(
    '<p>The rate was constant.<sup><a href="#footnote-2" id="footnote-ref-2">[1]</a></sup></p>',
  )
  assert.equal(blocks[0].text, 'The rate was constant.')
  assert.deepEqual(blocks[0].refs, [{ kind: 'footnote', id: '2' }])
})

test('endnote markers are recorded with their own kind', () => {
  const blocks = htmlToBlocks('<p>Text.<sup><a href="#endnote-5">[1]</a></sup></p>')
  assert.deepEqual(blocks[0].refs, [{ kind: 'endnote', id: '5' }])
})

test("mammoth's rendered notes list at the foot of the document is skipped", () => {
  const blocks = htmlToBlocks(
    '<p>Body text here.</p><ol><li id="footnote-2"><p>Smith, J. (2019). <a href="#footnote-ref-2">back</a></p></li></ol>',
  )
  assert.deepEqual(types(blocks), ['paragraph'])
})

test('images never reach the text', () => {
  const blocks = htmlToBlocks('<p>Before <img src="x" alt="a long descriptive alt text"> after</p>')
  assert.equal(blocks[0].text, 'Before after')
})

test('empty paragraphs are dropped', () => {
  const blocks = htmlToBlocks('<p></p><p>   </p><p>real</p>')
  assert.deepEqual(types(blocks), ['paragraph'])
})

test('block quotations stay countable prose', () => {
  const blocks = htmlToBlocks('<blockquote>A directly quoted sentence.</blockquote>')
  assert.deepEqual(types(blocks), ['paragraph'])
})

test('pasted text becomes one paragraph block per non-empty line', () => {
  const blocks = textToBlocks('Introduction\n\n  The first line.  \n\nConclusion\n')
  assert.deepEqual(types(blocks), ['paragraph', 'paragraph', 'paragraph'])
  assert.deepEqual(
    blocks.map((b) => b.text),
    ['Introduction', 'The first line.', 'Conclusion'],
  )
  assert.deepEqual(blocks[0].refs, [])
})

test('pasted text handles empty and nullish input', () => {
  assert.deepEqual(textToBlocks(''), [])
  assert.deepEqual(textToBlocks(null), [])
})
