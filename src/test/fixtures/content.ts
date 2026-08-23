export const structuredWebpage = `
  <header><p>${'Navigation content '.repeat(4)}</p></header>
  <main>
    <h1>${'Primary article heading '.repeat(3)}</h1>
    <p>${'Important article paragraph '.repeat(4)}</p>
  </main>
  <footer><p>${'Footer content '.repeat(4)}</p></footer>
`

export const youtubeJson3 = JSON.stringify({
  events: [
    { tStartMs: 0, segs: [{ utf8: 'First caption.' }] },
    { tStartMs: 5000, segs: [{ utf8: ' Second caption.' }] },
    { tStartMs: 80000, segs: [{ utf8: 'Later caption.' }] },
  ],
})

export const youtubeXml = `
  <transcript>
    <text start="1.5">XML first caption.</text>
    <text start="80">XML later caption.</text>
  </transcript>
`
