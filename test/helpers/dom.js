/**
 * The docx reader needs a DOMParser. Node has none, so tests install jsdom's
 * before importing anything under src/lib/docx.js.
 */
import { JSDOM } from 'jsdom'

globalThis.DOMParser = new JSDOM('').window.DOMParser
