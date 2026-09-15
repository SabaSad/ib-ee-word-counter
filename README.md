# EE Word Counter

A browser-only word counter for the IB Extended Essay. Drop in a `.docx` and it counts the essay
against the IB's 4,000-word rules — excluding the title page, contents, captions, tables, citations,
appendices and the bibliography, and separating explanatory footnotes (which count) from pure
references (which don't).

**Nothing is uploaded.** The file is read in the browser with `mammoth` and `JSZip`. There is no
server and no network request.

> This is a best-effort estimate, not an official IB word count. Telling an explanatory footnote from
> a citation, and a reference from an ordinary parenthesis, cannot be done reliably by pattern
> matching. The app shows every judgement call it made and lets you overrule each one, but do a final
> manual check before you submit.

## Running it

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # static bundle in dist/
npm run preview  # serve the built bundle
npm test         # 107 tests, no browser needed
```

`dist/` is a plain static site — any static host will serve it.

## What counts, and what doesn't

| Counts | Doesn't count |
| --- | --- |
| Introduction, main body, conclusion | Title page, contents page |
| Direct quotations | Acknowledgements |
| Footnotes/endnotes that explain rather than cite | Maps, charts, diagrams, tables and their captions |
| Prose discussing a table, chart or diagram | Equations, formulae and calculations |
| Parenthetical text that is not a citation | Citations and references, in text or in notes |
| Each unit of a multi-unit measurement — `25°C (77°F)` is two words | Bibliography, appendices, the RPPF, headings, headers and footers |

An abstract has been neither required nor permitted since the 2018 reform. If one is found it is
excluded and flagged for removal.

## How it works

The pipeline is deliberately split so that no single step decides a number:

| Module | Responsibility |
| --- | --- |
| `src/lib/docx.js` | Reads the `.docx`. `mammoth` gives structured HTML (heading levels, tables, note markers); `JSZip` reads `footnotes.xml`/`endnotes.xml` directly, because mammoth does not expose usable note *content*. Also scans `document.xml` for equations, text boxes and embedded objects. |
| `src/lib/tokenize.js` | Defines a word: any whitespace-delimited token with a letter or digit. Splits brackets off their neighbours first, so `25°C(77°F)` is two words. Hyphenated compounds stay as one, matching Word. |
| `src/lib/sections.js` | Recognises structural headings (contents, abstract, bibliography, appendix, RPPF…) and caption shapes. |
| `src/lib/patterns.js` | Scored heuristics separating citations from prose, for both bracketed spans and whole notes. Every verdict carries the reasons behind it. |
| `src/lib/analyze.js` | Builds the document model: segments sections, measures every block, attaches notes to sections, raises flags. **Decides nothing about the final number.** |
| `src/lib/totals.js` | Pure `(analysis, overrides) → totals`. Every toggle in the UI recomputes the whole count without re-parsing the document. |

Two rules keep the estimate honest:

- **Uncertainty is surfaced, not resolved.** A bare `(1919)` could be an author–date citation or a
  date in your prose, so it is counted *and* listed for review rather than silently dropped.
- **Every automatic call is reversible.** Sections, footnotes and bracketed spans each have their own
  override, and the total updates live.

### Accuracy depends on Word heading styles

Section detection reads Word's built-in Heading 1/2/3 styles. Without them the app falls back to
recognising heading-like lines, which only catches the standard structural headings. Google Docs
preserves heading styles through **File → Download → Microsoft Word (.docx)**.

Pasted plain text works but carries no footnotes, tables or styles, so expect a rougher estimate.

## Known limits

- Text inside Word text boxes is not extracted; it is detected and reported, not counted.
- Equations and embedded objects cannot be read as text. They are excluded, as the rules require, and
  flagged so you can check that no prose was swallowed with them.
- Nested brackets are matched innermost-first.
- `.doc` and `.pdf` are not supported — save as `.docx` first.

## Testing

```bash
npm test
```

107 tests over the tokenizer, section classification, citation heuristics, the `.docx` reader, the
analysis pipeline and the totals calculation. The `.docx` reader tests run against `jsdom`, so the
whole suite runs in Node with no browser.

## Licence

MIT
