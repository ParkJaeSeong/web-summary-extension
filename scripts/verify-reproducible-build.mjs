import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import process from 'node:process'

const packagePath = 'packages/PageMind-0.1.0-chromium.zip'

function buildHash() {
  execFileSync('pnpm', ['build'], { stdio: 'inherit' })
  return createHash('sha256').update(readFileSync(packagePath)).digest('hex')
}

const firstHash = buildHash()
const secondHash = buildHash()

if (firstHash !== secondHash) {
  throw new Error(`Package is not reproducible: ${firstHash} != ${secondHash}`)
}

process.stdout.write(`Reproducible package SHA-256: ${firstHash}\n`)
