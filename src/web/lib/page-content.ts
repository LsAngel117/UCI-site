/**
 * Safe rendering of a CMS page's structured content (Phase 9B2, docs/05 §20).
 *
 * The API stores `Page.content` as an arbitrary JSON object. The public
 * website must never turn that object into raw HTML: an editor (or a
 * compromised account) could otherwise inject scripts. This module normalizes
 * the stored value into a small, closed set of display blocks and drops
 * anything it does not understand.
 *
 * Supported shapes (documented contract with the admin/editor): a bare array
 * of blocks (how the sermon rich body is stored) or an object with a `blocks`
 * array (how pages are stored).
 *
 * ```json
 * [
 *   { "type": "heading", "text": "Bienvenido", "level": 2 },
 *   { "type": "paragraph", "text": "..." }
 * ]
 * ```
 *
 * ```json
 * {
 *   "blocks": [
 *     { "type": "heading",   "text": "Bienvenido", "level": 2 },
 *     { "type": "paragraph", "text": "..." },
 *     { "type": "list",      "ordered": false, "items": ["...", "..."] },
 *     { "type": "quote",     "text": "...", "cite": "..." },
 *     { "type": "cta",       "label": "Conócenos", "href": "/nosotros" },
 *     { "type": "image",     "src": "/media/foto.jpg", "alt": "..." }
 *   ]
 * }
 * ```
 *
 * A `sections` array and a top-level `body`/`description`/`paragraphs`
 * fallback are also accepted for editorial convenience. Anything else —
 * notably an `html` key — is ignored. URLs are restricted to root-relative
 * paths and http(s)/mailto/tel so `javascript:` and `data:` never reach a
 * rendered attribute.
 */
import type { PageContent, PageContentValue } from '@shared/cms';

export type SafePageBlock =
  | { type: 'heading'; level: 2 | 3; text: string }
  | { type: 'paragraph'; text: string }
  | { type: 'list'; ordered: boolean; items: string[] }
  | { type: 'quote'; text: string; cite?: string }
  | { type: 'cta'; label: string; href: string; external: boolean }
  | { type: 'image'; src: string; alt: string; caption?: string };

/** Defensive upper bounds so a malicious payload cannot bloat the render. */
const MAX_BLOCKS = 100;
const MAX_TEXT_LENGTH = 20_000;
const MAX_LIST_ITEMS = 50;

function trimmedText(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const text = value.trim();
  if (text.length === 0) return undefined;
  return text.length > MAX_TEXT_LENGTH
    ? text.slice(0, MAX_TEXT_LENGTH)
    : text;
}

/** Root-relative (single slash) or an explicit safe protocol. */
export function isSafeLinkHref(value: unknown): value is string {
  const href = trimmedText(value);
  if (href === undefined) return false;
  if (href.startsWith('//')) return false;
  if (href.startsWith('/')) return true;
  return /^(https?:|mailto:|tel:)/i.test(href);
}

/** Same-origin/absolute http(s) image source only. */
function isSafeImageSrc(value: unknown): value is string {
  const src = trimmedText(value);
  if (src === undefined) return false;
  if (src.startsWith('//')) return false;
  if (src.startsWith('/')) return true;
  return /^https?:\/\//i.test(src);
}

function isExternalHref(href: string): boolean {
  return /^https?:\/\//i.test(href);
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

function normalizeHeading(value: Record<string, unknown>): SafePageBlock | null {
  const text = trimmedText(value.text) ?? trimmedText(value.title);
  if (text === undefined) return null;
  return {
    type: 'heading',
    level: value.level === 3 ? 3 : 2,
    text,
  };
}

function normalizeParagraph(
  value: Record<string, unknown>,
): SafePageBlock | null {
  const text =
    trimmedText(value.text) ??
    trimmedText(value.body) ??
    trimmedText(value.content);
  return text === undefined ? null : { type: 'paragraph', text };
}

function normalizeList(value: Record<string, unknown>): SafePageBlock | null {
  if (!Array.isArray(value.items)) return null;
  const items = value.items
    .map((item) => trimmedText(item))
    .filter((item): item is string => item !== undefined)
    .slice(0, MAX_LIST_ITEMS);
  if (items.length === 0) return null;
  return { type: 'list', ordered: value.ordered === true, items };
}

function normalizeQuote(value: Record<string, unknown>): SafePageBlock | null {
  const text = trimmedText(value.text);
  if (text === undefined) return null;
  const cite = trimmedText(value.cite);
  return cite === undefined
    ? { type: 'quote', text }
    : { type: 'quote', text, cite };
}

function normalizeCta(value: Record<string, unknown>): SafePageBlock | null {
  const label = trimmedText(value.label) ?? trimmedText(value.text);
  const href = value.href;
  if (label === undefined || !isSafeLinkHref(href)) return null;
  return {
    type: 'cta',
    label,
    href: href.trim(),
    external: isExternalHref(href.trim()),
  };
}

function normalizeImage(value: Record<string, unknown>): SafePageBlock | null {
  const src = value.src;
  if (!isSafeImageSrc(src)) return null;
  const alt = trimmedText(value.alt) ?? '';
  const caption = trimmedText(value.caption);
  return caption === undefined
    ? { type: 'image', src: src.trim(), alt }
    : { type: 'image', src: src.trim(), alt, caption };
}

/** Map one block object through the allowed type set. */
function normalizeBlock(value: unknown): SafePageBlock | null {
  const block = asRecord(value);
  if (!block) return null;

  switch (block.type) {
    case 'heading':
      return normalizeHeading(block);
    case 'paragraph':
    case 'text':
      return normalizeParagraph(block);
    case 'list':
      return normalizeList(block);
    case 'quote':
      return normalizeQuote(block);
    case 'cta':
    case 'button':
      return normalizeCta(block);
    case 'image':
      return normalizeImage(block);
    default:
      return null;
  }
}

function normalizeBlocks(value: unknown): SafePageBlock[] {
  if (!Array.isArray(value)) return [];
  return value
    .slice(0, MAX_BLOCKS)
    .map(normalizeBlock)
    .filter((block): block is SafePageBlock => block !== null);
}

/**
 * Map a `sections` entry into blocks. A section accepts a heading, one or more
 * paragraphs and a list, which covers the institutional pages described in
 * docs/05 §20 without becoming a page builder.
 */
function normalizeSections(value: unknown): SafePageBlock[] {
  if (!Array.isArray(value)) return [];
  const blocks: SafePageBlock[] = [];

  for (const raw of value.slice(0, MAX_BLOCKS)) {
    const section = asRecord(raw);
    if (!section) continue;

    const heading = trimmedText(section.heading) ?? trimmedText(section.title);
    if (heading !== undefined) {
      blocks.push({ type: 'heading', level: 2, text: heading });
    }

    const body =
      trimmedText(section.body) ??
      trimmedText(section.text) ??
      trimmedText(section.description);
    if (body !== undefined) blocks.push({ type: 'paragraph', text: body });

    if (Array.isArray(section.paragraphs)) {
      for (const paragraph of section.paragraphs.slice(0, MAX_BLOCKS)) {
        const text = trimmedText(paragraph);
        if (text !== undefined) blocks.push({ type: 'paragraph', text });
      }
    }

    const list = normalizeList(section);
    if (list) blocks.push(list);

    const cta = normalizeCta(section);
    if (cta) blocks.push(cta);

    if (blocks.length >= MAX_BLOCKS) break;
  }

  return blocks.slice(0, MAX_BLOCKS);
}

/**
 * Normalize CMS content into safe display blocks.
 *
 * Precedence: `blocks` → `sections` → top-level `paragraphs`/`body` text.
 * A `null`/empty/unrecognized object yields an empty array; the route then
 * renders an honest "no additional content" state instead of raw JSON.
 */
export function normalizePageContent(
  content: PageContent | PageContentValue[] | null | undefined,
): SafePageBlock[] {
  if (!content) return [];

  // A bare block array is the sermon rich-body shape (`Sermon.content`).
  if (Array.isArray(content)) return normalizeBlocks(content);

  const record = content as Record<string, unknown>;

  const fromBlocks = normalizeBlocks(record.blocks);
  if (fromBlocks.length > 0) return fromBlocks;

  const fromSections = normalizeSections(record.sections);
  if (fromSections.length > 0) return fromSections;

  // Minimal fallback for a plain institutional page: a single body string or
  // a paragraphs array. Raw HTML keys are deliberately not read.
  const fallback: SafePageBlock[] = [];
  if (Array.isArray(record.paragraphs)) {
    for (const paragraph of record.paragraphs.slice(0, MAX_BLOCKS)) {
      const text = trimmedText(paragraph);
      if (text !== undefined) fallback.push({ type: 'paragraph', text });
    }
  }
  const body =
    trimmedText(record.body) ??
    trimmedText(record.description) ??
    trimmedText(record.text);
  if (body !== undefined) fallback.push({ type: 'paragraph', text: body });

  return fallback.slice(0, MAX_BLOCKS);
}
