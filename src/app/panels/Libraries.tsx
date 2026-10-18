import { useEffect, useMemo, useRef, useState } from 'react'
import { CATALOG, CATALOG_ATTRIBUTION, catalogLoaded, LIBRARIES } from '../../catalog/catalog'
import { download } from '../../storage/files'
import { editor } from '../instance'
import { Field, Row, Section, ShapePreview } from '../ui'

const ROW = 40

/** "My shapes", then "My shapes 2", "My shapes 3", so a new library never collides with an existing name. */
function nextLibraryName(existing: string[]): string {
  const base = 'My shapes'
  if (!existing.includes(base)) return base
  let n = 2
  while (existing.includes(`${base} ${n}`)) n++
  return `${base} ${n}`
}

export function LibrariesPanel() {
  const [query, setQuery] = useState('')
  const [library, setLibrary] = useState('')
  const [scroll, setScroll] = useState(0)
  const [, setLoaded] = useState(catalogLoaded())
  const [shapeName, setShapeName] = useState('Shape')
  const importRef = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (catalogLoaded()) return
    void editor.loadCatalog().then(() => setLoaded(true))
  }, [])
  const results = useMemo(() => editor.search(query, library || undefined), [query, library, editor.customLibrary.length, CATALOG.length])
  const start = Math.floor(scroll / ROW)
  const visible = results.slice(start, start + 14)
  const total = CATALOG.length + editor.customLibrary.length

  return (
    <div className="stack">
      <Row>
        <input className="grow" data-testid="library-search" value={query} placeholder="Search shapes (door, sofa, arrow…)" onChange={(event) => { setQuery(event.target.value); setScroll(0) }} onKeyDown={(event) => event.stopPropagation()} />
        <select data-testid="library-filter" value={library} onChange={(event) => { setLibrary(event.target.value); setScroll(0) }}>
          <option value="">All libraries</option>
          {LIBRARIES.map((name) => <option key={name}>{name}</option>)}
          {editor.customLibraries.map((custom) => <option key={custom.id} value={custom.name}>{custom.name}</option>)}
        </select>
      </Row>
      <div className="library" data-testid="library-list" onScroll={(event) => setScroll(event.currentTarget.scrollTop)}>
        {results.length === 0 && catalogLoaded() && (
          <p className="hint library-empty" data-testid="library-empty">
            No shapes match “{query}”{library ? ` in ${library}` : ''}. Try a shorter word, or choose All libraries.
          </p>
        )}
        <div style={{ height: results.length * ROW }}>
          {visible.map((item, index) => (
            <button
              key={item.id}
              className="symbol"
              data-testid="symbol-item"
              draggable
              title={`${item.library} › ${item.category}. Click to place it in the middle of the view, or drag it onto the canvas.`}
              style={{ top: (start + index) * ROW, height: ROW }}
              onDragStart={(event) => {
                event.dataTransfer.setData('application/x-measured-symbol', item.id)
                event.dataTransfer.setData('text/plain', `symbol:${item.id}`)
                event.dataTransfer.effectAllowed = 'copy'
              }}
              onClick={() => editor.placeSymbol(item.id)}
            >
              <ShapePreview commands={item.commands} shade={item.fillCommands} ink={item.inkCommands} filled={item.source === 'generated' || item.source === 'custom'} />
              <span className="symbol-name">{item.name}</span>
              <small>{item.library}</small>
            </button>
          ))}
        </div>
      </div>
      <p className="hint" data-testid="catalog-count">{total} shapes{query ? ` · ${results.length} match` : ''}{catalogLoaded() ? '' : ' · loading…'}</p>
      <Section title="My libraries" testId="section-custom" defaultOpen={false}>
        <Row wrap>
          <button data-testid="create-library" title="Create a library; rename it in the field that appears" onClick={() => editor.createLibrary(nextLibraryName(editor.customLibraries.map((custom) => custom.name)))}>New library</button>
          <button data-testid="import-library" onClick={() => importRef.current?.click()}>Import…</button>
          <input ref={importRef} hidden type="file" accept=".json,.measuredlib" onChange={(event) => {
            const file = event.target.files?.[0]
            if (file) void file.text().then((text) => editor.importLibrary(text))
            event.target.value = ''
          }} />
        </Row>
        {editor.customLibraries.map((custom) => (
          <div className="custom-library" key={custom.id} data-testid="custom-library">
            <Row>
              <input type="color" aria-label="Library color" value={custom.color.length === 7 ? custom.color : '#e7ebf0'} onChange={(event) => editor.renameLibrary(custom.id, custom.name, event.target.value)} />
              <Field value={custom.name} width={100} onCommit={(raw) => editor.renameLibrary(custom.id, raw)} />
              <span className="hint">{custom.items.length}</span>
              <button className="icon-button" aria-label="Export library" onClick={() => download(`${custom.name}.json`, editor.exportLibrary(custom.id))}>⇩</button>
              <button className="icon-button" aria-label="Delete library" onClick={() => editor.deleteLibrary(custom.id)}>×</button>
            </Row>
            <Row>
              <Field label="Add selection as" width={90} value={shapeName} onCommit={setShapeName} />
              <button data-testid="add-to-library" disabled={!editor.one()} title={editor.one() ? 'Add the selected shape to this library' : 'Select one shape on the canvas first'} onClick={() => editor.addToLibrary(custom.id, shapeName)}>+</button>
            </Row>
          </div>
        ))}
        {!editor.customLibraries.length && <p className="hint">Create a library, then add the selected shape with +.</p>}
      </Section>
      <details className="attribution">
        <summary>Symbol sources and licenses</summary>
        <p data-testid="attribution">{CATALOG_ATTRIBUTION}</p>
      </details>
    </div>
  )
}
