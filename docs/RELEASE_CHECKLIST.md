# PageMind Release Readiness Checklist

Last updated: 2026-08-16

Target: Chrome Web Store beta release (`0.1.0`)

This document is the source of truth for release work. Check an item only after its acceptance
criteria and verification steps have passed. Add a short note to the progress log whenever a phase
is completed or its scope changes.

## Status legend

- `[ ]` Not started or not verified
- `[x]` Completed and verified
- `P0` Blocks release
- `P1` Required before public beta
- `P2` Safe to schedule after beta

## Release scope

### Included in the first beta

- [x] Chat with regular webpages
- [x] Chat with YouTube manual and automatic captions
- [x] Chat with text-based PDFs
- [x] Web paragraph, YouTube timestamp, and PDF page citations
- [x] OpenAI, Gemini, Anthropic, and OpenAI-compatible chat providers
- [x] OpenAI, Gemini, and OpenAI-compatible/local embedding providers
- [x] Local conversations, content cache, embeddings, and page memory
- [x] Reusable prompt action buttons
- [x] Markdown conversation export
- [x] Direct Markdown export to a user-selected Obsidian Vault

### Explicitly excluded from the first beta

- [ ] Scanned-PDF OCR (`P2`)
- [ ] Cloud sync and user accounts (`P2`)
- [ ] Firefox and Safari distribution (`P2`)
- [ ] Continuous monitoring of changing webpages (`P2`)

## Phase 1 — Code foundation (`P0`)

### TypeScript and dependency health

- [x] Upgrade TypeScript to a version compatible with installed Node typings.
- [x] Pin compatible `@types/node`, Preact, React compatibility, and extension API typings.
- [x] Add `pnpm typecheck`.
- [x] Make `pnpm typecheck` pass without suppressing project errors.
- [x] Add TypeScript files to lint and formatting scripts.
- [x] Decide on npm or pnpm and retain one authoritative lockfile workflow.
- [x] Confirm whether `pnpm-workspace.yaml` is required; remove it if it is not.

Acceptance criteria:

- [x] `pnpm typecheck` exits successfully.
- [x] `pnpm build` exits successfully.
- [x] A frozen-lockfile install and `pnpm check` build the extension successfully.

### Typed extension messaging

- [x] Define a discriminated request/response type for every runtime message.
- [x] Type content-script, background, side-panel, and offscreen listeners.
- [x] Remove message-boundary `any` where practical.
- [x] Add request IDs or cancellation where concurrent work can race.
- [x] Verify unmatched runtime listeners do not consume another listener's response.

Messages to cover:

- [x] `GET_PAGE_CONTEXT`
- [x] `GET_PDF_CONTEXT`
- [x] `GENERATE_EMBEDDINGS`
- [x] `PARSE_PDF`
- [x] `PING_OFFSCREEN`
- [x] `OPEN_SIDE_PANEL`
- [x] `PAGE_CONTEXT_CHANGED`
- [x] `SCROLL_TO_PAGE_CHUNK`

### Common content model

- [x] Rename YouTube-specific state such as `indexingTranscript` to content-neutral names.
- [x] Rename storage statistics such as `videos` and `transcriptChunks` to neutral names.
- [x] Define common extraction status, progress, truncation, and error metadata.
- [x] Keep webpage, YouTube, and PDF source-specific behavior behind adapters.
- [x] Verify all three sources use the same cache, retrieval, prompt, and export pipeline.

## Phase 2 — Automated testing (`P0`)

### Test infrastructure

- [x] Add Vitest and jsdom.
- [x] Add IndexedDB and Chrome extension API mocks.
- [x] Add stable webpage, YouTube response, caption, and PDF fixtures.
- [x] Add `pnpm test` and `pnpm test:watch`.
- [x] Make tests deterministic and independent of live YouTube responses.

### Webpage tests

- [x] Prefer `article`, `main`, or `[role=main]` content.
- [x] Fall back when no structured content exists.
- [x] Enforce content limits without producing invalid chunks.
- [x] Resolve and navigate DOM citations.

### YouTube tests

- [x] Parse manual caption tracks.
- [x] Parse automatic `asr` caption tracks.
- [x] Parse JSON3 and XML captions.
- [x] Fall back to the rendered transcript panel.
- [x] Select the requested caption language.
- [x] Convert timestamps and navigate to the correct playback time.
- [x] Handle SPA video changes without leaking the previous context.
- [x] Distinguish no captions from extraction failure.

### PDF tests

- [x] Parse a normal multi-page text PDF.
- [x] Preserve page numbers when blank pages exist.
- [x] Read metadata titles and generate a safe fallback title.
- [x] Reject non-PDF responses and oversized files.
- [ ] Report encrypted, malformed, and textless PDFs clearly. (Encrypted fixture remains.)
- [x] Clean up pdf.js pages and documents after processing. (Worker idle lifecycle is Phase 5.)
- [x] Verify origin-permission recovery from the side panel.

### Retrieval, storage, and export tests

- [x] Keyword retrieval scoring.
- [x] Cosine similarity and hybrid retrieval scoring.
- [x] Neighboring chunk expansion.
- [x] Even sampling for whole-content summaries.
- [x] Re-indexing when the embedding model changes.
- [x] Cache expiry and item-count pruning.
- [x] Legacy summary prompt and embedding setting migration.
- [x] Web, YouTube, and PDF Markdown citation links.
- [x] YAML and filename escaping.

Acceptance criteria:

- [x] All unit tests pass locally.
- [ ] The seven smoke-test scenarios in Phase 8 pass.
- [ ] A regression in extraction, citations, cache policy, or migration fails a test.

## Phase 3 — User experience and localization (`P1`)

### Korean and English UI

- [x] Move side-panel strings into localization resources.
- [x] Move options strings into localization resources.
- [x] Localize loading, permission, empty-state, and error messages.
- [x] Keep UI language separate from AI response language.
- [ ] Verify Korean and English layouts for overflow and truncation. (Automated narrow-width CSS
      checks pass; manual extension-page visual verification remains.)

### Progress and cancellation

- [x] Show content extraction progress.
- [x] Show YouTube caption discovery and transcript fallback status.
- [x] Show PDF download and page parsing progress.
- [x] Show embedding batch progress (`completed / total`).
- [x] Add answer-generation cancellation.
- [x] Add indexing cancellation and retry.
- [x] Ensure cancellation always clears loading state.

### Unified user-facing errors

- [x] Introduce stable error codes and localized messages.
- [x] Replace raw Chrome, fetch, and provider errors with actionable guidance.
- [x] Add actions for permission, configuration, retry, and refresh errors.
- [x] Distinguish missing content from extraction failure.

Error cases to cover:

- [x] Content script unavailable
- [x] PDF permission required
- [x] PDF too large, encrypted, malformed, or textless
- [x] YouTube captions unavailable or transcript extraction failed
- [x] Embedding provider missing, unauthorized, or rate-limited
- [x] Chat provider missing, unauthorized, or rate-limited

## Phase 4 — Privacy, cost, and data controls (`P1`)

### Data-flow disclosure

- [x] Explain what is stored locally.
- [x] Explain what is sent to the chat provider.
- [x] Explain what is sent to the embedding provider.
- [x] Explain PDF site permissions and local-file access.
- [x] Clarify that clearing content cache does not clear conversations.

### Embedding controls

- [x] Add a clear automatic-indexing toggle.
- [x] Show the expected number of chunks before expensive indexing.
- [x] Indicate whether the provider is remote or local.
- [x] Avoid silently generating a large number of paid API calls.
- [x] Continue keyword search when embeddings are disabled or fail.

### Local data manager

- [x] List cached webpages, videos, and PDFs.
- [x] Show type, last access, text size, vector size, and embedding model.
- [x] Delete one item.
- [x] Delete only an item's embeddings.
- [x] Delete all cached content.
- [x] Manage conversations separately.
- [x] Avoid serializing every vector merely to calculate display size.

### API key safety

- [x] Confirm keys use local, not sync, storage.
- [x] Ensure keys and authorization headers never appear in logs or exported Markdown.
- [x] Sanitize provider error bodies before showing them in the UI.
- [x] Document the security limits of browser local storage.

## Phase 5 — Performance and lifecycle (`P1`)

- [ ] Test a two-hour YouTube video without freezing the side panel. (Synthetic two-hour transcript
      passes; manual browser profiling remains.)
- [ ] Test a 300-page text PDF without freezing the side panel. (Synthetic 300-page extraction
      passes with event-loop yielding; manual browser profiling remains.)
- [x] Avoid duplicate indexing jobs for the same content and model.
- [x] Resume or retry failed embedding batches safely.
- [x] Close the offscreen document after an idle period.
- [x] Recover from an outdated or failed offscreen document after extension updates.
- [x] Verify cache statistics remain responsive near the configured item limit.
- [x] Measure unpacked size and remove unnecessary pdf.js assets if safe. (4.6 MB unpacked, 2.1 MB
      ZIP; CMaps, standard fonts, and worker retained for PDF correctness.)

Acceptance criteria:

- [x] Long-content indexing remains cancellable and the UI remains responsive.
- [ ] Browser memory returns to a reasonable level after PDF work finishes.
- [x] Reopening cached content does not repeat extraction or embedding unnecessarily.

## Phase 6 — Permissions and security review (`P0`)

- [x] Document why `storage`, `activeTab`, `tabs`, `sidePanel`, `scripting`, and `offscreen` are needed.
- [x] Request PDF origins only when the user tries to read that PDF.
- [x] Request provider origins only when the provider configuration is saved.
- [x] Validate protocols and hosts before background or offscreen fetches.
- [x] Keep PDF MIME/signature and size validation.
- [x] Review extension CSP and confirm there is no remote executable code.
- [x] Review all external links opened from Markdown.
- [x] Test restricted pages, Chrome Web Store pages, file URLs, and inaccessible origins.
- [x] Remove any permission that lacks a current use.

Acceptance criteria:

- [x] Every manifest permission has a concise Web Store justification.
- [x] No arbitrary URL can be fetched through an unvalidated message.
- [x] Permission denial leaves PageMind in a usable state.

## Phase 7 — Repository and release assets (`P1`)

### Repository hygiene

- [x] Remove all remaining legacy product references.
- [x] Add session ID files and generated packages to `.gitignore`.
- [x] Remove obsolete Firefox, Safari, screenshot, and legacy assets or document why they remain.
- [x] Remove unused dependencies and scripts.
- [x] Decide whether build output is committed or always generated.
- [x] Make package generation deterministic.

### Versioning and documentation

- [x] Set package and manifest versions to `0.1.0` for beta.
- [x] Include version in the generated ZIP filename.
- [x] Rewrite README for the current PageMind product.
- [x] Add supported-content and known-limitations sections.
- [x] Add `PRIVACY.md`.
- [x] Add `SECURITY.md`.
- [x] Add `CHANGELOG.md`.
- [x] Add third-party license notices, including pdf.js.
- [x] Document install, development, test, and build commands.

### Store assets

- [x] Finalize product name and one-sentence positioning.
- [x] Prepare final 16, 32, 48, and 128 px icons.
- [ ] Capture current screenshots for webpage, YouTube, PDF, memory, and settings.
- [x] Prepare promotional artwork in required dimensions.
- [ ] Publish a privacy-policy URL and support contact.
- [x] Write single-purpose, permission, and data-use disclosures.

## Phase 8 — Manual release verification (`P0`)

### Required smoke tests

- [ ] Webpage → prompt action → cited answer → source paragraph navigation.
- [ ] YouTube → automatic captions → semantic question → timestamp navigation.
- [ ] PDF → permission grant → semantic question → page navigation.
- [ ] Reopen each source → cached content and embeddings are reused.
- [ ] Change embedding provider/model → content is re-indexed once.
- [ ] Export a conversation → valid Markdown links and frontmatter.
- [ ] Change cache policy → excess cached items are removed immediately.

### Installation and failure tests

- [ ] Fresh install with no saved settings.
- [ ] Upgrade from the current development build.
- [ ] Browser restart and extension service-worker restart.
- [ ] Invalid and missing API keys.
- [ ] Provider rate limit and network-offline behavior.
- [ ] Permission denial and later permission grant.
- [ ] Korean and English Chrome profiles.

### Beta gate

- [ ] Test at least 10 webpages, 10 YouTube videos, and 10 PDFs.
- [ ] Complete a small external beta with 5–10 users.
- [ ] Resolve every open `P0` issue.
- [ ] Document accepted `P1` exceptions, if any.
- [ ] Produce and archive a reproducible release ZIP.

## Phase 9 — Chrome Web Store submission (`P1`)

- [ ] Complete listing title, short description, and detailed description.
- [ ] Upload icon, screenshots, and promotional images.
- [ ] Complete privacy and data-use questionnaires accurately.
- [ ] Add permission justifications.
- [ ] Confirm the package contains no remote executable code.
- [ ] Upload the release ZIP and record its checksum.
- [ ] Submit for review.
- [ ] Record review feedback and required changes in this document.
- [ ] Tag the approved source revision.

## Phase 10 — Instant conversation (`P1`)

### Shared conversation foundation

- [x] Extract shared message creation and pinned-selection normalization from the Side Panel.
- [x] Add pinned selections to the provider prompt independently of relevance ranking.
- [x] Continue the existing URL conversation when a new selection is attached.
- [x] Move streaming lifecycle, cancellation, and provider errors into a reusable headless chat
      session.
- [ ] Move conversation persistence policy into the reusable headless chat session.

### Low-friction entry points

- [x] Add a selection-only “Ask PageMind” context-menu action.
- [x] Add a keyboard command for sending the current selection to PageMind.
- [x] Open the Side Panel with the selected text visibly pinned and focus the composer.
- [x] Add a small selection affordance beside the webpage selection.
- [x] Build the inline mini-chat UI using the shared headless chat session.

### Selection conversation behavior

- [x] Treat the selection as forced context rather than a relevance-ranked hint.
- [x] Keep selection conversations in the existing URL conversation by default.
- [x] Let the user remove the pinned selection without clearing the conversation.
- [ ] Add an explicit “new conversation” action and transient-thread option.
- [ ] Add Chrome E2E coverage for context menu, keyboard shortcut, panel handoff, and persistence.

## Phase 11 — Multi-source context (`P1`)

### Source selection and persistence

- [x] Let the user explicitly add locally cached webpage, YouTube, and PDF sources.
- [x] Support up to five total sources without silently reading every open tab.
- [x] Show selected sources as removable chips in the Side Panel.
- [x] Persist selected source cache keys with the primary URL conversation.
- [x] Add open-tab discovery, title/URL filtering, and user-triggered extraction for uncached
      webpage and YouTube tabs.
- [ ] Support inactive, uncached PDF tabs without silently switching the user's active tab.

### Retrieval, prompting, and citations

- [x] Build a bounded multi-source prompt with per-source relevance selection.
- [x] Namespace chunk citations by source to prevent `page-1` collisions.
- [x] Navigate current-source citations and open additional-source citations at their URL,
      timestamp, or PDF page.
- [x] Apply semantic retrieval independently to every selected source with compatible embeddings.
- [x] Export all multi-source citations and source metadata to Markdown.

### Verification

- [x] Add deterministic prompt, citation, cache-key, and conversation-persistence tests.
- [ ] Add Chrome E2E coverage for source selection, comparison, reload recovery, and citation links.

## Progress log

- 2026-08-16: Created the release checklist. Existing webpage, YouTube, PDF, provider,
  local-memory, prompt-action, cache-policy, citation, and Markdown features were manually exercised
  during development; formal release verification remains unchecked.
- 2026-08-16: Standardized the project on pnpm 9.15.9, removed the invalid workspace file,
  upgraded to TypeScript 5.9.3 and compatible lint/type packages, added Chrome typings and
  `typecheck`/`lint`/`format`/`check` scripts, fixed the resulting source errors, and verified a
  frozen-lockfile install plus the full `pnpm check` pipeline.
- 2026-08-16: Added discriminated runtime and tab message protocols plus a typed page-chat port,
  migrated the background, offscreen, content-script, and side-panel boundaries, and ensured
  unmatched listeners return no response. Request cancellation remains a separate lifecycle task.
- 2026-08-16: Replaced YouTube-specific indexing and cache-stat terminology with content-neutral
  names, added shared extraction completion/progress/truncation metadata to webpage, YouTube, and
  PDF contexts, and normalized legacy cached contexts during reads.
- 2026-08-16: Introduced a shared content-adapter contract, applied it to webpage and YouTube DOM
  extractors, and moved PDF offscreen lifecycle, parsing dispatch, and context conversion out of
  the background entrypoint into a dedicated PDF adapter.
- 2026-08-16: Unified webpage, YouTube, and PDF local-context caching, semantic indexing, hybrid
  retrieval, prompting, and Markdown export paths. Canonical cache keys now ignore URL fragments,
  and stale embedding jobs cannot overwrite a newly loaded content context. Phase 1 is complete.
- 2026-08-16: Added Vitest, jsdom, fake IndexedDB, and browser-storage mocks; made tests part of the
  required `pnpm check` pipeline; and added six deterministic tests covering hybrid retrieval,
  webpage context/embedding reuse, cache statistics, source-specific Markdown links, and escaping.
- 2026-08-16: Added deterministic webpage and YouTube fixtures plus ten extractor tests covering
  structured-content preference, fallback extraction, content limits, DOM citation navigation,
  manual/automatic caption download flows, JSON3/XML parsing, timestamp conversion, and seeking.
- 2026-08-16: Separated the PDF parser from the offscreen message entrypoint and added a generated
  three-page PDF fixture plus six tests for text and metadata extraction, blank-page numbering,
  truncation, MIME/signature and size rejection, malformed files, and textless/OCR guidance.
- 2026-08-16: Added configuration and storage regression tests for legacy prompt/provider migration,
  cache expiry, immediate item-count pruning, embedding model/chunk invalidation, neighboring chunk
  expansion, and even whole-content sampling. The suite now contains 32 deterministic tests.
- 2026-08-16: Added YouTube transcript-panel fallback and SPA navigation regression tests, plus
  stable extraction error codes that distinguish unavailable captions from failed extraction.
  The side panel now presents the corresponding message; the suite contains 35 tests.
- 2026-08-16: Extracted and tested PDF origin-permission recovery, including grant/retry, denial,
  file URL guidance, and protocol validation. PDF page and document cleanup now has explicit
  success/failure lifecycle tests. The suite contains 42 tests.
- 2026-08-16: Added a Chrome i18n wrapper with safe English fallback, moved primary side-panel
  navigation, empty states, PDF/YouTube notices, memory controls, and composer strings into English
  and Korean locale resources, and kept Chrome UI locale independent from AI response language.
- 2026-08-16: Localized the settings, prompt-action, page-button, local-storage, chat-provider, and
  embedding-provider controls plus their confirmation, validation, permission, and save messages
  in English and Korean. The full 44-test check and production build pass.
- 2026-08-16: Introduced stable PageMind error codes and centralized classification/localization for
  content access, PDF, YouTube, provider authentication/rate limits, network, embedding, chat, and
  citation failures. Raw provider response bodies are no longer shown to users; 53 tests pass.
- 2026-08-16: Added localized webpage/YouTube/PDF loading states, exact embedding batch progress,
  answer cancellation backed by port disconnect and request IDs, plus safe indexing cancellation
  and retry. PDF page-by-page progress remains open; 59 tests and the production build pass.
- 2026-08-16: Added request-scoped PDF progress and cancellation messages across side panel,
  background, and offscreen contexts. The UI now shows download, current/total page parsing, and
  finishing stages; cancellation aborts fetch/page iteration and still destroys PDF resources.
  The suite contains 61 tests.
- 2026-08-16: Hardened narrow Side Panel and settings layouts with wrapping header actions,
  long-text breaking, stacked caption/storage controls, and 380/460/700 px responsive rules.
  Automated CSS regressions bring the suite to 63 tests; Chrome blocks automated inspection of
  `chrome-extension://` pages, so final Korean/English visual verification remains manual.
- 2026-08-16: Completed Phase 4 privacy and cost controls. Automatic content indexing now defaults
  off, manual indexing previews chunk count, and embedding settings identify local versus remote
  data flow. Added localized data disclosures, per-item cache and embedding deletion, separate
  conversation cleanup, allocation-free vector size estimates, local API-key storage guidance,
  and provider-response/log sanitization. All 65 tests and the production build pass.
- 2026-08-16: Added resumable, cancellable embedding checkpoints so retries continue after the last
  successful batch, while request keys prevent duplicate content/model jobs. PDF extraction now
  yields every ten pages and its offscreen document requests shutdown after 60 idle seconds, with
  active-job verification and stale-document recreation. Synthetic two-hour YouTube, 300-page PDF,
  and near-limit cache tests pass. The package measures 4.6 MB unpacked and 2.1 MB zipped; required
  PDF.js CMaps, fonts, and worker were retained. Manual long-content browser memory/UI profiling
  remains before Phase 5 is fully closed.
- 2026-08-16: Completed Phase 6 permission and security review. Removed the permanent OpenAI host
  grant, moved all provider/PDF origins to exact user-triggered optional requests, and revalidated
  permissions immediately before fetch. Added shared URL hardening against unsafe protocols,
  credential-bearing hosts, remote HTTP, host-changing API paths, unsafe Markdown links, and PDF
  URLs that differ from the active tab. Added an explicit self-only extension CSP and documented
  every permission in `docs/PERMISSIONS.md`. Restricted-page, Web Store, file URL, denial, and URL
  validation coverage brings the suite to 83 passing tests.
- 2026-08-16: Completed the code and documentation portions of Phase 7. Removed obsolete Safari,
  Firefox-package, legacy screenshot, unused locale, and stale product assets; ignored generated
  packages and session IDs; standardized the beta version at `0.1.0`; and replaced the old CI with
  pnpm-based Chrome checks. Rewrote the README and added privacy, security, changelog, permission,
  store-listing, and third-party notice documents. Packaging now uses sorted buffered inputs and
  fixed timestamps; two consecutive builds produced the same SHA-256
  (`d5af12879f81fb71a16cdc0c38d7c18de0bf15fd3b6154603111a91ac494e0c4`). ImageGen produced
  text-free 440×280 and 1400×560 promotional assets from the PageMind character reference. Final
  installed-product screenshots, a hosted privacy URL, and a public support contact remain.
- 2026-08-22: Started PageMind 0.2 Instant Conversation. Added selection-only context-menu and
  keyboard entry points, session-scoped selection handoff, visible removable pinned context, and
  shared prompt/message primitives. Selection questions continue the existing URL conversation;
  the reusable streaming session and inline mini-chat remain next.
- 2026-08-22: Added a reusable headless streaming session with deterministic completion,
  cancellation, provider-error, and disconnect behavior. Added an inline selection affordance and
  mini chat that loads and saves the same URL conversation, forces the selected text into context,
  streams answers in place, and can hand the pinned selection to the full Side Panel.
- 2026-08-22: Started multi-source context with an explicit local-cache picker for up to five
  webpage, YouTube, and PDF sources. Added bounded per-source retrieval, collision-free namespaced
  citations, additional-source URL/timestamp/page navigation, removable source chips, and selected
  source persistence on the primary URL conversation. Open-tab extraction, per-source semantic
  retrieval, multi-source Markdown export, and Chrome E2E coverage remain.
- 2026-08-22: Extended the multi-source picker with title/URL filtering and user-triggered reading
  of uncached open webpage and YouTube tabs. A single query embedding now ranks every selected
  source whose stored vectors use the compatible model. Markdown export includes all selected
  source metadata, namespaced citation links, and cited excerpts. Inactive uncached PDFs remain an
  explicit limitation because PageMind does not switch the user's active tab without consent.
- 2026-08-23: Began manual Phase 8 verification in Chrome. Confirmed the PageMind launcher and Side
  Panel entry point on an existing YouTube video, reloaded a regular webpage with the current
  content script, and observed no page-console errors. Corrected caption selection so an automatic
  track in the requested locale wins over an unrelated manual track, and added regression coverage.
- 2026-08-23: Added direct Obsidian Vault export through Chrome's user-authorized File System Access
  API. PageMind remembers the selected directory handle locally, renews access when Chrome requires
  it, writes the existing citation-rich Markdown export without scanning the Vault, and reports
  localized success, cancellation, unsupported-browser, and write-failure states.
