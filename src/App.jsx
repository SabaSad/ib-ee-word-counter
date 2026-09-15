import { useCallback, useMemo, useState } from 'react'
import UploadPanel from './components/UploadPanel.jsx'
import Summary from './components/Summary.jsx'
import SectionTable from './components/SectionTable.jsx'
import ExclusionTable from './components/ExclusionTable.jsx'
import NoteReview from './components/NoteReview.jsx'
import BracketReview from './components/BracketReview.jsx'
import { FlagList, UncertainList } from './components/FlagList.jsx'
import { processDocxFile, processPastedText } from './lib/process.js'
import { computeTotals, emptyOverrides } from './lib/totals.js'

export default function App() {
  const [analysis, setAnalysis] = useState(null)
  const [overrides, setOverrides] = useState(emptyOverrides)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const load = useCallback(async (run) => {
    setBusy(true)
    setError('')
    try {
      const result = await run()
      setAnalysis(result)
      setOverrides(emptyOverrides())
    } catch (e) {
      console.error(e)
      setError(e && e.message ? e.message : 'That file could not be read. Make sure it is a .docx, not a .doc or .pdf.')
    } finally {
      setBusy(false)
    }
  }, [])

  const onFile = useCallback(
    (file) => {
      if (!/\.docx$/i.test(file.name)) {
        setError(
          `“${file.name}” is not a .docx file. Word can save one with File → Save As; Google Docs exports one with File → Download → Microsoft Word.`,
        )
        return
      }
      load(() => processDocxFile(file))
    },
    [load],
  )

  const onText = useCallback((text) => load(async () => processPastedText(text)), [load])

  const totals = useMemo(() => (analysis ? computeTotals(analysis, overrides) : null), [analysis, overrides])

  const setOverride = (group) => (id, value) =>
    setOverrides((prev) => ({ ...prev, [group]: { ...prev[group], [id]: value } }))
  const resetGroup = (group) => () => setOverrides((prev) => ({ ...prev, [group]: {} }))

  return (
    <div className="app">
      <header className="masthead">
        <div className="masthead-inner">
          <div>
            <h1>Extended Essay word counter</h1>
            <p>Check your EE against the IB’s 4,000-word counting rules — entirely in your browser.</p>
          </div>
          {analysis ? (
            <button
              className="btn"
              onClick={() => {
                setAnalysis(null)
                setOverrides(emptyOverrides())
                setError('')
              }}
            >
              Check another essay
            </button>
          ) : null}
        </div>
      </header>

      <main>
        {!analysis ? (
          <>
            <UploadPanel onFile={onFile} onText={onText} busy={busy} error={error} />
            <section className="panel rules">
              <h2>What the 4,000 words include</h2>
              <div className="rules-grid">
                <div>
                  <h3 className="yes">Counts</h3>
                  <ul>
                    <li>Introduction, main body, conclusion</li>
                    <li>Direct quotations</li>
                    <li>Footnotes and endnotes that explain rather than cite</li>
                    <li>Prose discussing a table, chart or diagram</li>
                    <li>Parenthetical text that is not a citation — dates, definitions, asides</li>
                    <li>
                      Each unit of a multi-unit measurement: <code>25°C (77°F)</code> is two words
                    </li>
                  </ul>
                </div>
                <div>
                  <h3 className="no">Doesn’t count</h3>
                  <ul>
                    <li>Title page and contents page</li>
                    <li>Acknowledgements</li>
                    <li>Maps, charts, diagrams, tables and their captions</li>
                    <li>Equations, formulae and calculations</li>
                    <li>Citations and references, in text or in notes</li>
                    <li>Bibliography or works cited list</li>
                    <li>The RPPF</li>
                    <li>Headings, subheadings, headers and footers</li>
                    <li>Anything inside an appendix</li>
                  </ul>
                </div>
              </div>
              <p className="panel-foot">
                An abstract is no longer part of the Extended Essay — it has not been required or permitted since the
                2018 reform. If one is found, it is excluded and flagged.
              </p>
            </section>
          </>
        ) : (
          <>
            <FlagList flags={analysis.flags} />
            <Summary totals={totals} fileName={analysis.fileName} source={analysis.source} />
            <SectionTable
              totals={totals}
              overrides={overrides}
              onToggle={setOverride('sections')}
              onReset={resetGroup('sections')}
            />
            <ExclusionTable totals={totals} />
            <NoteReview
              totals={totals}
              sections={analysis.sections}
              overrides={overrides}
              onToggle={setOverride('notes')}
              onReset={resetGroup('notes')}
            />
            <BracketReview
              totals={totals}
              overrides={overrides}
              onToggle={setOverride('parens')}
              onReset={resetGroup('parens')}
            />
            <UncertainList items={analysis.uncertain} styleMessages={analysis.styleMessages} />
          </>
        )}
      </main>

      <footer className="disclaimer">
        <p>
          <strong>This is a best-effort estimate, not an official IB word count.</strong> Telling an explanatory footnote
          from a citation, and a reference from an ordinary parenthesis, cannot be done reliably by pattern matching —
          some of the calls above will be wrong. Read the review lists, correct anything that is off, and do a final
          manual check before you submit. Your supervisor and the IB have the last word.
        </p>
        <p className="tiny">Runs offline. No file ever leaves this device.</p>
      </footer>
    </div>
  )
}
