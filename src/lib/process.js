import { htmlToBlocks, readDocx, textToBlocks } from './docx.js'
import { analyze } from './analyze.js'

export async function processDocxFile(file) {
  const buffer = await file.arrayBuffer()
  const { html, messages, notes, docScan, hasHeaderFooter } = await readDocx(buffer)
  const blocks = htmlToBlocks(html)
  if (!blocks.length) {
    throw new Error('No readable text was found in that file. If it came from Google Docs, re-export it with File → Download → Microsoft Word (.docx).')
  }
  return analyze({ blocks, notes, source: 'docx', fileName: file.name, docScan, hasHeaderFooter, messages })
}

export function processPastedText(text) {
  const blocks = textToBlocks(text)
  if (!blocks.length) throw new Error('There is no text to count.')
  return analyze({ blocks, notes: [], source: 'text', fileName: 'Pasted text' })
}
