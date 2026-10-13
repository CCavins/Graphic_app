import { Editor } from '../editor/editor'

/** The single editor behind the UI. Panels import it instead of threading props. */
export const editor = new Editor()
