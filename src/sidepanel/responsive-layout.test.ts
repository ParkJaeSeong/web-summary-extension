import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('responsive extension layouts', () => {
  it('keeps narrow side-panel controls wrapping within the viewport', () => {
    const styles = readFileSync(resolve('src/sidepanel/styles.scss'), 'utf8')

    expect(styles).toContain('@media (max-width: 380px)')
    expect(styles).toMatch(/\.panel__header \.panel__actions[\s\S]*?flex-wrap: wrap/)
    expect(styles).toMatch(/\.message p[\s\S]*?overflow-wrap: anywhere/)
    expect(styles).toMatch(/\.caption-language select[\s\S]*?max-width: none/)
  })

  it('stacks settings controls on narrow screens', () => {
    const styles = readFileSync(resolve('src/options/styles.scss'), 'utf8')

    expect(styles).toContain('@media (max-width: 700px)')
    expect(styles).toMatch(/\.setting-row[\s\S]*?flex-direction: column/)
    expect(styles).toMatch(/\.privacy-list[\s\S]*?grid-template-columns: 1fr/)
    expect(styles).toContain('@media (max-width: 460px)')
  })
})
