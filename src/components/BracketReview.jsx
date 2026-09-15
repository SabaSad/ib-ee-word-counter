import { useMemo, useState } from 'react'

const fmt = (n) => n.toLocaleString('en-GB')

export default function BracketReview({ totals, overrides, onToggle, onReset }) {
  const [open, setOpen] = useState(false)
  const [onlyReview, setOnlyReview] = useState(true)

  const rows = useMemo(
    () =>
      totals.sections
        .filter((s) => s.included)
        .flatMap((s) => s.parens.map((p) => ({ ...p, sectionTitle: s.displayTitle }))),
    [totals.sections],
  )

  const excludedCount = rows.filter((r) => !r.included).length
  const ambiguousCount = rows.filter((r) => r.verdict === 'ambiguous').length
  const visible = onlyReview ? rows.filter((r) => r.verdict !== 'content' || !r.included) : rows

  if (!rows.length) return null

  return (
    <section className="panel">
      <header className="panel-head">
        <h2>
          Bracketed text <span className="count-chip">{rows.length}</span>
        </h2>
        <button className="btn subtle" onClick={() => setOpen(!open)} aria-expanded={open}>
          {open ? 'Hide' : 'Review'}
        </button>
      </header>
      <p className="panel-sub">
        {fmt(excludedCount)} bracketed span{excludedCount === 1 ? '' : 's'} were read as citations and removed from the
        sentences around them. {ambiguousCount ? `${ambiguousCount} could go either way and are being counted. ` : ''}
        Measurements like <code>(77°F)</code> and descriptive asides always count.
      </p>

      {open ? (
        <>
          <div className="filters">
            <label className="checkline">
              <input type="checkbox" checked={onlyReview} onChange={(e) => setOnlyReview(e.target.checked)} />
              Only show excluded and unclear spans
            </label>
            {Object.keys(overrides.parens).length ? (
              <button className="btn subtle" onClick={onReset}>
                Reset brackets
              </button>
            ) : null}
          </div>
          <ul className="brackets">
            {visible.map((row) => (
              <li key={row.id} className={row.included ? 'counted' : ''}>
                <label className="switch small">
                  <input type="checkbox" checked={row.included} onChange={(e) => onToggle(row.id, e.target.checked)} />
                  <span className="switch-track" aria-hidden="true" />
                  <span className="switch-label">{row.included ? 'Counts' : 'Excluded'}</span>
                </label>
                <div className="bracket-body">
                  <p className="bracket-context">{row.context}</p>
                  <p className="bracket-why">
                    <span className={`tag class class-${row.verdict === 'content' ? 'explanatory' : row.verdict}`}>
                      {row.verdict === 'citation' ? 'citation' : row.verdict === 'content' ? 'content' : 'unclear'}
                    </span>
                    {row.words} word{row.words === 1 ? '' : 's'} · {row.sectionTitle} ·{' '}
                    {row.reasons.map((r) => r.label).join('; ')}
                  </p>
                </div>
              </li>
            ))}
          </ul>
          {!visible.length ? <p className="empty">Nothing to review.</p> : null}
        </>
      ) : null}
    </section>
  )
}
