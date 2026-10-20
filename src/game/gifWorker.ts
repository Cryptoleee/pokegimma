import { decodeGif, toCells } from './gif'

/** Fetches and decodes animated sprites off the main thread. */
self.onmessage = async (e: MessageEvent<{ key: string; url: string }>) => {
  const { key, url } = e.data
  try {
    const r = await fetch(url)
    if (!r.ok) throw new Error(String(r.status))
    const c = toCells(decodeGif(new Uint8Array(await r.arrayBuffer())))
    if (!c) throw new Error('empty')
    ;(self as unknown as Worker).postMessage({ key, cells: c }, [c.data.buffer])
  } catch {
    ;(self as unknown as Worker).postMessage({ key, cells: null })
  }
}
