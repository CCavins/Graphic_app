const DB_NAME = 'measured'
const STORE = 'docs'

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1)
    request.onupgradeneeded = () => {
      request.result.createObjectStore(STORE)
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

export async function saveAutosave(json: string): Promise<void> {
  const db = await openDb()
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite')
    tx.objectStore(STORE).put(json, 'autosave')
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
  db.close()
}

export async function loadAutosave(): Promise<string | null> {
  const db = await openDb()
  const value = await new Promise<string | null>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly')
    const request = tx.objectStore(STORE).get('autosave')
    request.onsuccess = () => resolve((request.result as string | undefined) ?? null)
    request.onerror = () => reject(request.error)
  })
  db.close()
  return value
}

export function download(filename: string, data: Blob | string, type = 'application/json'): void {
  const blob = typeof data === 'string' ? new Blob([data], { type }) : data
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}

/** Saves through the browser's file picker when it has one; otherwise the file lands in Downloads. Says which. */
export async function saveWithPicker(filename: string, contents: string): Promise<'picker' | 'download' | 'cancelled'> {
  const picker = (window as Window & { showSaveFilePicker?: (options: unknown) => Promise<FileSystemFileHandle> }).showSaveFilePicker
  if (!picker) {
    download(filename, contents)
    return 'download'
  }
  try {
    const handle = await picker({ suggestedName: filename })
    const writable = await handle.createWritable()
    await writable.write(contents)
    await writable.close()
    return 'picker'
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') return 'cancelled'
    throw error
  }
}
