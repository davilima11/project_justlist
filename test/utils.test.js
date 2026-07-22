import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createId,
  escapeHtml,
  getContentType,
  getContentTypeLabel,
  isReadingContentType,
  normalizeImageUrl,
  normalizeSeriesName,
} from '../src/utils.js';

test('escapeHtml preserva valores numéricos e escapa marcação', () => {
  assert.equal(escapeHtml(0), '0');
  assert.equal(escapeHtml('<img src="x">'), '&lt;img src=&quot;x&quot;&gt;');
});

test('normaliza aliases e rótulos de conteúdo', () => {
  assert.equal(getContentType('filme'), 'movie');
  assert.equal(getContentType({ content_type: 'Mangá' }), 'manga');
  assert.equal(getContentTypeLabel('manhwa'), 'Manhwa');
  assert.equal(isReadingContentType('manhua'), true);
  assert.equal(isReadingContentType('series'), false);
});

test('normaliza nomes para comparação de duplicidade', () => {
  assert.equal(normalizeSeriesName('  Ação & Emoção!  '), 'acao emocao');
  assert.equal(normalizeSeriesName('DAN   DA DAN'), 'dan da dan');
});

test('preserva alfabetos não latinos na busca e na deduplicação', () => {
  assert.equal(normalizeSeriesName('사랑의 불시착'), '사랑의 불시착');
  assert.equal(normalizeSeriesName('庆余年 第二季'), '庆余年 第二季');
});

test('aceita apenas URLs HTTPS e data URLs de imagem', () => {
  assert.equal(normalizeImageUrl('javascript:alert(1)'), '');
  assert.equal(normalizeImageUrl('http://example.com/poster.jpg'), '');
  assert.equal(normalizeImageUrl('data:text/html;base64,PHNjcmlwdD4='), '');
  assert.equal(normalizeImageUrl('data:image/png;base64,AA=='), 'data:image/png;base64,AA==');
  assert.equal(normalizeImageUrl('https://example.com/poster.jpg'), 'https://example.com/poster.jpg');
  assert.equal(normalizeImageUrl('https://example.com/x" onerror="alert(1)'), 'https://example.com/x%22%20onerror=%22alert(1)');
});

test('gera identificadores não vazios', () => {
  assert.match(createId(), /^[a-z0-9-]+$/i);
});
