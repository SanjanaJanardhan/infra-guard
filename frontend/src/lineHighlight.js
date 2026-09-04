import { StateEffect, StateField } from '@codemirror/state'
import { Decoration, EditorView } from '@codemirror/view'

export const setHighlightRange = StateEffect.define()

const highlightLineDeco = Decoration.line({ attributes: { class: 'cm-highlighted-line' } })

export const highlightField = StateField.define({
  create() {
    return Decoration.none
  },
  update(deco, tr) {
    deco = deco.map(tr.changes)
    for (const effect of tr.effects) {
      if (effect.is(setHighlightRange)) {
        if (!effect.value) {
          deco = Decoration.none
          continue
        }
        const { from, to } = effect.value
        const ranges = []
        let pos = from
        while (pos <= to) {
          const line = tr.state.doc.lineAt(pos)
          ranges.push(highlightLineDeco.range(line.from))
          pos = line.to + 1
        }
        deco = Decoration.set(ranges)
      }
    }
    return deco
  },
  provide: (field) => EditorView.decorations.from(field),
})

/** Dispatch a highlight for 1-indexed [startLine, endLine], or clear it if range is null. */
export function applyHighlight(view, range) {
  if (!view) return
  if (!range) {
    view.dispatch({ effects: setHighlightRange.of(null) })
    return
  }
  const doc = view.state.doc
  const startLine = Math.min(Math.max(range.start, 1), doc.lines)
  const endLine = Math.min(Math.max(range.end, 1), doc.lines)
  const from = doc.line(startLine).from
  const to = doc.line(endLine).to
  view.dispatch({
    effects: [setHighlightRange.of({ from, to }), EditorView.scrollIntoView(from, { y: 'center' })],
  })
}
