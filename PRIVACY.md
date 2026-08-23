# PageMind Privacy Policy

Last updated: 2026-08-16

PageMind is a local-first Chrome extension. It does not operate a PageMind account service or sync
your data to a PageMind cloud.

## Data stored on your device

PageMind stores settings and API keys in Chrome extension-local storage. Conversations, extracted
page content, YouTube captions, PDF text, embeddings, and page-memory records are stored in local
IndexedDB. You can configure retention limits and delete cached content, embeddings, and
conversations from Settings.

If you choose “Save to Obsidian,” PageMind stores a browser-managed handle to the Vault folder you
selected. It uses that handle only when you press the save button, writes the generated Markdown
note, and does not scan or upload other files in the folder. Chrome may ask you to renew folder
access later.

Chrome local extension storage is not a password vault. Someone with access to your unlocked
browser profile or device may be able to access stored API keys and local PageMind data.

## Data sent to AI providers

When you ask a question, PageMind sends the question, relevant conversation history, and selected
source excerpts to the chat provider you configured. When semantic indexing or search is used, it
sends content chunks or search text to the embedding provider you configured. Automatic content
indexing is disabled by default.

These providers process data under their own terms and privacy policies. PageMind does not receive
or retain a copy through a PageMind-operated server.

## Website and PDF access

PageMind reads the active page to provide its single purpose. PDF and AI-provider origins are
requested only when needed and are revalidated before network access. Local PDFs require Chrome's
“Allow access to file URLs” setting. Browser-protected pages cannot be read.

## Data sharing and sale

PageMind does not sell personal data, use it for advertising, or share it with a PageMind analytics
service. Data goes only to destinations necessary for user-requested functionality, such as the AI
provider selected by the user.

## Retention and deletion

Local retention is controlled by the configured age and item limits. Removing the extension asks
Chrome to remove its extension storage. Users can delete cached content or conversations separately
before removal.

## Changes and contact

Material policy changes will be recorded in the repository. A public support contact and hosted
policy URL must be supplied before Chrome Web Store submission.
