import archiver from 'archiver'
import esbuild from 'esbuild'
import postcssPlugin from 'esbuild-style-plugin'
import fs from 'fs-extra'
import process from 'node:process'

const outdir = 'build'
const packagesDir = 'packages'
const archiveDate = new Date('1980-01-01T00:00:00.000Z')

const isDev = process.env.NODE_ENV === 'dev'

let buildConfig = {
  entryPoints: [
    'src/content-script/index.tsx',
    'src/background/index.ts',
    'src/options/index.tsx',
    'src/sidepanel/index.tsx',
    'src/offscreen/index.ts',
  ],
  bundle: true,
  outdir: outdir,
  treeShaking: true,
  minify: true,
  drop: ['console', 'debugger'],
  legalComments: 'none',
  define: {
    'process.env.NODE_ENV': '"production"',
  },
  jsxFactory: 'h',
  jsxFragment: 'Fragment',
  jsx: 'automatic',
  loader: {
    '.png': 'dataurl',
    '.svg': 'dataurl',
  },
  plugins: [postcssPlugin()],
}

if (isDev) {
  buildConfig = { ...buildConfig, ...{ minify: false, drop: [] } }
}

async function deleteOldDir() {
  await fs.remove(outdir)
}

async function runEsbuild() {
  await esbuild.build(buildConfig)
}

async function listFiles(directory, prefix = '') {
  const entries = await fs.readdir(prefix ? `${directory}/${prefix}` : directory, {
    withFileTypes: true,
  })
  const files = []
  for (const entry of entries.sort((left, right) =>
    left.name < right.name ? -1 : left.name > right.name ? 1 : 0,
  )) {
    const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name
    if (entry.isDirectory()) files.push(...(await listFiles(directory, relativePath)))
    else files.push(relativePath)
  }
  return files
}

async function zipFolder(dir, outputPath) {
  const output = fs.createWriteStream(outputPath)
  const completed = new Promise((resolve, reject) => {
    output.on('close', resolve)
    output.on('error', reject)
  })
  const archive = archiver('zip', {
    zlib: { level: 9 },
  })
  archive.pipe(output)
  for (const relativePath of await listFiles(dir)) {
    archive.append(await fs.readFile(`${dir}/${relativePath}`), {
      name: relativePath,
      date: archiveDate,
      mode: 0o100644,
    })
  }
  await archive.finalize()
  await completed
}

async function copyFiles(entryPoints, targetDir) {
  await fs.ensureDir(targetDir)
  await Promise.all(
    entryPoints.map(async (entryPoint) => {
      await fs.copy(entryPoint.src, `${targetDir}/${entryPoint.dst}`)
    }),
  )
}

async function build() {
  await deleteOldDir()
  await runEsbuild()

  const commonFiles = [
    { src: 'build/content-script/index.js', dst: 'content-script.js' },
    { src: 'build/background/index.js', dst: 'background.js' },
    { src: 'build/options/index.js', dst: 'options.js' },
    { src: 'build/options/index.css', dst: 'options.css' },
    { src: 'src/options/index.html', dst: 'options.html' },
    { src: 'build/sidepanel/index.js', dst: 'sidepanel.js' },
    { src: 'build/sidepanel/index.css', dst: 'sidepanel.css' },
    { src: 'src/sidepanel/index.html', dst: 'sidepanel.html' },
    { src: 'build/offscreen/index.js', dst: 'offscreen.js' },
    { src: 'src/offscreen/index.html', dst: 'offscreen.html' },
    { src: 'node_modules/pdfjs-dist/build/pdf.worker.min.js', dst: 'pdf.worker.min.js' },
    { src: 'node_modules/pdfjs-dist/standard_fonts', dst: 'standard_fonts' },
    { src: 'node_modules/pdfjs-dist/cmaps', dst: 'cmaps' },
    { src: 'src/assets/img/logo-16.png', dst: 'logo-16.png' },
    { src: 'src/assets/img/logo-32.png', dst: 'logo-32.png' },
    { src: 'src/assets/img/logo-48.png', dst: 'logo-48.png' },
    { src: 'src/assets/img/logo-128.png', dst: 'logo-128.png' },
    { src: 'src/assets/img/logo.png', dst: 'logo.png' },
    { src: 'src/_locales', dst: '_locales' },
    { src: 'LICENSE', dst: 'LICENSE.txt' },
    { src: 'THIRD_PARTY_NOTICES.md', dst: 'THIRD_PARTY_NOTICES.md' },
    { src: 'node_modules/pdfjs-dist/LICENSE', dst: 'PDFJS-LICENSE.txt' },
  ]

  // chromium
  await copyFiles(
    [...commonFiles, { src: 'src/manifest.json', dst: 'manifest.json' }],
    `./${outdir}/chromium`,
  )

  const { version } = await fs.readJson('package.json')
  await fs.ensureDir(packagesDir)
  await zipFolder(`./${outdir}/chromium`, `./${packagesDir}/PageMind-${version}-chromium.zip`)

  console.log('Build success.')
}

build()
