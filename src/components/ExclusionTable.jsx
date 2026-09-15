const fmt = (n) => n.toLocaleString('en-GB')

export default function ExclusionTable({ totals }) {
  const { excluded, excludedTotal, noteStats } = totals

  return (
    <section className="panel">
      <header className="panel-head">
        <h2>What was excluded, and why</h2>
      </header>
      <p className="panel-sub">
        {fmt(excludedTotal)} words were left out of the total. The IB excludes each of these from the 4,000 words.
      </p>
      {excluded.length ? (
        <ul className="exclusions">
          {excluded.map((row) => (
            <li key={row.key}>
              <div className="exclusion-main">
                <span className="exclusion-label">{row.label}</span>
                <span className="exclusion-words">
                  {row.words === null ? 'not extracted' : `${fmt(row.words)} words`}
                  {row.count ? ` · ${row.count} item${row.count === 1 ? '' : 's'}` : ''}
                </span>
              </div>
              {row.detail ? <p className="exclusion-detail">{row.detail}</p> : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className="empty">Nothing was excluded.</p>
      )}
      {noteStats.total ? (
        <p className="panel-foot">
          Footnotes and endnotes: <strong>{noteStats.excluded}</strong> excluded ({fmt(noteStats.excludedWords)} words),{' '}
          <strong>{noteStats.included}</strong> counted as explanatory ({fmt(noteStats.includedWords)} words).
        </p>
      ) : null}
    </section>
  )
}
