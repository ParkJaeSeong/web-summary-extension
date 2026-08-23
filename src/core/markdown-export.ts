import { ChatMessage, PageChunk, PageContext } from './page-context'

function yaml(value: string) {
  return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\r?\n/g, ' ')}"`
}

function sourceUrl(context: PageContext, chunk: PageChunk) {
  if (chunk.location.type === 'youtube') {
    return `https://www.youtube.com/watch?v=${encodeURIComponent(chunk.location.videoId)}&t=${
      chunk.location.seconds
    }s`
  }
  if (chunk.location.type === 'pdf') {
    return `${context.url}#page=${chunk.location.page}`
  }
  return context.url
}

function linkedCitations(content: string, context: PageContext) {
  let result = content
  for (const chunk of context.chunks) {
    result = result.replace(
      new RegExp(`\\[${chunk.id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\](?!\\()`, 'g'),
      `[${chunk.id}](${sourceUrl(context, chunk)})`,
    )
  }
  return result
}

function safeFilename(title: string) {
  const printable = Array.from(title)
    .map((character) => (character.charCodeAt(0) < 32 ? '-' : character))
    .join('')
  const name = printable
    .replace(/[<>:"/\\|?*]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
  return `${(name || 'PageMind conversation').slice(0, 100)}.md`
}

export function createConversationMarkdown(
  context: PageContext,
  messages: ChatMessage[],
  savedAt = new Date(),
) {
  const cited = context.chunks.filter((chunk) =>
    messages.some((message) => message.content.includes(`[${chunk.id}]`)),
  )
  const conversation = messages
    .map(
      (message) =>
        `## ${message.role === 'user' ? 'You' : 'PageMind'}\n\n${linkedCitations(
          message.content,
          context,
        )}`,
    )
    .join('\n\n')
  const sources = cited.length
    ? cited
        .map((chunk) => `- [${chunk.id}](${sourceUrl(context, chunk)}) — ${chunk.text}`)
        .join('\n')
    : `- [Original source](${context.url})`

  return {
    filename: safeFilename(context.title),
    content: `---
title: ${yaml(context.title || 'PageMind conversation')}
source: ${yaml(context.url)}
source_type: ${context.sourceType}
saved_at: ${yaml(savedAt.toISOString())}
tags:
  - pagemind
---

# ${context.title || 'PageMind conversation'}

> [Original source](${context.url}) · Saved with PageMind

${conversation}

## Sources

${sources}
`,
  }
}

export function createMultiSourceConversationMarkdown(
  contexts: PageContext[],
  messages: ChatMessage[],
  savedAt = new Date(),
) {
  const primary = contexts[0]
  let conversation = messages
    .map((message) => `## ${message.role === 'user' ? 'You' : 'PageMind'}\n\n${message.content}`)
    .join('\n\n')
  const cited: Array<{ citation: string; context: PageContext; chunk: PageChunk }> = []

  contexts.forEach((context, sourceIndex) => {
    context.chunks.forEach((chunk) => {
      const citation = `source-${sourceIndex + 1}:${chunk.id}`
      if (!messages.some((message) => message.content.includes(`[${citation}]`))) return
      cited.push({ citation, context, chunk })
      conversation = conversation.replace(
        new RegExp(`\\[${citation.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\](?!\\()`, 'g'),
        `[${citation}](${sourceUrl(context, chunk)})`,
      )
    })
  })

  const sourceList = contexts
    .map((context, index) => `- source-${index + 1}: [${context.title}](${context.url})`)
    .join('\n')
  const citations = cited.length
    ? cited
        .map(
          ({ citation, context, chunk }) =>
            `- [${citation}](${sourceUrl(context, chunk)}) — ${chunk.text}`,
        )
        .join('\n')
    : sourceList

  return {
    filename: safeFilename(`${primary.title} comparison`),
    content: `---
title: ${yaml(primary.title || 'PageMind multi-source conversation')}
source_count: ${contexts.length}
saved_at: ${yaml(savedAt.toISOString())}
tags:
  - pagemind
  - multi-source
---

# ${primary.title || 'PageMind multi-source conversation'}

## Selected sources

${sourceList}

${conversation}

## Cited excerpts

${citations}
`,
  }
}
