import { ContentEmbeddings } from '@/storage/content-cache'
import { embeddingBatches } from './progress'

export interface EmbeddingCheckpoint extends ContentEmbeddings {
  key: string
}

interface IndexContentOptions {
  key: string
  texts: string[]
  checkpoint?: EmbeddingCheckpoint
  embedBatch: (texts: string[]) => Promise<ContentEmbeddings>
  onCheckpoint?: (checkpoint: EmbeddingCheckpoint) => void
  onProgress?: (completed: number, total: number) => void
  isCancelled?: () => boolean
  batchSize?: number
}

export async function indexContentInBatches({
  key,
  texts,
  checkpoint,
  embedBatch,
  onCheckpoint,
  onProgress,
  isCancelled,
  batchSize = 64,
}: IndexContentOptions): Promise<ContentEmbeddings> {
  let model = checkpoint?.key === key ? checkpoint.model : ''
  const vectors = checkpoint?.key === key ? [...checkpoint.vectors] : []
  if (vectors.length > texts.length) vectors.length = 0
  onProgress?.(vectors.length, texts.length)

  for (const batch of embeddingBatches(texts.length, batchSize)) {
    if (batch.end <= vectors.length) continue
    if (batch.start < vectors.length) vectors.length = batch.start
    if (isCancelled?.()) throw new DOMException('Indexing was cancelled.', 'AbortError')
    const result = await embedBatch(texts.slice(batch.start, batch.end))
    if (result.vectors.length !== batch.end - batch.start) {
      throw new Error('Embedding response did not match the requested batch.')
    }
    model = result.model
    vectors.push(...result.vectors)
    const nextCheckpoint = { key, model, vectors: [...vectors] }
    onCheckpoint?.(nextCheckpoint)
    onProgress?.(vectors.length, texts.length)
  }
  return { model, vectors }
}
