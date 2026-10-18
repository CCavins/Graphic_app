import { useState } from 'react'
import { BLEND_MODES, type BlendMode, type Layer, type SceneNode } from '../../model/types'
import { OrgIcon, type OrgIconName } from '../icons'
import { editor } from '../instance'
import { InlineName, Row, Slider } from '../ui'

type ActionGroup = 'arrange' | 'combine' | 'path'

const ACTION_GROUPS: { id: ActionGroup; label: string; hint: string; actions: { id?: string; label: string; shortcut?: string; detail: string; icon?: OrgIconName; run: () => void }[] }[] = [
  {
    id: 'arrange',
    label: 'Arrange',
    hint: 'Use one shape to hide another, or cut holes. Group, ungroup, and stacking order live in Properties > Align and the right-click menu.',
    actions: [
      { id: 'clip', label: 'Mask', detail: 'Hide everything outside the front shape.', run: () => editor.clipSelection() },
      { label: 'Release mask', detail: 'Show the shapes a mask was hiding.', run: () => editor.releaseClip() },
      { id: 'compound', label: 'Compound', shortcut: '⌘8', detail: 'Turn overlapping areas into holes.', run: () => editor.compound() },
      { label: 'Release compound', detail: 'Split a compound path into separate shapes.', run: () => editor.releaseCompound() },
    ],
  },
  {
    id: 'combine',
    label: 'Combine',
    hint: 'Works on two or more closed shapes. The front shape is the cutter.',
    actions: [
      { id: 'union', label: 'Union', detail: 'Merge the shapes into one outline.', run: () => editor.boolean('union') },
      { label: 'Subtract', detail: 'Cut the front shape out of the one behind it.', run: () => editor.boolean('subtract') },
      { label: 'Intersect', detail: 'Keep only the area where the shapes overlap.', run: () => editor.boolean('intersect') },
      { label: 'Exclude', detail: 'Remove the overlap and keep the rest.', run: () => editor.boolean('exclude') },
      { label: 'Divide', detail: 'Split the shapes into a piece for every overlap.', run: () => editor.boolean('divide') },
    ],
  },
  {
    id: 'path',
    label: 'Path',
    hint: 'Change an open path, its ends, or its points.',
    actions: [
      { id: 'join', label: 'Join', detail: 'Combine two open paths into one path.', run: () => editor.join() },
      { label: 'Connect', shortcut: '⌘J', detail: 'Join the two closest open ends.', run: () => editor.connectEndpoints() },
      { label: 'Disconnect', detail: 'Break the path at the selected point.', run: () => editor.disconnectAnchor() },
      { label: 'Close', detail: 'Connect the start of a path to its end.', run: () => editor.closeSelected() },
      { label: 'Open', detail: 'Remove the segment that closes a path.', run: () => editor.openSelected() },
      { label: 'Reverse', detail: 'Flip which end of the path is the start.', run: () => editor.reverseSelected() },
      { id: 'outline-stroke', label: 'Outline stroke', detail: 'Turn the stroke into a filled shape.', run: () => editor.outlineSelected() },
      { label: 'Convert anchor', detail: 'Change the selected point between a corner and a curve.', run: () => editor.convertAnchor() },
    ],
  },
]

export function LayersPanel() {
  const doc = editor.doc
  const [actionGroup, setActionGroup] = useState<ActionGroup>('arrange')
  const active = doc.layers.find((layer) => layer.id === doc.activeLayerId)
  const actions = ACTION_GROUPS.find((group) => group.id === actionGroup) ?? ACTION_GROUPS[0]
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
          <LayerRow key={layer.id} layer={layer} />
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
      <div className="segmented action-switch" role="group" aria-label="Object actions">
        {ACTION_GROUPS.map((group) => (
          <button key={group.id} type="button" data-testid={`actions-${group.id}`} data-active={actionGroup === group.id} onClick={() => setActionGroup(group.id)}>{group.label}</button>
        ))}
      </div>
      <p className="hint">{actions.hint}</p>
      <div className="action-list">
        {actions.actions.map((action) => (
          <button key={action.label} type="button" className="action" data-testid={action.id} onClick={action.run}>
            <span className="action-name">{action.icon && <OrgIcon name={action.icon} />}{action.label}{action.shortcut && <kbd>{action.shortcut}</kbd>}</span>
            <span className="action-detail">{action.detail}</span>
          </button>
        ))}
      </div>
    </div>
  )
}

function LayerRow({ layer }: { layer: Layer }) {
  const active = layer.id === editor.doc.activeLayerId
  return (
    <div className="layer-row" data-testid="layer" data-active={active}>
      <button className="icon-button" aria-label={layer.visible ? 'Hide layer' : 'Show layer'} title={layer.visible ? 'Visible. Click to hide this layer.' : 'Hidden. Click to show this layer.'} data-testid="layer-visible" onClick={() => editor.setLayer(layer.id, { visible: !layer.visible })}><OrgIcon name={layer.visible ? 'eye' : 'eye-off'} /></button>
      <button className="icon-button" aria-label={layer.locked ? 'Unlock layer' : 'Lock layer'} title={layer.locked ? 'Locked: nothing on this layer can be drawn or moved. Click to unlock.' : 'Unlocked. Click to lock this layer.'} data-testid="layer-lock" data-locked={layer.locked} onClick={() => editor.toggleLock(layer.id)}><OrgIcon name={layer.locked ? 'lock' : 'unlock'} /></button>
      <InlineName className="grow name" testId="layer-name" label="layer" value={layer.name} onClick={() => editor.setActiveLayer(layer.id)} onRename={(name) => editor.renameLayer(layer.id, name)}>
        {layer.name} <small>({layer.children.length})</small>
      </InlineName>
      <button className="icon-button" aria-label="Move layer up" title="Move layer up" onClick={() => editor.moveLayer(layer.id, 'up')}>↑</button>
      <button className="icon-button" aria-label="Move layer down" title="Move layer down" onClick={() => editor.moveLayer(layer.id, 'down')}>↓</button>
    </div>
  )
}

function ObjectRow({ node, depth }: { node: SceneNode; depth: number }) {
  const selected = editor.selection.includes(node.id)
  return (
    <>
      <div className="object-row" data-testid="object-row" data-active={selected} style={{ paddingLeft: 8 + depth * 14 }}>
        <button className="icon-button" aria-label={node.visible ? 'Hide object' : 'Show object'} title={node.visible ? 'Visible. Click to hide.' : 'Hidden. Click to show.'} onClick={() => editor.setNodeVisible(node.id, !node.visible)}><OrgIcon name={node.visible ? 'eye' : 'eye-off'} /></button>
        <button className="icon-button" aria-label={node.locked ? 'Unlock object' : 'Lock object'} title={node.locked ? 'Locked. Click to unlock.' : 'Unlocked. Click to lock.'} data-locked={node.locked} onClick={() => editor.toggleLock(node.id)}><OrgIcon name={node.locked ? 'lock' : 'unlock'} /></button>
        <InlineName className="grow name" testId="object-name" label="object" value={node.name} onClick={(event) => editor.selectNode(node.id, event.shiftKey || event.metaKey)} onRename={(name) => editor.renameNode(node.id, name)}>
          {node.name} <small>{node.kind}</small>
        </InlineName>
      </div>
      {node.kind === 'group' && [...node.children].reverse().map((child) => <ObjectRow key={child.id} node={child} depth={depth + 1} />)}
    </>
  )
}
