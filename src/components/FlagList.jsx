export function FlagList({ flags }) {
  if (!flags.length) return null
  return (
    <div className="flags">
      {flags.map((flag) => (
        <div key={flag.id} className={`banner ${flag.level}`}>
          <span className="banner-icon" aria-hidden="true">
            {flag.level === 'warn' ? '!' : 'i'}
          </span>
          <div>
            <p className="banner-title">{flag.title}</p>
            <p className="banner-detail">{flag.detail}</p>
          </div>
        </div>
      ))}
    </div>
  )
}

export function UncertainList({ items, styleMessages }) {
  if (!items.length && !styleMessages.length) return null
  return (
    <section className="panel">
      <header className="panel-head">
        <h2>
          Couldn’t classify with confidence <span className="count-chip">{items.length}</span>
        </h2>
      </header>
      <p className="panel-sub">
        These are the judgement calls the parser is least sure about. Check each one against your document and adjust
        the toggles above if needed.
      </p>
      {items.length ? (
        <ul className="uncertain">
          {items.map((item) => (
            <li key={item.id}>
              <span className={`tag kind kind-${item.kind}`}>{item.kind}</span>
              <div>
                <p className="uncertain-title">{item.title}</p>
                <p className="uncertain-detail">{item.detail}</p>
              </div>
            </li>
          ))}
        </ul>
      ) : null}
      {styleMessages.length ? (
        <details className="diagnostics">
          <summary>{styleMessages.length} conversion notes from the document reader</summary>
          <ul>
            {styleMessages.map((message, i) => (
              <li key={i}>{message}</li>
            ))}
          </ul>
        </details>
      ) : null}
    </section>
  )
}
