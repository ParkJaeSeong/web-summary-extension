import { describe, expect, it, vi } from 'vitest'
import { EmbeddingCheckpoint, indexContentInBatches } from './embedding-index'

describe('content embedding batches', () => {
  it('resumes from the last completed batch after a failure', async () => {
    const firstEmbed = vi
      .fn()
      .mockResolvedValueOnce({ model: 'model-a', vectors: [[1], [2]] })
      .mockRejectedValueOnce(new Error('temporary failure'))
    let checkpoint: EmbeddingCheckpoint | undefined

    await expect(
      indexContentInBatches({
        key: 'content:model-a',
        texts: ['a', 'b', 'c', 'd', 'e'],
        batchSize: 2,
        embedBatch: firstEmbed,
        onCheckpoint: (value) => (checkpoint = value),
      }),
    ).rejects.toThrow('temporary failure')

    const retryEmbed = vi.fn(async (texts: string[]) => ({
      model: 'model-a',
      vectors: texts.map((_, index) => [index + 3]),
    }))
    const result = await indexContentInBatches({
      key: 'content:model-a',
      texts: ['a', 'b', 'c', 'd', 'e'],
      batchSize: 2,
      checkpoint,
      embedBatch: retryEmbed,
    })

    expect(retryEmbed).toHaveBeenCalledTimes(2)
    expect(result.vectors).toHaveLength(5)
  })

  it('does not reuse a checkpoint from another content or model key', async () => {
    const embedBatch = vi.fn(async (texts: string[]) => ({
      model: 'model-b',
      vectors: texts.map(() => [1]),
    }))

    await indexContentInBatches({
      key: 'new:model-b',
      texts: ['a', 'b'],
      checkpoint: { key: 'old:model-a', model: 'model-a', vectors: [[9], [9]] },
      embedBatch,
      batchSize: 2,
    })

    expect(embedBatch).toHaveBeenCalledOnce()
  })

  it('stops before another batch while retaining completed progress', async () => {
    let cancelled = false
    let checkpoint: EmbeddingCheckpoint | undefined
    const embedBatch = vi.fn(async (texts: string[]) => {
      cancelled = true
      return { model: 'model-a', vectors: texts.map(() => [1]) }
    })

    await expect(
      indexContentInBatches({
        key: 'content:model-a',
        texts: ['a', 'b', 'c', 'd'],
        batchSize: 2,
        embedBatch,
        isCancelled: () => cancelled,
        onCheckpoint: (value) => (checkpoint = value),
      }),
    ).rejects.toMatchObject({ name: 'AbortError' })

    expect(embedBatch).toHaveBeenCalledOnce()
    expect(checkpoint?.vectors).toHaveLength(2)
  })
})
