import { useCallback, useRef, useState } from 'react'

export default function UploadPanel({ onFile, onText, busy, error }) {
  const [mode, setMode] = useState('file')
  const [dragging, setDragging] = useState(false)
  const [pasted, setPasted] = useState('')
  const inputRef = useRef(null)

  const takeFiles = useCallback(
    (files) => {
      const file = files && files[0]
      if (!file) return
      onFile(file)
    },
    [onFile],
  )

  return (
    <section className="panel upload">
      <div className="tabs" role="tablist" aria-label="Input method">
        <button
          role="tab"
          aria-selected={mode === 'file'}
          className={mode === 'file' ? 'tab active' : 'tab'}
          onClick={() => setMode('file')}
        >
          Upload .docx
        </button>
        <button
          role="tab"
          aria-selected={mode === 'text'}
          className={mode === 'text' ? 'tab active' : 'tab'}
          onClick={() => setMode('text')}
        >
          Paste plain text
        </button>
      </div>

      {mode === 'file' ? (
        <>
          <div
            className={`dropzone${dragging ? ' dragging' : ''}${busy ? ' busy' : ''}`}
            onDragOver={(e) => {
              e.preventDefault()
              setDragging(true)
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault()
              setDragging(false)
              takeFiles(e.dataTransfer.files)
            }}
            onClick={() => inputRef.current?.click()}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                inputRef.current?.click()
              }
            }}
            role="button"
            tabIndex={0}
          >
            <div className="dropzone-icon" aria-hidden="true">
              ⬆
            </div>
            <p className="dropzone-title">{busy ? 'Reading your essay…' : 'Drop your Extended Essay here'}</p>
            <p className="dropzone-sub">
              or <span className="link">choose a .docx file</span>
            </p>
            <input
              ref={inputRef}
              type="file"
              accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
              hidden
              onChange={(e) => {
                takeFiles(e.target.files)
                e.target.value = ''
              }}
            />
          </div>
          <p className="hint">
            <strong>Using Google Docs?</strong> Export first with <em>File → Download → Microsoft Word (.docx)</em>, then
            upload that file. Word’s heading styles survive the export, which is what makes section detection work.
          </p>
        </>
      ) : (
        <>
          <textarea
            className="paste-area"
            value={pasted}
            onChange={(e) => setPasted(e.target.value)}
            placeholder={'Paste your essay text here.\n\nPut each heading on its own line so sections can still be recognised.'}
            spellCheck={false}
          />
          <div className="paste-actions">
            <span className="hint inline">
              Plain text carries no footnotes, tables or heading styles — expect a rougher estimate.
            </span>
            <button className="btn primary" disabled={!pasted.trim() || busy} onClick={() => onText(pasted)}>
              Count pasted text
            </button>
          </div>
        </>
      )}

      {error ? <p className="error">{error}</p> : null}

      <p className="privacy">
        🔒 Nothing leaves your device. The file is read in your browser — there is no server and no upload.
      </p>
    </section>
  )
}
