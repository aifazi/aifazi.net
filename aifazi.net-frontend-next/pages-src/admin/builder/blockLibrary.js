/**
 * pages-src/admin/builder/blockLibrary.js — the Odoo-style block catalog.
 *
 * Each block type describes the editable fields the Page Builder shows and the
 * defaults a fresh instance starts with. The published page (BlockRenderer)
 * renders each block's fields — scalar text via EditableText, lists via
 * EditableList, images via EditableImage — so builder-made pages stay
 * inline-editable from the public site too.
 *
 * A saved page layout lives in the content block `layout.<slug>`:
 *   [ { "id": "b_x", "type": "heading", "text": "...", "align": "left" }, ... ]
 */
export const BLOCK_GROUPS = [
  { group: 'Text',   types: ['heading', 'paragraph', 'quote', 'divider', 'spacer'] },
  { group: 'Media',  types: ['hero', 'image'] },
  { group: 'Actions', types: ['cta'] },
  { group: 'Lists',  types: ['features', 'stats', 'faq', 'list'] },
  { group: 'Layout', types: ['row'] },
  { group: 'Advanced', types: ['html'] },
]

const ALIGN = [['left', 'Left'], ['center', 'Center'], ['right', 'Right']]

const scalarFields = {
  text:    { key: 'text', label: 'Text', type: 'textarea' },
  title:   { key: 'title', label: 'Title', type: 'text' },
  subtitle:{ key: 'subtitle', label: 'Subtitle', type: 'textarea' },
  align:   { key: 'align', label: 'Align', type: 'select', options: ALIGN },
}

export const BLOCKS = {
  heading: {
    name: 'Heading', icon: '🔠', desc: 'Section heading with level & alignment',
    fields: [scalarFields.text, { key: 'level', label: 'Level', type: 'select', options: [['h1', 'H1'], ['h2', 'H2'], ['h3', 'H3'], ['h4', 'H4']] }, scalarFields.align],
    defaults: { text: 'Your heading here', level: 'h2', align: 'left' },
  },
  paragraph: {
    name: 'Paragraph', icon: '📄', desc: 'Body text, multiline',
    fields: [scalarFields.text, scalarFields.align],
    defaults: { text: 'Write your paragraph here. It supports multiple lines and inline formatting.', align: 'left' },
  },
  quote: {
    name: 'Quote', icon: '💬', desc: 'Blockquote with attribution',
    fields: [{ key: 'text', label: 'Quote', type: 'textarea' }, { key: 'author', label: 'Author', type: 'text' }],
    defaults: { text: 'This is a highlighted quote.', author: '— Someone important' },
  },
  divider: {
    name: 'Divider', icon: '➖', desc: 'Horizontal rule',
    fields: [{ key: 'style', label: 'Style', type: 'select', options: [['solid', 'Solid'], ['dashed', 'Dashed'], ['gradient', 'Gradient']] }],
    defaults: { style: 'solid' },
  },
  spacer: {
    name: 'Spacer', icon: '📏', desc: 'Vertical breathing room',
    fields: [{ key: 'height', label: 'Height (px)', type: 'number' }],
    defaults: { height: 48 },
  },
  hero: {
    name: 'Hero', icon: '🚀', desc: 'Big title banner with CTA',
    fields: [scalarFields.title, scalarFields.subtitle, scalarFields.align, { key: 'ctaLabel', label: 'CTA label', type: 'text' }, { key: 'ctaHref', label: 'CTA link', type: 'text' }, { key: 'bg', label: 'Background', type: 'select', options: [['default', 'Default'], ['glow', 'Glow'], ['grid', 'Grid']] }],
    defaults: { title: 'Welcome to my page', subtitle: 'A short, punchy description goes here.', align: 'center', ctaLabel: 'Get Started', ctaHref: '#', bg: 'default' },
  },
  image: {
    name: 'Image', icon: '🖼️', desc: 'Image with alt text',
    fields: [{ key: 'src', label: 'Image URL', type: 'text' }, { key: 'alt', label: 'Alt text', type: 'text' }, { key: 'width', label: 'Max width (px)', type: 'number' }],
    defaults: { src: '', alt: '', width: 640 },
  },
  cta: {
    name: 'Call to action', icon: '🔘', desc: 'A button',
    fields: [{ key: 'label', label: 'Button label', type: 'text' }, { key: 'href', label: 'Link', type: 'text' }, { key: 'variant', label: 'Variant', type: 'select', options: [['primary', 'Primary'], ['outline', 'Outline']] }],
    defaults: { label: 'Learn more', href: '#', variant: 'primary' },
  },
  features: {
    name: 'Features grid', icon: '🧩', desc: 'Icon + title + description cards',
    fields: [scalarFields.title],
    listField: { key: 'items', label: 'Features', addLabel: '+ Add feature', itemFields: [{ key: 'icon', label: 'Icon (emoji)', type: 'emoji' }, { key: 'title', label: 'Title', type: 'text' }, { key: 'desc', label: 'Description', type: 'textarea' }] },
    defaults: { title: 'Features', items: [{ icon: '⚡', title: 'Fast', desc: 'First feature description.' }, { icon: '🔒', title: 'Secure', desc: 'Second feature description.' }] },
  },
  stats: {
    name: 'Stats', icon: '📊', desc: 'Value + label stat cards',
    fields: [scalarFields.title],
    listField: { key: 'items', label: 'Stats', addLabel: '+ Add stat', itemFields: [{ key: 'value', label: 'Value', type: 'text' }, { key: 'label', label: 'Label', type: 'text' }] },
    defaults: { title: 'By the numbers', items: [{ value: '100%', label: 'Uptime' }, { value: '24/7', label: 'Support' }] },
  },
  faq: {
    name: 'FAQ', icon: '❓', desc: 'Question / answer accordion',
    fields: [scalarFields.title],
    listField: { key: 'items', label: 'FAQ', addLabel: '+ Add question', itemFields: [{ key: 'q', label: 'Question', type: 'text' }, { key: 'a', label: 'Answer', type: 'textarea' }] },
    defaults: { title: 'FAQ', items: [{ q: 'First question?', a: 'The answer to the first question.' }] },
  },
  list: {
    name: 'Bullet list', icon: '📃', desc: 'Simple list of items',
    fields: [],
    listField: { key: 'items', label: 'Items', addLabel: '+ Add item', itemFields: [{ key: 'text', label: 'Text', type: 'text' }] },
    defaults: { items: [{ text: 'First item' }, { text: 'Second item' }] },
  },
  html: {
    name: 'HTML block', icon: '🖥️', desc: 'Raw HTML (sanitized on render)',
    fields: [{ key: 'html', label: 'HTML', type: 'textarea' }],
    defaults: { html: '<div style="padding:24px;border:1px dashed #666;text-align:center">Custom HTML goes here</div>' },
  },
  row: {
    name: 'Row (grid)', icon: '🗂️', desc: 'Multi-column grid container — drag blocks into its columns',
    isContainer: true,
    fields: [
      { key: 'columns', label: 'Columns', type: 'select', options: [['2', '2 columns'], ['3', '3 columns'], ['4', '4 columns']] },
      { key: 'gap', label: 'Gap (px)', type: 'number' },
    ],
    defaults: { columns: 2, gap: 16, children: [[], []] },
  },
}

export function newBlock(type, id) {
  const cfg = BLOCKS[type]
  return { id, type, ...JSON.parse(JSON.stringify(cfg.defaults)) }
}

export function blockTypeName(type) { return BLOCKS[type]?.name || type }