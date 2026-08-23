import { PageContext } from '@/core/page-context'
import { openDatabase, PAGE_MEMORIES_STORE, requestToPromise } from './database'

const MAX_EXCERPTS = 12
const MAX_EXCERPT_CHARS = 500

export interface PageMemory {
  url: string
  title: string
  domain: string
  description: string
  excerpts: string[]
  firstVisitedAt: number
  lastVisitedAt: number
  visitCount: number
  embedding?: Float32Array
  embeddingModel?: string
}

export interface PageMemoryEmbedding {
  vector: number[]
  model: string
}

export function pageMemoryText(context: PageContext) {
  return [
    context.title,
    context.description,
    ...context.chunks.slice(0, MAX_EXCERPTS).map((chunk) => chunk.text),
  ]
    .filter(Boolean)
    .join('\n')
    .slice(0, 8000)
}

export function cosineSimilarity(left: Float32Array, right: number[]) {
  if (left.length !== right.length || left.length === 0) return undefined
  let dot = 0
  let leftMagnitude = 0
  let rightMagnitude = 0
  for (let index = 0; index < left.length; index += 1) {
    dot += left[index] * right[index]
    leftMagnitude += left[index] * left[index]
    rightMagnitude += right[index] * right[index]
  }
  const denominator = Math.sqrt(leftMagnitude) * Math.sqrt(rightMagnitude)
  return denominator === 0 ? undefined : dot / denominator
}

export interface PageMemoryResult extends PageMemory {
  score: number
}

function tokenize(value: string) {
  return Array.from(
    new Set(
      value
        .toLocaleLowerCase()
        .replace(/[^\p{L}\p{N}]+/gu, ' ')
        .split(/\s+/)
        .filter((token) => token.length >= 2),
    ),
  )
}

export async function savePageMemory(
  context: PageContext,
  embedding?: PageMemoryEmbedding,
): Promise<void> {
  const database = await openDatabase()
  try {
    const readTransaction = database.transaction(PAGE_MEMORIES_STORE, 'readonly')
    const previous = await requestToPromise(
      readTransaction.objectStore(PAGE_MEMORIES_STORE).get(context.url) as IDBRequest<
        PageMemory | undefined
      >,
    )
    const now = Date.now()
    const memory: PageMemory = {
      url: context.url,
      title: context.title,
      domain: new URL(context.url).hostname,
      description: context.description,
      excerpts: context.chunks
        .slice(0, MAX_EXCERPTS)
        .map((chunk) => chunk.text.slice(0, MAX_EXCERPT_CHARS)),
      firstVisitedAt: previous?.firstVisitedAt || now,
      lastVisitedAt: now,
      visitCount: (previous?.visitCount || 0) + 1,
      embedding: embedding ? new Float32Array(embedding.vector) : previous?.embedding,
      embeddingModel: embedding?.model || previous?.embeddingModel,
    }
    const writeTransaction = database.transaction(PAGE_MEMORIES_STORE, 'readwrite')
    await requestToPromise(writeTransaction.objectStore(PAGE_MEMORIES_STORE).put(memory))
  } finally {
    database.close()
  }
}

export async function searchPageMemories(
  query: string,
  options: { limit?: number; queryVector?: number[]; embeddingModel?: string } = {},
): Promise<PageMemoryResult[]> {
  const database = await openDatabase()
  try {
    const transaction = database.transaction(PAGE_MEMORIES_STORE, 'readonly')
    const memories = await requestToPromise(
      transaction.objectStore(PAGE_MEMORIES_STORE).getAll() as IDBRequest<PageMemory[]>,
    )
    const terms = tokenize(query)
    const now = Date.now()
    const limit = options.limit || 20

    return memories
      .map((memory) => {
        const title = memory.title.toLocaleLowerCase()
        const description = memory.description.toLocaleLowerCase()
        const excerpts = memory.excerpts.join(' ').toLocaleLowerCase()
        const domain = memory.domain.toLocaleLowerCase()
        let score = terms.length === 0 ? 1 : 0
        let matches = 0
        for (const term of terms) {
          if (title.includes(term)) {
            score += 8
            matches += 1
          }
          if (domain.includes(term)) {
            score += 5
            matches += 1
          }
          if (description.includes(term)) {
            score += 3
            matches += 1
          }
          if (excerpts.includes(term)) {
            score += 1
            matches += 1
          }
        }
        const daysAgo = (now - memory.lastVisitedAt) / 86_400_000
        const semanticScore =
          options.queryVector &&
          memory.embedding &&
          memory.embeddingModel === options.embeddingModel
            ? cosineSimilarity(memory.embedding, options.queryVector)
            : undefined
        if (semanticScore !== undefined) score += Math.max(0, semanticScore) * 12
        score += Math.max(0, 2 - daysAgo / 30)
        score += Math.min(memory.visitCount, 5) * 0.2
        return { ...memory, score, matches, semanticScore }
      })
      .filter(
        (memory) => terms.length === 0 || memory.matches > 0 || memory.semanticScore !== undefined,
      )
      .sort((a, b) => b.score - a.score || b.lastVisitedAt - a.lastVisitedAt)
      .slice(0, limit)
  } finally {
    database.close()
  }
}
