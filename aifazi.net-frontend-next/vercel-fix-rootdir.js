const fs = require('fs')
const path = require('path')

// Workaround for https://github.com/vercel/vercel/issues/15937
// Next.js 16 post-build validation drops intermediate path segments from a
// multi-segment Root Directory, so it looks for `.next` / `node_modules`
// under the repo root (`/vercel/path0`) instead of the project subfolder
// (`/vercel/path0/aifazi.net-frontend-next`). Create parent-level symlinks
// so the validator's wrong paths resolve to the real directories.

const appDir = __dirname
const parentDir = path.dirname(appDir)

if (!process.env.VERCEL || parentDir === appDir) {
  console.log('[vercel-fix-rootdir] not on Vercel or no parent dir, skipping')
  process.exit(0)
}

for (const name of ['node_modules', '.next']) {
  const src = path.join(appDir, name)
  const dst = path.join(parentDir, name)
  if (!fs.existsSync(src) || fs.existsSync(dst)) {
    continue
  }
  try {
    fs.symlinkSync(src, dst, 'dir')
    console.log(`[vercel-fix-rootdir] symlinked ${dst} -> ${src}`)
  } catch (err) {
    if (err.code === 'EEXIST') continue
    console.log(`[vercel-fix-rootdir] skip ${name}: ${err.code}`)
  }
}
