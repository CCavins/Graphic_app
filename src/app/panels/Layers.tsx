import { useState } from 'react'
import { BLEND_MODES, type BlendMode, type Layer, type SceneNode } from '../../model/types'
import { editor } from '../instance'
import { Row, Slider } from '../ui'

export function LayersPanel() {
  const doc = editor.doc
  const [renaming, setRenaming] = useState<string | null>(null)
  const active = doc.layers.find((layer) => layer.id === doc.activeLayerId)
  return (
    <div className="stack" data-testid="layers">
      <Row wrap>
        <button data-testid="add-layer" onClick={() => editor.addLayer()}>Add layer</button>
        <button onClick={() => active && editor.duplicateLayer(active.id)}>Duplicate</button>
        <button onClick={() => active && editor.mergeDown(active.id)} disabled={doc.layers.length < 2}>Merge down</button>
        <button onClick={() => active && editor.deleteLayer(active.id)} disabled={doc.layers.length < 2}>Delete</button>
        <button onClick={() => editor.unlockAll()}>Unlock all</button>
      </Row>
      <div className="layer-list">
        {[...doc.layers].reverse().map((layer) => (
          <LayerRow key={layer.id} layer={layer} renaming={renaming === layer.id} onRename={(on) => setRenaming(on ? layer.id : null)} />
        ))}
      </div>
      {active && (
        <>
          <Row>
            <Slider label="Layer opacity" min={0} max={100} value={Math.round(active.opacity * 100)} onChange={(value) => editor.setLayer(active.id, { opacity: value / 100 })} />
            <label className="field">
              <span>Blend</span>
              <select value={active.blendMode} onChange={(event) => editor.setLayer(active.id, { blendMode: event.target.value as BlendMode })}>
                {BLEND_MODES.map((mode) => <option key={mode}>{mode}</option>)}
              </select>
            </label>
          </Row>
          <div className="object-list" data-testid="object-list">
            {[...active.children].reverse().map((node) => (
              <ObjectRow key={node.id} node={node} depth={0} />
            ))}
            {!active.children.length && <p className="hint">Nothing on this layer yet.</p>}
          </div>
        </>
      )}
      <Row wrap>
        <button data-testid="group" onClick={() => editor.group()}>Group ⌘G</button>
        <button data-testid="ungroup" onClick={() => editor.ungroup()}>Ungroup</button>
        <button data-testid="clip" onClick={() => editor.clipSelection()}>Mask</button>
        <button onClick={() => editor.releaseClip()}>Release mask</button>
        <button data-testid="compound" onClick={() => editor.compound()}>Compound ⌘8</button>
        <button onClick={() => editor.releaseCompound()}>Release compound</button>
      </Row>
      <Row wrap>
        <button data-testid="union" onClick={() => editor.boolean('union')}>Union</button>
        <button onClick={() => editor.boolean('subtract')}>Subtract</button>
        <button onClick={() => editor.boolean('intersect')}>Intersect</button>
        <button onClick={() => editor.boolean('exclude')}>Exclude</button>
        <button onClick={() => editor.boolean('divide')}>Divide</button>
      </Row>
      <Row wrap>
        <button data-testid="join" onClick={() => editor.join()}>Join</button>
        <button onClick={() => editor.connectEndpoints()}>Connect ⌘J</button>
        <button onClick={() => editor.disconnectAnchor()}>Disconnect</button>
        <button onClick={() => editor.closeSelected()}>Close</button>
        <button onClick={() => editor.openSelected()}>Open</button>
        <button onClick={() => editor.reverseSelected()}>Reverse</button>
        <button data-testid="outline-stroke" onClick={() => editor.outlineSelected()}>Outline stroke</button>
        <button onClick={() => editor.convertAnchor()}>Convert anchor</button>
      </Row>
    </div>
  )
}

function LayerRow({ layer, renaming, onRename }: { layer: Layer; renaming: boolean; onRename: (on: boolean) => void }) {
  const active = layer.id === editor.doc.activeLayerId
  return (
    <div className="layer-row" data-testid="layer" data-active={active}>
      <button className="icon-button" aria-label={layer.visible ? 'Hide layer' : 'Show layer'} data-testid="layer-visible" onClick={() => editor.setLayer(layer.id, { visible: !layer.visible })}>{layer.visible ? '●' : '○'}</button>
      <button className="icon-button" aria-label={layer.locked ? 'Unlock layer' : 'Lock layer'} onClick={() => editor.toggleLock(layer.id)}>{layer.locked ? '🔒' : '🔓'}</button>
      {renaming ? (
        <input
          autoFocus
          defaultValue={layer.name}
          onKeyDown={(event) => {
            event.stopPropagation()
            if (event.key === 'Enter') {
              editor.renameLayer(layer.id, event.currentTarget.value)
              onRename(false)
            }
            if (event.key === 'Escape') onRename(false)
          }}
          onBlur={(event) => {
            editor.renameLayer(layer.id, event.currentTarget.value)
            onRename(false)
          }}
        />
      ) : (
        <button className="grow name" data-testid="layer-name" onClick={() => editor.setActiveLayer(layer.id)} onDoubleClick={() => onRename(true)}>
          {layer.name} <small>({layer.children.length})</small>
        </button>
      )}
      <button className="icon-button" aria-label="Move layer up" onClick={() => editor.moveLayer(layer.id, 'up')}>↑</button>
      <button className="icon-button" aria-label="Move layer down" onClick={() => editor.moveLayer(layer.id, 'down')}>↓</button>
    </div>
  )
}

function ObjectRow({ node, depth }: { node: SceneNode; depth: number }) {
  const selected = editor.selection.includes(node.id)
  return (
    <>
      <div className="object-row" data-testid="object-row" data-active={selected} style={{ paddingLeft: 8 + depth * 14 }}>
        <button className="icon-button" aria-label={node.visible ? 'Hide object' : 'Show object'} onClick={() => editor.setNodeVisible(node.id, !node.visible)}>{node.visible ? '●' : '○'}</button>
        <button className="icon-button" aria-label={node.locked ? 'Unlock object' : 'Lock object'} onClick={() => editor.toggleLock(node.id)}>{node.locked ? '🔒' : ''}</button>
        <button
          className="grow name"
          onClick={(event) => editor.selectNode(node.id, event.shiftKey || event.metaKey)}
          onDoubleClick={() => {
            const name = window.prompt('Object name', node.name)
            if (name != null) editor.renameNode(node.id, name)
          }}
        >
          {node.name} <small>{node.kind}</small>
        </button>
      </div>
      {node.kind === 'group' && [...node.children].reverse().map((child) => <ObjectRow key={child.id} node={child} depth={depth + 1} />)}
    </>
  )
}
