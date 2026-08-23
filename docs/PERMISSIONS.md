# PageMind permissions and security boundaries

PageMind reads the page selected by the user and keeps its working data on the current Chrome
profile. It does not request account access or cloud-sync permission.

## Chrome permissions

- `storage`: stores settings and API keys in extension-local storage. Conversations, extracted
  content, embeddings, and page memory use local IndexedDB.
- `activeTab`: permits user-initiated recovery injection into the current tab when an older tab has
  no PageMind content script after an install or update.
- `tabs`: reads the active tab URL/title, reacts to tab navigation, opens remembered pages, and
  navigates PDF citations to a page fragment.
- `sidePanel`: opens and configures PageMind's Chrome Side Panel.
- `scripting`: injects the packaged `content-script.js` into the active tab during the recovery case
  described above. It never downloads or executes a remote script.
- `offscreen`: runs the packaged pdf.js parser outside the service worker. The document is closed
  after 60 idle seconds.
- `contextMenus`: adds the user-invoked “Ask PageMind” action only when text is selected. The
  selected text stays in session storage until the matching Side Panel claims it.

The `ask-selection` keyboard command reads only the current selection after the user invokes the
shortcut. It uses `activeTab` and packaged code, and does not monitor keystrokes or page input.

The declarative content script matches ordinary web pages so the movable PageMind button and page
extraction are available. Chrome itself blocks protected pages such as `chrome://` and the Chrome
Web Store; PageMind reports those pages as inaccessible.

## Optional site access

- PDF access is requested for the exact HTTP(S) origin only after the user chooses to read that
  PDF. The background checks the permission again immediately before dispatching the fetch.
- Provider access is requested for the exact configured origin only when the user saves the chat
  or embedding provider. Every provider request checks that permission again.
- Remote providers must use HTTPS. Plain HTTP is accepted only for loopback providers such as
  `localhost` and `127.0.0.1`.
- Local `file:` PDFs are not fetched silently. Chrome's “Allow access to file URLs” setting is
  required, and unsupported access leaves the rest of PageMind usable.

## Executable code and links

The extension CSP permits scripts only from the packaged extension. PageMind contains no `eval`,
`new Function`, remote script tag, or remotely imported executable code. Provider responses are
treated as data. Markdown and remembered-page links are opened only when their final protocol is
HTTP or HTTPS; other schemes are rendered as non-clickable text.

## Permission denial

Declining a PDF or provider origin does not grant partial access and does not alter unrelated local
data. PageMind shows a localized permission/configuration error; keyword search and other supported
pages remain available.
