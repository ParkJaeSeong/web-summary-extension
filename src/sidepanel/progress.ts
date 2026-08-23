export type ContentLoadStage = 'page' | 'youtube' | 'pdf'

export function contentLoadStage(url?: string): ContentLoadStage {
  if (!url) return 'page'
  try {
    const parsed = new URL(url)
    if (/\.pdf$/i.test(parsed.pathname)) return 'pdf'
    if (/(^|\.)youtube\.com$/.test(parsed.hostname) && parsed.pathname === '/watch')
      return 'youtube'
  } catch {
    // Restricted or incomplete tab URLs use the generic page state.
  }
  return 'page'
}

export function embeddingBatches(total: number, size = 64) {
  const batches: Array<{ start: number; end: number }> = []
  for (let start = 0; start < total; start += size) {
    batches.push({ start, end: Math.min(start + size, total) })
  }
  return batches
}
