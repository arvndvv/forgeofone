import { build } from 'esbuild'
import { mkdtemp, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { execFileSync } from 'node:child_process'

const temp = await mkdtemp(join(tmpdir(), 'forge-world-tests-'))
try {
  for (const entry of ['world', 'local-ai-client']) {
    const result = await build({ entryPoints: [`tests/${entry}.test.ts`], bundle: true, platform: 'node', format: 'cjs', write: false, define: { 'import.meta.env.DEV': entry === 'local-ai-client' ? 'true' : 'false' } })
    const file = join(temp, `${entry}.cjs`)
    await writeFile(file, result.outputFiles[0].text)
    execFileSync(process.execPath, [file], { stdio: 'inherit' })
  }
  execFileSync(process.execPath, ['tests/local-ai.test.cjs'], { stdio: 'inherit' })
} finally { await rm(temp, { recursive: true, force: true }) }
