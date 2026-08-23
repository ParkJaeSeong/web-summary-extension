import { getUserConfig } from '@/config'
import { isTabMessage, sendRuntimeMessage } from '@/messaging'
import Browser from 'webextension-polyfill'
import { capturePageContext, scrollToPageChunk } from './page-context'
import { mountSelectionChat } from './selection-chat'

const LAUNCHER_HOST_ID = 'pagemind-launcher-host'
const BUTTON_SIZE = 44
const EDGE_GAP = 8

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max)
}

function launcherBounds() {
  return {
    maxLeft: Math.max(EDGE_GAP, window.innerWidth - BUTTON_SIZE - EDGE_GAP),
    maxTop: Math.max(EDGE_GAP, window.innerHeight - BUTTON_SIZE - EDGE_GAP),
  }
}

Browser.runtime.onMessage.addListener((message) => {
  if (!isTabMessage(message)) return
  const { type } = message
  if (type === 'GET_PAGE_CONTEXT') {
    // Chrome's built-in PDF viewer still runs content scripts against the outer document,
    // but that document has no readable text (it just hosts the PDF plugin/guest view), so
    // the webpage scraper would silently return an empty context. Detect it here and let the
    // side panel redirect to the PDF pipeline (background fetch + offscreen pdf.js) instead.
    if (document.contentType === 'application/pdf') {
      return Promise.resolve({ isPdfDocument: true })
    }
    return capturePageContext({ captionLanguage: message.data?.captionLanguage })
  } else if (type === 'SCROLL_TO_PAGE_CHUNK') {
    return Promise.resolve({ found: scrollToPageChunk(message.data.chunkId) })
  } else if (type === 'GET_SELECTED_TEXT') {
    return Promise.resolve({ text: window.getSelection()?.toString().trim() || '' })
  }
})

async function mountLauncher() {
  const config = await getUserConfig()
  document.getElementById(LAUNCHER_HOST_ID)?.remove()
  if (!config.pageButtonEnabled || !document.body) return

  const host = document.createElement('div')
  host.id = LAUNCHER_HOST_ID
  const shadow = host.attachShadow({ mode: 'closed' })
  const button = document.createElement('button')
  const icon = document.createElement('img')

  button.type = 'button'
  button.title = 'Open PageMind · Drag to move'
  button.setAttribute('aria-label', 'Open PageMind')
  icon.src = Browser.runtime.getURL('logo-48.png')
  icon.alt = ''
  button.append(icon)
  let dragged = false
  button.addEventListener('click', () => {
    if (dragged) {
      dragged = false
      return
    }
    sendRuntimeMessage({ type: 'OPEN_SIDE_PANEL' }).catch(() => {
      button.title = 'PageMind was updated. Refresh this page to reconnect.'
      button.style.opacity = '0.55'
    })
  })

  const position = config.pageButtonPosition
  if (position) {
    const { maxLeft, maxTop } = launcherBounds()
    button.style.left = `${clamp(position.x, 0, 1) * maxLeft}px`
    button.style.top = `${clamp(position.y, 0, 1) * maxTop}px`
    button.style.right = 'auto'
    button.style.bottom = 'auto'
  }

  button.addEventListener('pointerdown', (event) => {
    if (event.button !== 0) return
    const rect = button.getBoundingClientRect()
    const startX = event.clientX
    const startY = event.clientY
    const startLeft = rect.left
    const startTop = rect.top
    dragged = false
    button.setPointerCapture(event.pointerId)

    const move = (moveEvent: PointerEvent) => {
      const deltaX = moveEvent.clientX - startX
      const deltaY = moveEvent.clientY - startY
      if (Math.hypot(deltaX, deltaY) < 4 && !dragged) return
      dragged = true
      const { maxLeft, maxTop } = launcherBounds()
      button.style.left = `${clamp(startLeft + deltaX, EDGE_GAP, maxLeft)}px`
      button.style.top = `${clamp(startTop + deltaY, EDGE_GAP, maxTop)}px`
      button.style.right = 'auto'
      button.style.bottom = 'auto'
    }

    const finish = () => {
      button.removeEventListener('pointermove', move)
      button.removeEventListener('pointerup', finish)
      button.removeEventListener('pointercancel', finish)
      if (!dragged) return
      const movedRect = button.getBoundingClientRect()
      const { maxLeft, maxTop } = launcherBounds()
      Promise.resolve()
        .then(() =>
          Browser.storage.local.set({
            pageButtonPosition: {
              x: clamp(movedRect.left / maxLeft, 0, 1),
              y: clamp(movedRect.top / maxTop, 0, 1),
            },
          }),
        )
        .catch(() => {})
    }

    button.addEventListener('pointermove', move)
    button.addEventListener('pointerup', finish)
    button.addEventListener('pointercancel', finish)
  })

  const style = document.createElement('style')
  style.textContent = `
    button {
      position: fixed;
      right: 18px;
      bottom: 18px;
      z-index: 2147483647;
      display: grid;
      width: 44px;
      height: 44px;
      padding: 3px;
      place-items: center;
      border: 1px solid rgba(15, 23, 42, 0.16);
      border-radius: 14px;
      background: rgba(255, 255, 255, 0.94);
      box-shadow: 0 8px 24px rgba(15, 23, 42, 0.2);
      cursor: pointer;
      touch-action: none;
      user-select: none;
      transition: transform 120ms ease, box-shadow 120ms ease;
    }
    button:hover { transform: translateY(-2px); box-shadow: 0 10px 28px rgba(15, 23, 42, 0.26); }
    button:focus-visible { outline: 3px solid rgba(37, 99, 235, 0.42); outline-offset: 2px; }
    img { display: block; width: 36px; height: 36px; }
  `

  shadow.append(style, button)
  document.body.append(host)
}

mountLauncher().catch(() => {})
mountSelectionChat()

document.addEventListener('yt-navigate-finish', () => {
  sendRuntimeMessage({ type: 'PAGE_CONTEXT_CHANGED', url: location.href }).catch(() => {})
})

Browser.storage.onChanged.addListener((changes, areaName) => {
  if (areaName === 'local' && changes.pageButtonEnabled) mountLauncher().catch(() => {})
})
