/**
 * lib/blocks/PageBlocks.tsx — renders a published layout's block tree.
 *
 * Server-safe (no hooks): fetch the layout in a server component and pass
 * `blocks` in. Unknown types render as nothing (forward-compat with future
 * blocks). Text renders as React text — no HTML sink anywhere.
 */
import { getBlockManifest } from './registry'
import type { PageBlock } from './types'

function RenderBlock({ block, depth = 0 }: { block: PageBlock; depth?: number }) {
  const manifest = getBlockManifest(block.type)
  if (!manifest) return null
  const Render = manifest.render
  return (
    <>
      <Render props={block.props} />
      {depth < 2 && Array.isArray(block.children) && block.children.length > 0 && (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: `repeat(auto-fit, minmax(220px, 1fr))`,
            gap: 16,
          }}
        >
          {block.children.map((child) => (
            <RenderBlock key={child.id} block={child} depth={depth + 1} />
          ))}
        </div>
      )}
    </>
  )
}

export default function PageBlocks({ blocks }: { blocks: PageBlock[] }) {
  if (!Array.isArray(blocks) || blocks.length === 0) return null
  return (
    <>
      {blocks.map((block) => (
        <RenderBlock key={block.id} block={block} />
      ))}
    </>
  )
}
