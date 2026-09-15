const fmt = (n) => n.toLocaleString('en-GB')

export default function Summary({ totals, fileName, source }) {
  const { total, limit, over, remaining, percent } = totals
  const state = over > 0 ? 'over' : percent >= 0.95 ? 'close' : 'under'
  const bar = Math.min(100, percent * 100)

  return (
    <section className={`panel summary ${state}`}>
      <p className="summary-file">
        {fileName}
        {source === 'text' ? ' · pasted text' : ''}
      </p>
      <div className="summary-number">
        <span className="count">{fmt(total)}</span>
        <span className="limit">/ {fmt(limit)} words</span>
      </div>
      <div className="meter" role="img" aria-label={`${total} of ${limit} words used`}>
        <div className="meter-fill" style={{ width: `${bar}%` }} />
      </div>
      <p className="summary-verdict">
        {over > 0 ? (
          <>
            <strong>{fmt(over)} words over the limit.</strong> Examiners are instructed to stop reading at 4,000 words,
            so anything past that point is not assessed.
          </>
        ) : (
          <>
            <strong>{fmt(remaining)} words remaining.</strong>{' '}
            {percent >= 0.95 ? 'You are very close to the limit — leave yourself room for edits.' : 'Within the limit.'}
          </>
        )}
      </p>
      <p className="summary-note">
        Plus {fmt(totals.excludedTotal)} words excluded by the rules below. This is a best-effort estimate — see the
        caveat at the foot of the page.
      </p>
    </section>
  )
}
