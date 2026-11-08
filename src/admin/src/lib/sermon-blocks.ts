/**
 * Sermon rich-body blocks (improvement B3, docs/05 §8, docs/09 §22–§27).
 *
 * The admin editor keeps the body as a small, closed set of blocks that is
 * serialized to `Sermon.content`. The public site normalizes the same shape
 * with `src/web/lib/page-content.ts`, so the editor can never introduce an
 * element the renderer does not understand. All helpers here are pure and
 * testable without a DOM.
 */
import type { PageContentValue, SermonContent } from '@shared/cms';

export type SermonBlockType =
  | 'heading'
  | 'paragraph'
  | 'list'
  | 'quote'
  | 'cta'
  | 'image';

export interface HeadingBlock {
  type: 'heading';
  level: 2 | 3;
  text: string;
}

export interface ParagraphBlock {
  type: 'paragraph';
  text: string;
}

export interface ListBlock {
  type: 'list';
  ordered: boolean;
  items: string[];
}

export interface QuoteBlock {
  type: 'quote';
  text: string;
  cite: string;
}

export interface CtaBlock {
  type: 'cta';
  label: string;
  href: string;
}

export interface ImageBlock {
  type: 'image';
  src: string;
  alt: string;
  caption: string;
}

export type SermonBlock =
  | HeadingBlock
  | ParagraphBlock
  | ListBlock
  | QuoteBlock
  | CtaBlock
  | ImageBlock;

export const SERMON_BLOCK_TYPES: ReadonlyArray<{
  value: SermonBlockType;
  label: string;
}> = [
  { value: 'paragraph', label: 'Párrafo' },
  { value: 'heading', label: 'Título de sección' },
  { value: 'list', label: 'Lista' },
  { value: 'quote', label: 'Cita' },
  { value: 'cta', label: 'Llamado a la acción' },
  { value: 'image', label: 'Imagen' },
];

const MAX_ITEMS = 50;

export function emptySermonBlock(type: SermonBlockType): SermonBlock {
  switch (type) {
    case 'heading':
      return { type: 'heading', level: 2, text: '' };
    case 'list':
      return { type: 'list', ordered: false, items: [''] };
    case 'quote':
      return { type: 'quote', text: '', cite: '' };
    case 'cta':
      return { type: 'cta', label: '', href: '' };
    case 'image':
      return { type: 'image', src: '', alt: '', caption: '' };
    case 'paragraph':
    default:
      return { type: 'paragraph', text: '' };
  }
}

function record(value: unknown): Record<string, unknown> | null {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

function text(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

/** Defensive conversion of stored JSON into editable blocks. */
export function contentToBlocks(
  content: SermonContent | null | undefined,
): SermonBlock[] {
  if (!content) return [];
  const raw = Array.isArray(content)
    ? content
    : Array.isArray((content as Record<string, unknown>).blocks)
      ? ((content as Record<string, unknown>).blocks as unknown[])
      : [];

  const blocks: SermonBlock[] = [];
  for (const entry of raw) {
    const block = record(entry);
    if (!block) continue;
    switch (block.type) {
      case 'heading':
        blocks.push({
          type: 'heading',
          level: block.level === 3 ? 3 : 2,
          text: text(block.text ?? block.title),
        });
        break;
      case 'paragraph':
      case 'text':
        blocks.push({
          type: 'paragraph',
          text: text(block.text ?? block.body ?? block.content),
        });
        break;
      case 'list':
        blocks.push({
          type: 'list',
          ordered: block.ordered === true,
          items: Array.isArray(block.items)
            ? block.items.map(text).slice(0, MAX_ITEMS)
            : [''],
        });
        break;
      case 'quote':
        blocks.push({
          type: 'quote',
          text: text(block.text),
          cite: text(block.cite),
        });
        break;
      case 'cta':
      case 'button':
        blocks.push({
          type: 'cta',
          label: text(block.label ?? block.text),
          href: text(block.href),
        });
        break;
      case 'image':
        blocks.push({
          type: 'image',
          src: text(block.src),
          alt: text(block.alt),
          caption: text(block.caption),
        });
        break;
      default:
        break;
    }
  }
  return blocks;
}

function clean(value: string): string {
  return value.trim();
}

/**
 * Serialize editable blocks into the stored array. Empty blocks are dropped so
 * an untouched editor saves `null` instead of a meaningless body.
 */
export function blocksToContent(
  blocks: readonly SermonBlock[],
): PageContentValue[] | null {
  const content: SermonBlock[] = [];

  for (const block of blocks) {
    switch (block.type) {
      case 'heading': {
        const value = clean(block.text);
        if (value) content.push({ type: 'heading', level: block.level, text: value });
        break;
      }
      case 'paragraph': {
        const value = clean(block.text);
        if (value) content.push({ type: 'paragraph', text: value });
        break;
      }
      case 'list': {
        const items = block.items.map(clean).filter(Boolean).slice(0, MAX_ITEMS);
        if (items.length > 0) {
          content.push({ type: 'list', ordered: block.ordered, items });
        }
        break;
      }
      case 'quote': {
        const value = clean(block.text);
        const cite = clean(block.cite);
        if (value) {
          content.push(
            cite
              ? { type: 'quote', text: value, cite }
              : { type: 'quote', text: value, cite: '' },
          );
        }
        break;
      }
      case 'cta': {
        const label = clean(block.label);
        const href = clean(block.href);
        if (label && href) content.push({ type: 'cta', label, href });
        break;
      }
      case 'image': {
        const src = clean(block.src);
        if (src) {
          content.push({
            type: 'image',
            src,
            alt: clean(block.alt),
            caption: clean(block.caption),
          });
        }
        break;
      }
      default:
        break;
    }
  }

  return content.length > 0
    ? (content as unknown as PageContentValue[])
    : null;
}

export type SermonBlockErrors = Record<string, string>;

const SLUG_LIKE_HREF = /^(?:\/(?!\/)|https?:\/\/|mailto:|tel:)/i;

/** Validate every block; errors are keyed by block index (`"0"`, `"2"`). */
export function validateSermonBlocks(
  blocks: readonly SermonBlock[],
): SermonBlockErrors {
  const errors: SermonBlockErrors = {};

  blocks.forEach((block, index) => {
    const key = String(index);
    switch (block.type) {
      case 'heading':
      case 'paragraph':
        if (!clean(block.text)) errors[key] = 'Escribí el texto de este bloque.';
        break;
      case 'list':
        if (block.items.every((item) => !clean(item))) {
          errors[key] = 'Agregá al menos un ítem.';
        }
        break;
      case 'quote':
        if (!clean(block.text)) errors[key] = 'Escribí la cita.';
        break;
      case 'cta':
        if (!clean(block.label)) {
          errors[key] = 'Escribí el texto del botón.';
        } else if (!SLUG_LIKE_HREF.test(clean(block.href))) {
          errors[key] = 'Usá una ruta interna (/) o una URL http(s), mailto o tel.';
        }
        break;
      case 'image':
        if (!SLUG_LIKE_HREF.test(clean(block.src)) || clean(block.src) === '') {
          errors[key] = 'Usá una ruta interna (/) o una URL http(s).';
        }
        break;
      default:
        break;
    }
  });

  return errors;
}

/** Move one block up/down; returns the same array for an out-of-range move. */
export function moveSermonBlock(
  blocks: readonly SermonBlock[],
  index: number,
  direction: -1 | 1,
): SermonBlock[] {
  const target = index + direction;
  if (index < 0 || index >= blocks.length || target < 0 || target >= blocks.length) {
    return [...blocks];
  }
  const next = [...blocks];
  const [block] = next.splice(index, 1);
  next.splice(target, 0, block!);
  return next;
}

/** Replace one block without mutating the source array. */
export function updateSermonBlock<T extends SermonBlock>(
  blocks: readonly SermonBlock[],
  index: number,
  next: T,
): SermonBlock[] {
  return blocks.map((block, position) => (position === index ? next : block));
}
