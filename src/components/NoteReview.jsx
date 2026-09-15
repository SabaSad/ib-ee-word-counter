import { useMemo, useState } from 'react'

const fmt = (n) => n.toLocaleString('en-GB')

const FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'counted', label: 'Counting' },
  { key: 'excluded', label: 'Not counting' },
  { key: 'uncertain', label: 'Needs a look' },
]

export default function NoteReview({ totals, sections, overrides, onToggle, onReset }) {
  const [filter, setFilter] = useState('all')
  const notes = totals.notes
  const sectionName = useMemo(() => {
    const map = new Map()
    for (const s of sections) map.set(s.id, s.displayTitle)
    return map
  }, [sections])

  const visible = notes.filter((note) => {
    if (filter === 'counted') return note.included
    if (filter === 'excluded') return !note.included
    if (filter === 'uncertain') return note.classification === 'ambiguous' || note.confidence === 'low' || !note.sectionId
    return true
  })

  if (!notes.length) {
    return (
      <section className="panel">
        <header className="panel-head">
          <h2>Footnotes and endnotes</h2>
        </header>
        <p className="empty">
          No footnotes or endnotes were found in the document. If your essay has them, make sure they are real Word
          footnotes (References → Insert Footnote) rather than typed superscript numbers.
        </p>
      </section>
    )
  }

  return (
    <section className="panel">
      <header className="panel-head">
        <h2>
          Footnote &amp; endnote review <span className="count-chip">{notes.length}</span>
        </h2>
        {Object.keys(overrides.notes).length ? (
          <button className="btn subtle" onClick={onReset}>
            Reset notes
          </button>
        ) : null}
      </header>
      <p className="panel-sub">
        Explanatory notes count toward the 4,000 words; notes that are purely a reference do not. The classification
        below is a guess — read each one and flip it if it is wrong. The total updates as you go.
      </p>

      <div className="filters" role="tablist">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            role="tab"
            aria-selected={filter === f.key}
            className={filter === f.key ? 'chip active' : 'chip'}
            onClick={() => setFilter(f.key)}
          >
            {f.label}
          </button>
        ))}
      </div>

      <ul className="notes">
        {visible.map((note) => (
          <li key={note.uid} className={note.included ? 'note counted' : 'note'}>
            <div className="note-head">
              <label className="switch">
                <input type="checkbox" checked={note.included} onChange={(e) => onToggle(note.uid, e.target.checked)} />
                <span className="switch-track" aria-hidden="true" />
                <span className="switch-label">{note.included ? 'Counts' : "Doesn't count"}</span>
              </label>
              <span className="note-meta">
                {note.kind === 'footnote' ? 'Footnote' : 'Endnote'} {note.id} · {fmt(note.words)} words
                {note.sectionId ? ` · in ${sectionName.get(note.sectionId)}` : ' · location unknown'}
              </span>
              <span className={`tag class class-${note.classification}`}>
                {note.classification === 'citation'
                  ? 'citation only'
                  : note.classification === 'explanatory'
                    ? 'explanatory'
                    : 'unclear'}
                {note.confidence === 'low' ? ' · low confidence' : ''}
              </span>
            </div>
            <p className="note-text">{note.text}</p>
            <p className="note-why">
              {note.sectionExcluded && note.sectionId ? 'Attached to an excluded section. ' : ''}
              {note.reasons.map((r) => r.label).join(' · ') || 'No strong signals either way.'}
            </p>
          </li>
        ))}
      </ul>
      {!visible.length ? <p className="empty">Nothing in this filter.</p> : null}
    </section>
  )
}
