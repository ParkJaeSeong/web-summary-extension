# PageMind

PageMind is a local-first Chrome assistant for chatting with webpages, YouTube videos, and PDFs —
with citations you can follow back to the source.

페이지마인드는 웹페이지, YouTube 영상, PDF를 읽고 출처 인용과 함께 대화할 수 있는 로컬 우선
Chrome 확장 프로그램입니다.

## Features

- One Side Panel experience for webpages, YouTube captions, and text-based PDFs
- Source navigation to webpage paragraphs, video timestamps, and PDF pages
- OpenAI, Gemini, Anthropic Claude, and OpenAI-compatible/local chat providers
- Independent OpenAI, Gemini, and OpenAI-compatible/local embedding providers
- Local conversations, content cache, semantic embeddings, and page memory
- Reusable prompt buttons, Markdown download, and direct Obsidian Vault export
- English and Korean interface

PageMind stores its working data on the current device. Content is sent to a configured AI provider
only for the action that needs it. See [PRIVACY.md](PRIVACY.md) and
[docs/PERMISSIONS.md](docs/PERMISSIONS.md).

## Supported content

- Ordinary HTTP(S) webpages with readable text
- YouTube videos with accessible manual or automatic captions
- HTTP(S) and local text-based PDF files

## Known limitations

- Scanned or image-only PDFs require OCR and are not supported in the first beta.
- YouTube videos without accessible captions cannot be transcribed by PageMind.
- Browser-protected pages, including `chrome://` pages and the Chrome Web Store, cannot be read.
- Page changes are captured when PageMind refreshes; continuous live-page monitoring is not yet
  included.
- Cloud sync, accounts, Firefox, and Safari builds are outside the first beta.

## Install an unpacked development build

1. Install Node.js 20 or newer and enable Corepack, or install pnpm 9.15.9.
2. Run `pnpm install --frozen-lockfile`.
3. Run `pnpm build`.
4. Open `chrome://extensions`, enable Developer mode, and choose **Load unpacked**.
5. Select `build/chromium`.

The release ZIP is generated as `packages/PageMind-0.1.0-chromium.zip`.

## Development

```sh
pnpm dev          # development build
pnpm test:watch   # tests in watch mode
pnpm typecheck    # TypeScript validation
pnpm lint         # ESLint
pnpm check        # typecheck, lint, format, tests, and production build
```

The authoritative package manager is pnpm 9.15.9. Generated `build/` and `packages/` content is not
committed. Release readiness is tracked in
[docs/RELEASE_CHECKLIST.md](docs/RELEASE_CHECKLIST.md).

## Security and privacy

- [Privacy policy](PRIVACY.md)
- [Security policy](SECURITY.md)
- [Permission rationale](docs/PERMISSIONS.md)
- [Third-party notices](THIRD_PARTY_NOTICES.md)

## Credits and license

PageMind evolved from an open-source browser-extension codebase originally derived from
`wong2/chatgpt-google-extension`. Current PageMind functionality and architecture have been
substantially rewritten.

The project is licensed under [GPL-3.0](LICENSE). See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)
for bundled third-party components.
