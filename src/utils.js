const CONTENT_TYPE_ALIASES = new Map([
  ['series', 'series'],
  ['série', 'series'],
  ['serie', 'series'],
  ['movie', 'movie'],
  ['filme', 'movie'],
  ['anime', 'anime'],
]);

const CONTENT_TYPE_LABELS = {
  series: 'Série',
  movie: 'Filme',
  anime: 'Anime',
};
const SAFE_IMAGE_DATA_URL = /^data:image\/(?:png|jpe?g|webp|gif);base64,[a-z0-9+/=]+$/i;

export function escapeHtml(value) {
  if (value === null || value === undefined) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function getContentType(itemOrType) {
  const raw = typeof itemOrType === 'string'
    ? itemOrType
    : itemOrType?.content_type || itemOrType?.contentType || 'series';
  return CONTENT_TYPE_ALIASES.get(String(raw).toLocaleLowerCase('pt-BR')) || 'series';
}

export function getContentTypeLabel(itemOrType) {
  return CONTENT_TYPE_LABELS[getContentType(itemOrType)] || CONTENT_TYPE_LABELS.series;
}

export function isReadingContentType(itemOrType) {
  return false;
}

export function normalizeSeriesName(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .normalize('NFC')
    .toLocaleLowerCase('pt-BR')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

export function normalizeImageUrl(value) {
  const candidate = String(value || '').trim();
  if (!candidate) return '';
  if (SAFE_IMAGE_DATA_URL.test(candidate)) return candidate;

  try {
    const parsed = new URL(candidate);
    return parsed.protocol === 'https:' ? parsed.href : '';
  } catch {
    return '';
  }
}

export function createId() {
  if (typeof globalThis.crypto?.randomUUID === 'function') {
    return globalThis.crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}
