const fmt = (n) => n.toLocaleString('en-GB')

export default function SectionTable({ totals, overrides, onToggle, onReset }) {
  const { sections } = totals
  const dirty = Object.keys(overrides.sections).length > 0

  return (
    <section className="panel">
      <header className="panel-head">
        <h2>Section breakdown</h2>
        {dirty ? (
          <button className="btn subtle" onClick={onReset}>
            Reset sections
          </button>
        ) : null}
      </header>
      <p className="panel-sub">
        Untick a section to take it out of the count, or tick one back in if it was excluded wrongly. Word counts shown
        are the countable words only — headings, tables, captions and citations are already stripped out.
      </p>
      <table className="grid">
        <thead>
          <tr>
            <th className="col-toggle">Counts</th>
            <th>Section</th>
            <th>Classified as</th>
            <th className="num">Words</th>
          </tr>
        </thead>
        <tbody>
          {sections.map((section) => (
            <tr key={section.id} className={section.included ? '' : 'dimmed'}>
              <td className="col-toggle">
                <input
                  type="checkbox"
                  checked={section.included}
                  onChange={(e) => onToggle(section.id, e.target.checked)}
                  aria-label={`Count ${section.displayTitle}`}
                />
              </td>
              <td>
                <span className="section-title">{section.displayTitle}</span>
                {section.level > 1 ? <span className="tag level">H{section.level}</span> : null}
                {section.inferredHeading ? <span className="tag guess">guessed heading</span> : null}
                {section.uncertain ? <span className="tag warn">check this</span> : null}
                <span className="section-reason">{section.reason}</span>
              </td>
              <td>
                <span className={`tag kind kind-${section.kind}`}>{section.label}</span>
              </td>
              <td className="num">
                {section.included ? (
                  <>
                    <strong>{fmt(section.words)}</strong>
                    {section.noteWords ? <span className="sub"> incl. {fmt(section.noteWords)} in notes</span> : null}
                  </>
                ) : (
                  <span className="sub">{fmt(section.allWords)} excluded</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <td />
            <td colSpan={2}>Total counted</td>
            <td className="num">
              <strong>{fmt(totals.total)}</strong>
            </td>
          </tr>
        </tfoot>
      </table>
    </section>
  )
}
