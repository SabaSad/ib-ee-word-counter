/**
 * .docx reading: mammoth for structured HTML, JSZip for the raw OOXML parts.
 *
 * Mammoth gives us heading levels, tables and in-place note markers. It does
 * not give us usable footnote *content* for this job, so footnotes.xml and
 * endnotes.xml are read straight out of the zip instead.
 */

import mammoth from 'mammoth'
import JSZip from 'jszip'
import { normalize } from './tokenize.js'

const W_NS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'

/**
 * Preserve the styles we reason about later. Word's caption and TOC styles are
 * dropped by mammoth's default map, and both mark text that must not count.
 */
export const STYLE_MAP = [
  "p[style-name='Caption'] => p.caption:fresh",
  "p[style-name='Table Caption'] => p.caption:fresh",
  "p[style-name='Figure Caption'] => p.caption:fresh",
  "p[style-name='Image Caption'] => p.caption:fresh",
  "p[style-name^='toc'] => p.toc-entry:fresh",
  "p[style-name='TOC Heading'] => h1:fresh",
  "p[style-name='Title'] => p.doc-title:fresh",
  "p[style-name='Subtitle'] => p.doc-subtitle:fresh",
  "p[style-name='Bibliography'] => p.bib-entry:fresh",
  "p[style-name='Quote'] => blockquote:fresh",
  "p[style-name='Intense Quote'] => blockquote:fresh",
]

function domParser() {
  if (typeof globalThis.DOMParser !== 'function') {
    throw new Error('DOMParser is unavailable in this environment')
  }
  return new globalThis.DOMParser()
}

function childElements(node, localName) {
  return Array.from(node.childNodes).filter(
    (child) => child.nodeType === 1 && (child.localName || child.nodeName.replace(/^.*:/, '')) === localName,
  )
}

function localName(node) {
  return node.localName || node.nodeName.replace(/^.*:/, '')
}

function attr(node, name) {
  return node.getAttributeNS?.(W_NS, name) ?? node.getAttribute(`w:${name}`) ?? node.getAttribute(name)
}

/**
 * Flatten a `<w:footnote>` / `<w:endnote>` element into plain text, honouring
 * paragraph breaks, tabs and line breaks, and skipping field instruction codes
 * (which carry hyperlink plumbing rather than visible text).
 */
function noteText(noteEl) {
  const pieces = []
  const walk = (node) => {
    for (const child of Array.from(node.childNodes)) {
      if (child.nodeType !== 1) continue
      const name = localName(child)
      if (name === 'instrText' || name === 'delText' || name === 'footnoteRef' || name === 'endnoteRef') continue
      if (name === 't') {
        pieces.push(child.textContent || '')
      } else if (name === 'tab') {
        pieces.push(' ')
      } else if (name === 'br' || name === 'cr') {
        pieces.push('\n')
      } else {
        walk(child)
        if (name === 'p') pieces.push('\n')
      }
    }
  }
  walk(noteEl)
  return pieces.join('').replace(/\n{2,}/g, '\n').trim()
}

const SEPARATOR_TYPES = new Set(['separator', 'continuationSeparator', 'continuationNotice'])

function parseNotesPart(xml, kind) {
  if (!xml) return []
  const doc = domParser().parseFromString(xml, 'application/xml')
  if (doc.getElementsByTagName('parsererror').length) return []
  const root = doc.documentElement
  const elementName = kind === 'footnote' ? 'footnote' : 'endnote'
  const notes = []
  for (const el of childElements(root, elementName)) {
    const type = attr(el, 'type')
    if (type && SEPARATOR_TYPES.has(type)) continue
    const id = attr(el, 'id')
    if (id === null || Number(id) < 0) continue
    const text = noteText(el)
    if (!text) continue
    notes.push({ id: String(id), kind, text: normalize(text), rawText: text })
  }
  return notes
}

/** Things we can see in the XML but cannot reliably turn into countable text. */
function scanDocumentXml(xml) {
  const result = { equations: 0, embeddedObjects: 0, textBoxes: 0 }
  if (!xml) return result
  result.equations = (xml.match(/<m:oMath(?![a-zA-Z])/g) || []).length
  result.embeddedObjects = (xml.match(/<w:object(?![a-zA-Z])/g) || []).length
  result.textBoxes = (xml.match(/<w:txbxContent(?![a-zA-Z])/g) || []).length
  return result
}

/**
 * Read a .docx ArrayBuffer.
 *
 * @returns {Promise<{html: string, messages: Array, notes: Array, docScan: object, hasHeaderFooter: boolean}>}
 */
export async function readDocx(arrayBuffer) {
  const [conversion, zip] = await Promise.all([
    mammoth.convertToHtml(
      { arrayBuffer },
      {
        styleMap: STYLE_MAP,
        includeDefaultStyleMap: true,
        // Images never count; keep them out of the HTML entirely.
        convertImage: mammoth.images.imgElement(() => ({ src: '' })),
      },
    ),
    JSZip.loadAsync(arrayBuffer),
  ])

  const read = async (path) => (zip.file(path) ? zip.file(path).async('string') : null)
  const [footnotesXml, endnotesXml, documentXml] = await Promise.all([
    read('word/footnotes.xml'),
    read('word/endnotes.xml'),
    read('word/document.xml'),
  ])

  const notes = [...parseNotesPart(footnotesXml, 'footnote'), ...parseNotesPart(endnotesXml, 'endnote')]
  const hasHeaderFooter = Object.keys(zip.files).some((name) => /^word\/(header|footer)\d*\.xml$/.test(name))

  return {
    html: conversion.value,
    messages: conversion.messages || [],
    notes,
    docScan: scanDocumentXml(documentXml),
    hasHeaderFooter,
  }
}

/**
 * Turn mammoth's HTML into an ordered list of blocks.
 *
 * Each block records its own text with note markers and images stripped out, so
 * the superscript reference numbers never leak into the word count, plus the
 * ids of any notes anchored inside it (used to place each note in a section).
 */
export function htmlToBlocks(html) {
  const doc = domParser().parseFromString(`<!doctype html><html><body>${html}</body></html>`, 'text/html')
  const blocks = []

  const isNotesList = (el) =>
    el.tagName === 'OL' && !!el.querySelector('li[id^="footnote-"], li[id^="endnote-"]')

  /**
   * Block-level descendants whose text must not weld onto its neighbour.
   * `<td>Trial</td><td>Rate</td>` has to read as two words, not `TrialRate`.
   */
  const BLOCK_LEVEL = 'td, th, p, li, br, div, h1, h2, h3, h4, h5, h6'

  const extract = (el) => {
    const clone = el.cloneNode(true)
    for (const node of Array.from(clone.querySelectorAll(BLOCK_LEVEL))) {
      node.parentNode?.insertBefore(doc.createTextNode(' '), node.nextSibling)
    }
    const refs = []
    for (const anchor of Array.from(clone.querySelectorAll('a[href]'))) {
      const href = anchor.getAttribute('href') || ''
      const match = /^#(foot|end)note-(-?\d+)$/.exec(href)
      if (match) {
        refs.push({ kind: `${match[1]}note`, id: match[2] })
        const parent = anchor.parentNode
        anchor.remove()
        // The marker lived inside a <sup>; drop the now-empty wrapper too.
        if (parent && parent.tagName === 'SUP' && !normalize(parent.textContent)) parent.remove()
      } else if (/^#(foot|end)note-ref-/.test(href)) {
        anchor.remove()
      }
    }
    for (const img of Array.from(clone.querySelectorAll('img'))) img.remove()
    return { text: normalize(clone.textContent), refs }
  }

  for (const el of Array.from(doc.body.children)) {
    if (isNotesList(el)) continue
    const tag = el.tagName
    const { text, refs } = extract(el)

    if (/^H[1-6]$/.test(tag)) {
      blocks.push({ type: 'heading', level: Number(tag[1]), text, refs, inferred: false })
    } else if (tag === 'TABLE') {
      const rows = el.querySelectorAll('tr').length
      blocks.push({ type: 'table', text, refs, rows })
    } else if (el.classList.contains('toc-entry')) {
      blocks.push({ type: 'toc', text, refs })
    } else if (el.classList.contains('caption')) {
      blocks.push({ type: 'caption', text, refs, certainty: 'style' })
    } else if (el.classList.contains('bib-entry')) {
      blocks.push({ type: 'bibentry', text, refs })
    } else if (el.classList.contains('doc-title') || el.classList.contains('doc-subtitle')) {
      blocks.push({ type: 'title', text, refs })
    } else if (tag === 'UL' || tag === 'OL') {
      blocks.push({ type: 'paragraph', text, refs, list: true })
    } else {
      if (!text) continue
      blocks.push({ type: 'paragraph', text, refs })
    }
  }
  return blocks
}

/** Build the same block list from pasted plain text, one block per non-empty line. */
export function textToBlocks(raw) {
  return String(raw || '')
    .split(/\r?\n/)
    .map((line) => normalize(line))
    .filter(Boolean)
    .map((text) => ({ type: 'paragraph', text, refs: [] }))
}
