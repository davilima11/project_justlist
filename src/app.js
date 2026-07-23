import { createClient } from '@supabase/supabase-js';

import {
  createId,
  escapeHtml as escHtml,
  getContentType,
  getContentTypeLabel,
  isReadingContentType,
  normalizeImageUrl,
  normalizeSeriesName,
} from './utils.js';

// ── STATE ──
let series = [];
let filters = { contentType: [], type: [], genre: [], platform: [] };
let searchQuery = '';
let currentView = 'grid';
let editingId = null;
let currentPosterData = null;
let isLoading = true;
let isSaving = false;
let isDeleting = false;
let isSendingAuthLink = false;
let lastRandomSeriesId = null;
let randomDrawTimers = [];
let activeModalReturnFocus = null;
let catalogSearchController = null;
let catalogDetailController = null;
let formSessionId = 0;
let currentUser = null;
let isAuthReady = false;
let isRemoteDataWritable = false;
let authDataRequestId = 0;
let pendingDeleteId = null;

const STORAGE_KEY = 'justlist_series_v1';
const SNAPSHOT_KEY = 'justlist_series_snapshot_v1';
const mobileSidebarMedia = window.matchMedia('(max-width: 768px)');

// ── TMDB ──
const TMDB_API_KEY = '4718b9fc7b347afb98df27f0c9e18ee9';
const TMDB_BASE = 'https://api.themoviedb.org/3';
const TMDB_IMG_THUMB = 'https://image.tmdb.org/t/p/w185';
const TMDB_IMG_POSTER = 'https://image.tmdb.org/t/p/w500';
const TMDB_LANG = 'pt-BR';
const TMDB_CACHE_KEY = 'justlist_tmdb_cache_v1';
const ANILIST_API = 'https://graphql.anilist.co';
const READING_PLATFORMS = new Set(['NexusToons', 'MangásTop', 'LycanToons', 'ToonsLivre', 'MangaOnline', 'FlowerMangas', 'Outros']);

// Mapa de gêneros TMDB (TV) -> gêneros do JustList
const TMDB_GENRE_MAP = {
  // Gêneros compartilhados por filmes e séries
  28: ['Ação'],                          // Action
  12: ['Ação'],                          // Adventure
  16: ['Família'],                       // Animation
  35: ['Comédia'],
  80: ['Crime'],
  99: ['Outros'],                        // Documentary
  18: ['Drama'],
  10751: ['Família'],
  14: ['Fantasia'],
  36: ['Histórico'],
  27: ['Terror'],
  10402: ['Outros'],                     // Music
  9648: ['Detetive'],                    // Mystery
  10749: ['Romance'],
  878: ['Ficção científica'],
  53: ['Suspense'],
  10752: ['Militar'],                    // War
  37: ['Outros'],                        // Western

  // Gêneros específicos de TV
  10759: ['Ação'],                       // Action & Adventure
  10765: ['Fantasia', 'Ficção científica'],
  10766: ['Drama'],                      // Soap
  10768: ['Militar', 'Político'],        // War & Politics
};

const ANILIST_GENRE_MAP = {
  Action: 'Ação', Adventure: 'Aventura', Comedy: 'Comédia', Drama: 'Drama',
  Fantasy: 'Fantasia', Horror: 'Terror', Mystery: 'Mistério', Psychological: 'Psicológico',
  Romance: 'Romance', 'Sci-Fi': 'Ficção científica', 'Slice of Life': 'Vida',
  Sports: 'Esportes', Supernatural: 'Sobrenatural', Thriller: 'Suspense'
};

let tmdbCache = {};
try { tmdbCache = JSON.parse(localStorage.getItem(TMDB_CACHE_KEY) || '{}'); } catch(e) { tmdbCache = {}; }
function saveTmdbCache() {
  try {
    localStorage.setItem(TMDB_CACHE_KEY, JSON.stringify(tmdbCache));
  } catch (error) {
    console.warn('Não foi possível salvar o cache local do TMDB:', error);
  }
}

// Bandeiras por país (badge de tipo)
const COUNTRY_FLAG = {
  'Coreia': '🇰🇷',
  'China': '🇨🇳',
  'Turquia': '🇹🇷',
  'Japão': '🇯🇵',
  'Tailândia': '🇹🇭',
  'Outros': '🌍'
};

function normalizeReadingStatus(status) {
  return ['quero_ler', 'lendo', 'concluido'].includes(status) ? status : 'quero_ler';
}

function getReadingStatusLabel(status) {
  return ({ quero_ler: 'Quero ler', lendo: 'Lendo', concluido: 'Concluído' })[normalizeReadingStatus(status)] || '';
}

function getPublicationStatusLabel(status) {
  return ({ FINISHED: 'Concluído', RELEASING: 'Em publicação', NOT_YET_RELEASED: 'Ainda não lançado', CANCELLED: 'Cancelado', HIATUS: 'Em hiato' })[status] || status || '';
}

// Retorna o ano lendo do registro ou do cache TMDB.
function getSeriesYear(s) {
  if (s && s.year) return String(s.year).slice(0, 4);
  if (s && s.first_air_date) return String(s.first_air_date).slice(0, 4);
  if (s && s.release_date) return String(s.release_date).slice(0, 4);
  const cached = s && s.id ? tmdbCache[s.id] : null;
  if (cached && cached.year) return String(cached.year).slice(0, 4);
  return '';
}

let pendingTmdb = null; // {tmdb_id, year, content_type} para anexar ao salvar
let pendingAniList = null; // metadados importados para uma leitura
let aniListResultsById = new Map();
let tmdbSearchTimer = null;
let tmdbLastQuery = '';
let searchRenderTimer = null;

function mapTmdbCountry(originCountries) {
  if (!Array.isArray(originCountries) || originCountries.length === 0) return '';
  if (originCountries.includes('KR')) return 'Coreia';
  if (originCountries.includes('CN') || originCountries.includes('TW') || originCountries.includes('HK')) return 'China';
  if (originCountries.includes('TR')) return 'Turquia';
  if (originCountries.includes('JP')) return 'Japão';
  if (originCountries.includes('TH')) return 'Tailândia';
  return 'Outros';
}

function mapTmdbGenres(genres) {
  if (!Array.isArray(genres)) return [];
  const mapped = new Set();
  genres.forEach(g => {
    const id = typeof g === 'object' ? g.id : g;
    const names = TMDB_GENRE_MAP[id];
    if (!names) return;
    (Array.isArray(names) ? names : [names]).forEach(name => mapped.add(name));
  });
  return Array.from(mapped);
}

// Normaliza os nomes usados pelo TMDB para os nomes exibidos no JustList.
// Serviços ainda não conhecidos são mantidos com o nome retornado pelo TMDB.
function mapTmdbProviderName(providerName) {
  const original = String(providerName || '').trim();
  const name = original.toLocaleLowerCase('pt-BR');
  if (!name) return '';

  if (name.includes('netflix')) return 'Netflix';
  if (name.includes('amazon prime video') || name === 'prime video') return 'Prime Video';
  if (name.includes('disney plus') || name === 'disney+') return 'Disney+';
  if (name.includes('apple tv plus') || name === 'apple tv+') return 'Apple TV+';
  if (name.includes('rakuten viki') || name === 'viki') return 'Viki';
  if (name.includes('iqiyi')) return 'iQIYI';
  if (name.includes('wetv')) return 'WeTV';
  if (name === 'max' || name.includes('hbo max')) return 'Max';
  if (name.includes('globoplay')) return 'Globoplay';
  if (name.includes('paramount')) return 'Paramount+';
  if (name.includes('crunchyroll')) return 'Crunchyroll';
  if (name.includes('pluto tv')) return 'Pluto TV';
  if (name === 'mubi' || name.includes('mubi')) return 'MUBI';
  if (name.includes('claro')) return 'Claro tv+';
  if (name.includes('looke')) return 'Looke';

  return original;
}

function ensureGenreOption(genre) {
  const value = String(genre || '').trim();
  if (!value) return;

  const formContainer = document.getElementById('genreChips');
  if (formContainer && !Array.from(formContainer.querySelectorAll('.genre-chip')).some(chip => chip.dataset.value === value)) {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'genre-chip';
    chip.dataset.value = value;
    chip.setAttribute('aria-pressed', 'false');
    chip.textContent = value;
    formContainer.appendChild(chip);
  }

  const filterContainer = document.getElementById('filterGenre');
  if (filterContainer && !Array.from(filterContainer.querySelectorAll('.chip')).some(chip => chip.dataset.value === value)) {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'chip';
    chip.dataset.filter = 'genre';
    chip.dataset.value = value;
    chip.setAttribute('aria-pressed', 'false');
    chip.textContent = value;
    filterContainer.appendChild(chip);
  }
}

function ensurePlatformOption(platform) {
  const value = String(platform || '').trim();
  if (!value) return;

  const formContainer = document.getElementById('platformChips');
  if (formContainer && !Array.from(formContainer.querySelectorAll('.platform-chip')).some(chip => chip.dataset.value === value)) {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'platform-chip';
    chip.dataset.mediaKind = READING_PLATFORMS.has(value) ? 'reading' : 'both';
    chip.dataset.value = value;
    chip.setAttribute('aria-pressed', 'false');
    chip.textContent = value;
    formContainer.appendChild(chip);
  }

  const filterContainer = document.getElementById('filterPlatform');
  if (filterContainer && !Array.from(filterContainer.querySelectorAll('.chip')).some(chip => chip.dataset.value === value)) {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'chip';
    chip.dataset.filter = 'platform';
    chip.dataset.value = value;
    chip.setAttribute('aria-pressed', 'false');
    chip.textContent = value;
    filterContainer.appendChild(chip);
  }
}

function syncPlatformOptionsFromSavedItems() {
  series.forEach(item => {
    getSeriesPlatforms(item).forEach(ensurePlatformOption);
    const genres = Array.isArray(item.genres) ? item.genres : [];
    genres.forEach(ensureGenreOption);
  });
}

function setTmdbPlatformStatus(message = '', state = 'info') {
  const status = document.getElementById('tmdbPlatformStatus');
  if (!status) return;
  status.textContent = message;
  status.style.display = message ? 'block' : 'none';
  status.style.color = state === 'success'
    ? '#4ade80'
    : state === 'error'
      ? '#f87171'
      : 'var(--text-dim)';
}

async function fetchTmdbWatchPlatforms(tmdbId, contentType, signal) {
  const endpoint = contentType === 'movie' ? 'movie' : 'tv';
  const response = await fetch(
    `${TMDB_BASE}/${endpoint}/${tmdbId}/watch/providers?api_key=${TMDB_API_KEY}`,
    { signal },
  );
  if (!response.ok) throw new Error('TMDB watch providers failed');

  const data = await response.json();
  const brazil = data.results && data.results.BR;
  if (!brazil) return [];

  // Não inclui aluguel e compra: apenas assinatura, gratuito e com anúncios.
  const providers = [
    ...(brazil.flatrate || []),
    ...(brazil.free || []),
    ...(brazil.ads || [])
  ];

  return [...new Set(
    providers
      .map(provider => mapTmdbProviderName(provider.provider_name))
      .filter(Boolean)
  )];
}

function applyTmdbPlatforms(platforms) {
  if (!Array.isArray(platforms) || platforms.length === 0) return;
  platforms.forEach(ensurePlatformOption);
  document.querySelectorAll('.platform-chip').forEach(chip => {
    const selected = platforms.includes(chip.dataset.value);
    chip.classList.toggle('selected', selected);
    chip.setAttribute('aria-pressed', String(selected));
  });
}

// A coluna "platform" continua sendo texto no Supabase.
// Para aceitar várias plataformas sem alterar o banco, novas séries são salvas como JSON.
// Registros antigos com uma única plataforma também continuam compatíveis.
function getSeriesPlatforms(item) {
  if (!item) return [];

  const normalizePlatforms = values => {
    const cleaned = values.map(String).map(value => value.trim()).filter(Boolean);
    const normalized = isReadingContentType(item)
      ? cleaned.map(value => READING_PLATFORMS.has(value) ? value : 'Outros')
      : cleaned;
    return [...new Set(normalized)];
  };

  if (Array.isArray(item.platforms)) {
    return normalizePlatforms(item.platforms);
  }

  if (Array.isArray(item.platform)) {
    return normalizePlatforms(item.platform);
  }

  const raw = typeof item.platform === 'string' ? item.platform.trim() : '';
  if (!raw) return [];

  if (raw.startsWith('[')) {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return normalizePlatforms(parsed);
      }
    } catch (error) {
      console.warn('Não foi possível interpretar as plataformas salvas:', error);
    }
  }

  // Também reconhece listas antigas digitadas com vírgula, ponto e vírgula ou ||.
  return normalizePlatforms(raw.split(/\s*(?:\|\||,|;)\s*/));
}

function serializePlatforms(platforms) {
  return JSON.stringify([...new Set(platforms.map(String).map(value => value.trim()).filter(Boolean))]);
}

function normalizeSeriesItem(item) {
  if (!item || typeof item !== 'object') return null;

  const name = String(item.name || '').trim().slice(0, 160);
  if (!name) return null;

  const contentType = getContentType(item);
  const allowedOrigins = new Set(['Coreia', 'China', 'Turquia', 'Japão', 'Tailândia', 'Outros']);
  const genres = (Array.isArray(item.genres) ? item.genres : (item.genre ? [item.genre] : []))
    .map(value => String(value).trim().slice(0, 60))
    .filter(Boolean)
    .slice(0, 20);
  const platforms = getSeriesPlatforms(item)
    .map(value => String(value).trim().slice(0, 80))
    .filter(Boolean)
    .slice(0, 20);
  const toNonNegativeNumber = value => {
    if (value === '' || value === null || value === undefined) return null;
    const number = Number(value);
    return Number.isFinite(number) && number >= 0 ? number : null;
  };
  const year = Number.parseInt(item.year, 10);

  const normalized = {
    ...item,
    id: item.id ?? createId(),
    name,
    content_type: contentType,
    type: contentType === 'movie' ? 'Outros' : (allowedOrigins.has(item.type) ? item.type : 'Outros'),
    genres: [...new Set(genres)],
    platform: serializePlatforms(platforms),
    synopsis: String(item.synopsis || '').trim().slice(0, 4000),
    poster: normalizeImageUrl(item.poster),
    year: Number.isFinite(year) && year >= 1870 && year <= 2200 ? year : null,
    author: isReadingContentType(contentType) && item.author ? String(item.author).trim().slice(0, 160) : null,
    chapters: isReadingContentType(contentType) ? toNonNegativeNumber(item.chapters) : null,
    current_chapter: isReadingContentType(contentType) ? toNonNegativeNumber(item.current_chapter) : null,
    reading_status: isReadingContentType(contentType) ? normalizeReadingStatus(item.reading_status) : null,
    publication_status: isReadingContentType(contentType) && item.publication_status
      ? String(item.publication_status).slice(0, 40)
      : null,
  };

  delete normalized.contentType;
  delete normalized.genre;
  delete normalized.platforms;
  return normalized;
}

function readLocalSeries(...keys) {
  for (const key of keys) {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) continue;
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) continue;
      return parsed.map(normalizeSeriesItem).filter(Boolean);
    } catch (error) {
      console.warn(`Não foi possível ler ${key}:`, error);
    }
  }
  return [];
}

function writeLocalSeries(key, items) {
  localStorage.setItem(key, JSON.stringify(items));
}

function saveRemoteSnapshot(items) {
  if (!currentUser?.id) return;
  try {
    writeLocalSeries(`${SNAPSHOT_KEY}:${currentUser.id}`, items);
  } catch (error) {
    console.warn('Não foi possível salvar uma cópia offline da lista:', error);
  }
}

function getFormContentType() {
  const select = document.getElementById('inputContentType');
  const value = select && select.value;
  return ['movie', 'anime', 'manga', 'manhwa', 'manhua'].includes(value) ? value : 'series';
}

function updateContentTypeFormUI(contentType, editing = false) {
  const normalized = getContentType({ content_type: contentType });
  const isMovie = normalized === 'movie';
  const isAnime = normalized === 'anime';
  const isReading = isReadingContentType(normalized);
  const select = document.getElementById('inputContentType');
  const originGroup = document.getElementById('originFormGroup');
  const originSelect = document.getElementById('inputType');
  const readingFields = document.getElementById('readingFields');
  if (select) select.value = normalized;

  if (originGroup) originGroup.style.display = isMovie ? 'none' : '';
  if (originSelect) {
    originSelect.required = !isMovie;
    originSelect.setAttribute('aria-required', String(!isMovie));
  }
  if (readingFields) {
    readingFields.style.display = isReading ? '' : 'none';
    readingFields.querySelectorAll('input, select, textarea').forEach(field => {
      field.disabled = !isReading;
    });
  }
  if (isMovie && originSelect) originSelect.value = 'Outros';
  if (isAnime && originSelect && !originSelect.value) originSelect.value = 'Japão';
  if (isReading && originSelect && (!editing || !originSelect.value)) {
    originSelect.value = normalized === 'manhwa' ? 'Coreia' : (normalized === 'manhua' ? 'China' : 'Japão');
  }

  const typeLabel = getContentTypeLabel(normalized).toLowerCase();
  document.getElementById('formModalTitle').textContent = `${editing ? 'Editar' : 'Adicionar'} ${typeLabel}`;
  document.getElementById('inputNameLabel').textContent = isMovie ? 'Nome do filme' : (isAnime ? 'Nome do anime' : (isReading ? `Nome do ${typeLabel}` : 'Nome da série'));
  document.getElementById('inputName').placeholder = isMovie ? 'Ex: Parasita' : (isAnime ? 'Ex: Attack on Titan' : (isReading ? 'Ex: Solo Leveling, Berserk, Omniscient Reader...' : 'Ex: Alchemy of Souls'));
  document.getElementById('inputSynopsis').placeholder = `Escreva uma breve descrição do ${typeLabel}...`;
  document.getElementById('tmdbSearchLabelText').textContent = isReading
    ? 'Buscar no AniList · preencher automaticamente'
    : (isMovie ? 'Buscar filme no TMDB · preencher automaticamente' : (isAnime ? 'Buscar anime no TMDB · preencher automaticamente' : 'Buscar série no TMDB · preencher automaticamente'));
  document.getElementById('tmdbSearchInput').placeholder = isReading
    ? 'Ex: Solo Leveling, Berserk, Tower of God...'
    : (isMovie ? 'Ex: Parasita, Duna, Interestelar...' : (isAnime ? 'Ex: Naruto, One Piece, Jujutsu Kaisen...' : 'Ex: Goblin, Crash Landing on You...'));

  const platformLabel = document.getElementById('platformFieldLabel');
  const platformMark = document.getElementById('platformRequiredMark');
  const platformHint = document.getElementById('platformFieldHint');
  if (platformLabel) platformLabel.textContent = isReading ? 'Onde você lê' : 'Plataformas';
  if (platformMark) platformMark.style.display = isReading ? 'none' : '';
  if (platformHint) platformHint.textContent = isReading
    ? 'Campo opcional. Selecione o site ou aplicativo onde você lê.'
    : 'Selecione uma ou mais plataformas. Ao importar do TMDB, a disponibilidade no Brasil será marcada automaticamente.';
  setTmdbPlatformStatus('');

  document.querySelectorAll('.platform-chip').forEach(chip => {
    const mediaKind = chip.dataset.mediaKind || 'screen';
    const visible = mediaKind === 'both' || (isReading ? mediaKind === 'reading' : mediaKind === 'screen');
    chip.style.display = visible ? '' : 'none';
    if (!visible) {
      chip.classList.remove('selected');
      chip.setAttribute('aria-pressed', 'false');
    }
  });
}
async function tmdbSearch(query) {
  const resultsBox = document.getElementById('tmdbResults');
  const spinner = document.getElementById('tmdbSearchSpinner');
  if (!query || query.trim().length < 2) {
    resultsBox.classList.remove('visible');
    return;
  }

  const contentType = getFormContentType();
  const endpoint = contentType === 'movie' ? 'movie' : 'tv';
  catalogSearchController?.abort();
  const controller = new AbortController();
  catalogSearchController = controller;
  tmdbLastQuery = `${contentType}:${query}`;
  const requestKey = tmdbLastQuery;
  spinner.classList.add('visible');
  resultsBox.setAttribute('aria-busy', 'true');

  const skelRow = `<div class="tmdb-skel-row">
    <div class="tmdb-skel-poster skeleton"></div>
    <div class="tmdb-skel-info">
      <div class="skel-line skeleton" style="width:70%"></div>
      <div class="skel-line skeleton" style="width:40%"></div>
    </div>
  </div>`;
  resultsBox.innerHTML = skelRow.repeat(3);
  resultsBox.classList.add('visible');

  try {
    const url = `${TMDB_BASE}/search/${endpoint}?api_key=${TMDB_API_KEY}&language=${TMDB_LANG}&query=${encodeURIComponent(query)}&page=1&include_adult=false`;
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) throw new Error('TMDB request failed: ' + res.status);
    const data = await res.json();
    if (requestKey !== tmdbLastQuery) return;
    renderTmdbResults(data.results || [], false, contentType);
  } catch (e) {
    if (e.name === 'AbortError' || requestKey !== tmdbLastQuery) return;
    console.error(e);
    renderTmdbResults(null, true, contentType);
  } finally {
    if (requestKey === tmdbLastQuery) {
      spinner.classList.remove('visible');
      resultsBox.setAttribute('aria-busy', 'false');
      if (catalogSearchController === controller) catalogSearchController = null;
    }
  }
}

function renderTmdbResults(results, hasError, contentType = getFormContentType()) {
  const box = document.getElementById('tmdbResults');
  if (hasError) {
    box.innerHTML = `<div class="tmdb-empty">Erro ao buscar no TMDB. Verifique sua conexão.</div>`;
    box.classList.add('visible');
    return;
  }
  if (!results || !results.length) {
    box.innerHTML = `<div class="tmdb-empty">Nenhum resultado encontrado.</div>`;
    box.classList.add('visible');
    return;
  }

  const isMovie = contentType === 'movie';
  const isAnime = contentType === 'anime';
  const typeLabel = isMovie ? 'Filme' : (isAnime ? 'Anime' : 'Série');
  const placeholder = `<div class="tmdb-result-poster-placeholder">
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="m21 15-5-5L5 21"/></svg>
  </div>`;

  box.innerHTML = results.slice(0, 8).map(r => {
    const resultId = Number.parseInt(r.id, 10);
    if (!Number.isFinite(resultId)) return '';
    const name = isMovie ? (r.title || r.original_title || '') : (r.name || r.original_name || '');
    const originalName = isMovie ? r.original_title : r.original_name;
    const date = isMovie ? r.release_date : r.first_air_date;
    const year = date ? date.slice(0, 4) : '—';
    const country = !isMovie && Array.isArray(r.origin_country) && r.origin_country.length
      ? ` · ${r.origin_country.join(', ')}`
      : '';
    const original = originalName && originalName !== name ? ` · ${escHtml(originalName)}` : '';
    const posterUrl = normalizeImageUrl(r.poster_path ? `${TMDB_IMG_THUMB}${r.poster_path}` : '');
    const posterHtml = r.poster_path
      ? `<img class="tmdb-result-poster" src="${escHtml(posterUrl)}" alt="" loading="lazy" decoding="async" />`
      : placeholder;
    return `<button type="button" class="tmdb-result" data-tmdb-id="${resultId}" data-content-type="${escHtml(contentType)}">
      ${posterHtml}
      <div class="tmdb-result-info">
        <div class="tmdb-result-name">${escHtml(name)}</div>
        <div class="tmdb-result-meta">${escHtml(year)} · ${escHtml(typeLabel)}${escHtml(country)}${original}</div>
      </div>
    </button>`;
  }).join('');
  box.classList.add('visible');
}

function invalidateCatalogRequests() {
  clearTimeout(tmdbSearchTimer);
  tmdbSearchTimer = null;
  catalogSearchController?.abort();
  catalogDetailController?.abort();
  catalogSearchController = null;
  catalogDetailController = null;
  tmdbLastQuery = '';
  formSessionId += 1;

  const results = document.getElementById('tmdbResults');
  const spinner = document.getElementById('tmdbSearchSpinner');
  if (results) {
    results.classList.remove('visible');
    results.setAttribute('aria-busy', 'false');
  }
  spinner?.classList.remove('visible');
}

async function selectTmdbResult(tmdbId, contentType = getFormContentType()) {
  const box = document.getElementById('tmdbResults');
  const spinner = document.getElementById('tmdbSearchSpinner');
  const normalizedType = contentType === 'movie' ? 'movie' : (contentType === 'anime' ? 'anime' : 'series');
  const endpoint = normalizedType === 'movie' ? 'movie' : 'tv';
  catalogDetailController?.abort();
  const controller = new AbortController();
  catalogDetailController = controller;
  const requestSessionId = formSessionId;
  spinner.classList.add('visible');

  try {
    const urlPt = `${TMDB_BASE}/${endpoint}/${tmdbId}?api_key=${TMDB_API_KEY}&language=${TMDB_LANG}`;
    setTmdbPlatformStatus('Buscando plataformas disponíveis no Brasil…');

    const [detailsResult, providersResult] = await Promise.allSettled([
      fetch(urlPt, { signal: controller.signal }).then(response => {
        if (!response.ok) throw new Error('TMDB details failed');
        return response.json();
      }),
      fetchTmdbWatchPlatforms(tmdbId, normalizedType, controller.signal)
    ]);

    if (controller.signal.aborted || requestSessionId !== formSessionId || !document.getElementById('formModal').classList.contains('open')) return;
    if (detailsResult.status !== 'fulfilled') throw detailsResult.reason;
    const d = detailsResult.value;

    updateContentTypeFormUI(normalizedType, Boolean(editingId));
    document.getElementById('inputName').value = normalizedType === 'movie' ? (d.title || '') : (d.name || '');

    // A origem é preenchida para séries e animes. Filmes não exibem nem exigem esse campo.
    if (normalizedType === 'series' || normalizedType === 'anime') {
      const countryCodes = d.origin_country || [];
      const typeMapped = mapTmdbCountry(countryCodes);
      if (typeMapped) {
        const typeSelect = document.getElementById('inputType');
        typeSelect.value = Array.from(typeSelect.options).some(option => option.value === typeMapped)
          ? typeMapped
          : 'Outros';
      }
    }

    document.getElementById('inputSynopsis').value = d.overview || '';

    const mappedGenres = mapTmdbGenres(d.genres || []);
    document.querySelectorAll('.genre-chip').forEach(chip => {
      const selected = mappedGenres.includes(chip.dataset.value);
      chip.classList.toggle('selected', selected);
      chip.setAttribute('aria-pressed', String(selected));
    });

    if (d.poster_path) {
      const poster = normalizeImageUrl(`${TMDB_IMG_POSTER}${d.poster_path}`);
      currentPosterData = poster;
      showPosterPreview(poster);
    }

    const date = normalizedType === 'movie' ? d.release_date : d.first_air_date;
    const importedYear = Number.parseInt((date || '').slice(0, 4), 10);
    pendingTmdb = {
      tmdb_id: d.id,
      year: Number.isInteger(importedYear) ? importedYear : null,
      content_type: normalizedType
    };

    let importedPlatforms = [];
    if (providersResult.status === 'fulfilled') {
      importedPlatforms = providersResult.value;
      if (importedPlatforms.length > 0) {
        applyTmdbPlatforms(importedPlatforms);
        setTmdbPlatformStatus(
          `${importedPlatforms.length} ${importedPlatforms.length === 1 ? 'plataforma encontrada' : 'plataformas encontradas'} no Brasil: ${importedPlatforms.join(', ')}.`,
          'success'
        );
      } else {
        setTmdbPlatformStatus('O TMDB não informou plataformas por assinatura ou gratuitas para o Brasil. Você ainda pode selecionar manualmente.');
      }
    } else {
      console.warn('Não foi possível consultar as plataformas no TMDB:', providersResult.reason);
      setTmdbPlatformStatus('Não foi possível consultar as plataformas agora. Você ainda pode selecionar manualmente.', 'error');
    }

    document.getElementById('tmdbSearchInput').value = '';
    box.classList.remove('visible');
    showToast(
      importedPlatforms.length
        ? `Dados e plataformas importados do TMDB.`
        : `Dados do ${normalizedType === 'movie' ? 'filme' : (normalizedType === 'anime' ? 'anime' : 'série')} importados do TMDB.`,
      'success'
    );
  } catch (e) {
    if (e?.name === 'AbortError' || controller.signal.aborted || requestSessionId !== formSessionId) return;
    console.error(e);
    showToast('Erro ao importar do TMDB.', 'error');
  } finally {
    if (catalogDetailController === controller) {
      catalogDetailController = null;
      spinner.classList.remove('visible');
    }
  }
}


function mapAniListContentType(countryCode) {
  if (countryCode === 'KR') return 'manhwa';
  if (['CN', 'TW', 'HK'].includes(countryCode)) return 'manhua';
  return 'manga';
}

function mapAniListCountry(countryCode) {
  if (countryCode === 'KR') return 'Coreia';
  if (['CN', 'TW', 'HK'].includes(countryCode)) return 'China';
  if (countryCode === 'JP') return 'Japão';
  return 'Outros';
}

function mapAniListGenres(genres) {
  return [...new Set((genres || []).map(genre => ANILIST_GENRE_MAP[genre] || genre).filter(Boolean))];
}

function cleanAniListDescription(value) {
  return String(value || '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(/~!|!~/g, '')
    .replace(/__|\*\*/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function getAniListAuthors(item) {
  const edges = item && item.staff && Array.isArray(item.staff.edges) ? item.staff.edges : [];
  return [...new Set(edges
    .filter(edge => /story|art/i.test(edge.role || ''))
    .map(edge => edge.node && edge.node.name && edge.node.name.full)
    .filter(Boolean))].slice(0, 4).join(', ');
}

async function anilistSearch(query) {
  const resultsBox = document.getElementById('tmdbResults');
  const spinner = document.getElementById('tmdbSearchSpinner');
  if (!query || query.trim().length < 2) {
    resultsBox.classList.remove('visible');
    return;
  }

  catalogSearchController?.abort();
  const controller = new AbortController();
  catalogSearchController = controller;
  tmdbLastQuery = `anilist:${query}`;
  const requestKey = tmdbLastQuery;
  spinner.classList.add('visible');
  resultsBox.setAttribute('aria-busy', 'true');
  resultsBox.innerHTML = Array(4).fill(`<div class="tmdb-skel-row"><div class="tmdb-skel-poster skeleton"></div><div class="tmdb-skel-info"><div class="skel-line skeleton w-80"></div><div class="skel-line skeleton w-50"></div></div></div>`).join('');
  resultsBox.classList.add('visible');

  const graphQuery = `
    query ($search: String!) {
      Page(page: 1, perPage: 12) {
        media(search: $search, type: MANGA, sort: SEARCH_MATCH, isAdult: false) {
          id
          title { romaji english native userPreferred }
          description(asHtml: false)
          coverImage { large extraLarge }
          genres
          status
          chapters
          startDate { year }
          countryOfOrigin
          staff(perPage: 12) {
            edges { role node { name { full } } }
          }
        }
      }
    }`;

  try {
    const response = await fetch(ANILIST_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ query: graphQuery, variables: { search: query.trim() } }),
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`AniList request failed: ${response.status}`);
    const payload = await response.json();
    if (payload.errors && payload.errors.length) throw new Error(payload.errors[0].message || 'AniList GraphQL error');
    if (requestKey !== tmdbLastQuery) return;
    renderAniListResults((payload.data && payload.data.Page && payload.data.Page.media) || []);
  } catch (error) {
    if (error.name === 'AbortError' || requestKey !== tmdbLastQuery) return;
    console.error(error);
    resultsBox.innerHTML = `<div class="tmdb-empty">Erro ao buscar no AniList. Verifique sua conexão.</div>`;
    resultsBox.classList.add('visible');
  } finally {
    if (requestKey === tmdbLastQuery) {
      spinner.classList.remove('visible');
      resultsBox.setAttribute('aria-busy', 'false');
      if (catalogSearchController === controller) catalogSearchController = null;
    }
  }
}

function renderAniListResults(results) {
  const box = document.getElementById('tmdbResults');
  aniListResultsById.clear();
  if (!results.length) {
    box.innerHTML = `<div class="tmdb-empty">Nenhum mangá, manhwa ou manhua encontrado.</div>`;
    box.classList.add('visible');
    return;
  }

  box.innerHTML = results.slice(0, 10).map(item => {
    aniListResultsById.set(String(item.id), item);
    const name = item.title.english || item.title.userPreferred || item.title.romaji || item.title.native || 'Sem título';
    const original = item.title.native && item.title.native !== name ? ` · ${escHtml(item.title.native)}` : '';
    const type = mapAniListContentType(item.countryOfOrigin);
    const year = item.startDate && item.startDate.year ? item.startDate.year : '—';
    const poster = normalizeImageUrl(item.coverImage && (item.coverImage.large || item.coverImage.extraLarge));
    const posterHtml = poster
      ? `<img class="tmdb-result-poster" src="${escHtml(poster)}" alt="" loading="lazy" decoding="async" />`
      : `<div class="tmdb-result-poster-placeholder">${posterFallbackIcon(16)}</div>`;
    return `<button type="button" class="tmdb-result" data-anilist-id="${escHtml(item.id)}">
      ${posterHtml}
      <div class="tmdb-result-info">
        <div class="tmdb-result-name">${escHtml(name)}</div>
        <div class="tmdb-result-meta">${escHtml(year)} · ${escHtml(getContentTypeLabel(type))}${original}</div>
      </div>
    </button>`;
  }).join('');
  box.classList.add('visible');
}

function selectAniListResult(id) {
  const item = aniListResultsById.get(String(id));
  if (!item) return;

  const contentType = mapAniListContentType(item.countryOfOrigin);
  const name = item.title.english || item.title.userPreferred || item.title.romaji || item.title.native || '';
  const mappedGenres = mapAniListGenres(item.genres || []);
  mappedGenres.forEach(ensureGenreOption);

  document.getElementById('inputContentType').value = contentType;
  updateContentTypeFormUI(contentType, Boolean(editingId));
  document.getElementById('inputName').value = name;
  document.getElementById('inputType').value = mapAniListCountry(item.countryOfOrigin);
  document.getElementById('inputSynopsis').value = cleanAniListDescription(item.description);
  document.getElementById('inputAuthor').value = getAniListAuthors(item);
  document.getElementById('inputChapters').value = Number.isInteger(item.chapters) ? item.chapters : '';

  document.querySelectorAll('.genre-chip').forEach(chip => {
    const selected = mappedGenres.includes(chip.dataset.value);
    chip.classList.toggle('selected', selected);
    chip.setAttribute('aria-pressed', String(selected));
  });

  const poster = normalizeImageUrl(item.coverImage && (item.coverImage.extraLarge || item.coverImage.large));
  if (poster) {
    currentPosterData = poster;
    showPosterPreview(poster);
  }

  pendingAniList = {
    year: item.startDate && item.startDate.year ? item.startDate.year : null,
    publication_status: item.status || null
  };

  document.getElementById('tmdbSearchInput').value = '';
  document.getElementById('tmdbResults').classList.remove('visible');
  showToast(`Dados do ${getContentTypeLabel(contentType).toLowerCase()} importados do AniList.`, 'success');
}

function searchExternalCatalog(query) {
  return isReadingContentType(getFormContentType()) ? anilistSearch(query) : tmdbSearch(query);
}

// ── SUPABASE ──
// Troque pelos dados do seu projeto Supabase:
// Project Settings > Data API > Project URL e anon/public key.
const SUPABASE_URL = 'https://vwrjxsietwsybvpxmdvg.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ3cmp4c2lldHdzeWJ2cHhtZHZnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIyNTc2NTUsImV4cCI6MjA5NzgzMzY1NX0.yi4l0ZK5oVH2DKHPVA-MY6zfYSxVhhDD29-kkDT1DkA';
const SUPABASE_TABLE = 'series';
const supabaseClient = (
  SUPABASE_URL.startsWith('https://') &&
  SUPABASE_ANON_KEY &&
  !SUPABASE_ANON_KEY.startsWith('COLE_AQUI')
) ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
      detectSessionInUrl: true,
      persistSession: true,
    },
  }) : null;

function canManage() {
  return !supabaseClient || (Boolean(currentUser) && isRemoteDataWritable);
}

function syncAuthUi() {
  const authButton = document.getElementById('authButton');
  const authLabel = document.getElementById('authButtonLabel');
  const addButton = document.getElementById('addContentButton');
  const fab = document.getElementById('fab');
  const managementEnabled = canManage();

  addButton.hidden = !managementEnabled;
  fab.hidden = !managementEnabled;

  if (!supabaseClient) {
    authButton.hidden = true;
    return;
  }

  authButton.hidden = false;
  authButton.disabled = !isAuthReady;
  authButton.toggleAttribute('aria-busy', !isAuthReady);
  authLabel.textContent = currentUser ? 'Sair' : 'Entrar';
  authButton.title = currentUser
    ? `Sair da conta ${currentUser.email || ''}`.trim()
    : 'Entrar ou criar uma conta';
  authButton.setAttribute('aria-label', authButton.title);
}

function requireManagementAccess() {
  if (canManage()) return true;
  if (currentUser && !isRemoteDataWritable) {
    showToast('A sua lista ainda não terminou de sincronizar.', 'error');
    return false;
  }
  showToast('Entre ou crie uma conta para alterar a sua lista.', 'info');
  openModal('authModal');
  return false;
}

async function initializeAuth() {
  if (!supabaseClient) {
    isAuthReady = true;
    syncAuthUi();
    return;
  }

  const { data, error } = await supabaseClient.auth.getSession();
  if (error) console.error('Não foi possível restaurar a sessão:', error);
  currentUser = data?.session?.user || null;
  isAuthReady = true;
  syncAuthUi();

  supabaseClient.auth.onAuthStateChange((event, session) => {
    currentUser = session?.user || null;
    isAuthReady = true;
    syncAuthUi();
    if (event === 'INITIAL_SESSION') {
      render();
      return;
    }
    void refreshDataForCurrentUser();
  });
}

async function sendMagicLink() {
  if (!supabaseClient || isSendingAuthLink) return;
  const emailInput = document.getElementById('authEmail');
  const email = emailInput.value.trim();
  if (!emailInput.checkValidity()) {
    emailInput.reportValidity();
    return;
  }

  const submitButton = document.getElementById('authSubmitButton');
  const submitLabel = document.getElementById('authSubmitLabel');
  isSendingAuthLink = true;
  submitButton.disabled = true;
  submitButton.setAttribute('aria-busy', 'true');
  submitLabel.textContent = 'Enviando…';

  try {
    const redirectUrl = new URL(location.pathname, location.origin).href;
    const { error } = await supabaseClient.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: redirectUrl,
        shouldCreateUser: true,
      },
    });
    if (error) throw error;
    document.getElementById('authForm').reset();
    closeModal('authModal');
    showToast('Link de acesso enviado. Verifique seu e-mail.', 'success');
  } catch (error) {
    console.error(error);
    showToast('Não foi possível enviar o link de acesso.', 'error');
  } finally {
    isSendingAuthLink = false;
    submitButton.disabled = false;
    submitButton.removeAttribute('aria-busy');
    submitLabel.textContent = 'Enviar link de acesso';
  }
}

async function toggleAuth() {
  if (!supabaseClient || !isAuthReady) return;
  if (!currentUser) {
    openModal('authModal');
    return;
  }

  const { error } = await supabaseClient.auth.signOut();
  if (error) {
    console.error(error);
    showToast('Não foi possível sair da conta.', 'error');
    return;
  }
  showToast('Sessão encerrada.', 'info');
}

// ── STORAGE ──
function getUserSnapshotKey(userId = currentUser?.id) {
  return userId ? `${SNAPSHOT_KEY}:${userId}` : null;
}

async function refreshDataForCurrentUser() {
  const requestId = ++authDataRequestId;
  isLoading = true;
  series = [];
  isRemoteDataWritable = false;
  syncAuthUi();
  render();

  try {
    await loadData();
    syncPlatformOptionsFromSavedItems();
  } catch (error) {
    console.error(error);
    showToast('Não foi possível carregar a sua lista.', 'error');
  } finally {
    if (requestId !== authDataRequestId) return;
    isLoading = false;
    syncAuthUi();
    render();
  }
}

async function loadData() {
  if (!supabaseClient) {
    series = readLocalSeries(STORAGE_KEY);
    return;
  }

  const userId = currentUser?.id;
  if (!userId) {
    series = [];
    isRemoteDataWritable = false;
    return;
  }

  const { data, error } = await supabaseClient
    .from(SUPABASE_TABLE)
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (error) {
    console.error(error);
    isRemoteDataWritable = false;
    series = readLocalSeries(getUserSnapshotKey());
    syncAuthUi();
    showToast(
      series.length
        ? 'Supabase indisponível. Exibindo a última cópia salva.'
        : 'Não foi possível carregar a lista do Supabase.',
      'error',
    );
    return;
  }

  series = (data || []).map(normalizeSeriesItem).filter(Boolean);
  isRemoteDataWritable = true;
  saveRemoteSnapshot(series);
  syncAuthUi();
}

async function insertSeries(item) {
  if (!supabaseClient) {
    writeLocalSeries(STORAGE_KEY, [item, ...series]);
    return item;
  }

  const userId = currentUser?.id;
  if (!userId) throw new Error('É necessário estar autenticado para salvar.');

  const { data, error } = await supabaseClient
    .from(SUPABASE_TABLE)
    .insert({ ...item, user_id: userId })
    .select()
    .single();

  if (error) throw error;
  return data;
}

async function updateSeries(id, item) {
  if (!supabaseClient) {
    const idx = series.findIndex(x => String(x.id) === String(id));
    if (idx !== -1) series[idx] = { ...series[idx], ...item };
    writeLocalSeries(STORAGE_KEY, series);
    return series.find(x => String(x.id) === String(id));
  }

  const userId = currentUser?.id;
  if (!userId) throw new Error('É necessário estar autenticado para atualizar.');

  const { data, error } = await supabaseClient
    .from(SUPABASE_TABLE)
    .update(item)
    .eq('id', id)
    .eq('user_id', userId)
    .select()
    .single();

  if (error) throw error;
  return data;
}

async function removeSeriesFromDb(id) {
  if (!supabaseClient) {
    series = series.filter(x => String(x.id) !== String(id));
    writeLocalSeries(STORAGE_KEY, series);
    return;
  }

  const userId = currentUser?.id;
  if (!userId) throw new Error('É necessário estar autenticado para excluir.');

  const { data, error } = await supabaseClient
    .from(SUPABASE_TABLE)
    .delete()
    .eq('id', id)
    .eq('user_id', userId)
    .select('id')
    .maybeSingle();

  if (error) throw error;
  if (!data) throw new Error('A exclusão não foi autorizada ou o registro já não existe.');
}

// ── SIDEBAR ──
function toggleSidebar() {
  const sidebar = document.getElementById('sidebar');
  const overlay = document.getElementById('sidebarOverlay');
  const button = document.getElementById('filterToggleBtn');
  const isOpen = sidebar.classList.toggle('open');
  overlay.classList.toggle('open', isOpen);
  overlay.setAttribute('aria-hidden', String(!isOpen));
  button.setAttribute('aria-expanded', String(isOpen));
  syncPageInteractionState();
  if (isOpen) sidebar.focus();
}

function closeSidebar() {
  const sidebar = document.getElementById('sidebar');
  const button = document.getElementById('filterToggleBtn');
  const shouldRestoreFocus = sidebar.contains(document.activeElement);
  sidebar.classList.remove('open');
  const overlay = document.getElementById('sidebarOverlay');
  overlay.classList.remove('open');
  overlay.setAttribute('aria-hidden', 'true');
  button.setAttribute('aria-expanded', 'false');
  syncPageInteractionState();
  if (shouldRestoreFocus) button.focus({ preventScroll: true });
}

// ── RENDER ──
function renderSkeletons(count = 12) {
  const skel = `<div class="skeleton-card">
    <div class="skel-poster skeleton"></div>
    <div class="skel-body">
      <div class="skel-line skeleton w-80"></div>
      <div class="skel-line skeleton w-50"></div>
      <div class="skel-line skeleton w-30"></div>
    </div>
  </div>`;
  return Array(count).fill(skel).join('');
}

function getContentCounts(items = series) {
  return items.reduce((counts, item) => {
    const type = getContentType(item);
    counts[type] = (counts[type] || 0) + 1;
    return counts;
  }, { series: 0, movie: 0, anime: 0, manga: 0, manhwa: 0, manhua: 0 });
}

function render() {
  const grid = document.getElementById('seriesGrid');
  const filtered = getFiltered();
  const counts = getContentCounts(series);

  const randomBtn = document.getElementById('randomSeriesBtn');
  if (randomBtn) {
    randomBtn.disabled = isLoading;
    randomBtn.title = isLoading
      ? 'Aguarde o carregamento da lista'
      : filtered.length > 0
        ? `Sortear entre ${filtered.length} ${filtered.length === 1 ? 'título' : 'títulos'} dos resultados atuais`
        : 'Nenhum título disponível nos resultados atuais';
  }

  if (isLoading || series.length === 0) {
    document.getElementById('navCount').textContent = '';
  } else {
    const plural = { series: 'séries', movie: 'filmes', anime: 'animes', manga: 'mangás', manhwa: 'manhwas', manhua: 'manhuas' };
    const singular = { series: 'série', movie: 'filme', anime: 'anime', manga: 'mangá', manhwa: 'manhwa', manhua: 'manhua' };
    const parts = Object.keys(counts).filter(type => counts[type]).map(type => `${counts[type]} ${counts[type] === 1 ? singular[type] : plural[type]}`);
    document.getElementById('navCount').textContent = parts.join(' · ');
  }

  const info = document.getElementById('resultsInfo');
  const hasFilters = searchQuery || filters.contentType.length || filters.type.length || filters.genre.length || filters.platform.length;
  if (isLoading) {
    info.innerHTML = '<span style="opacity:.6">Carregando...</span>';
  } else if (hasFilters) {
    info.innerHTML = `Mostrando <strong>${filtered.length}</strong> de <strong>${series.length}</strong> títulos`;
  } else {
    info.innerHTML = series.length > 0
      ? `<strong>${series.length}</strong> ${series.length === 1 ? 'título cadastrado' : 'títulos cadastrados'}`
      : '';
  }

  renderMobileActiveFilters();
  grid.className = 'series-grid' + (currentView === 'list' ? ' list-view' : '');

  if (isLoading) {
    grid.innerHTML = renderSkeletons(12);
    return;
  }

  if (series.length === 0) {
    const emptyTitle = currentUser ? 'Sua lista está vazia' : 'Entre para ver sua lista';
    const emptyDescription = currentUser
      ? 'Comece adicionando uma série, filme, anime, mangá ou manhwa. O TMDB e o AniList podem preencher os dados automaticamente.'
      : 'Entre ou crie uma conta para acessar sua lista particular e adicionar seus títulos.';
    const emptyActionLabel = currentUser ? 'Adicionar primeiro título' : 'Entrar ou criar conta';
    grid.innerHTML = `
      <div class="empty-state" style="grid-column:1/-1">
        <svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2"><rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/><path d="M7 8h10M7 11h6"/></svg>
        <h3>${emptyTitle}</h3>
        <p>${emptyDescription}</p>
        <div class="empty-actions">
          <button class="btn btn-primary" data-action="open-content-chooser">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M12 5v14M5 12h14"/></svg>
            ${emptyActionLabel}
          </button>
        </div>
        ${currentUser ? '<div class="kbd-hint">Dica: pressione <span class="kbd">N</span> para adicionar rápido</div>' : ''}
      </div>`;
    return;
  }

  if (filtered.length === 0) {
    grid.innerHTML = `
      <div class="empty-state" style="grid-column:1/-1">
        <svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/><path d="M8 11h6M11 8v6"/></svg>
        <h3>Nenhum resultado</h3>
        <p>Nenhum título corresponde aos filtros ou à pesquisa atual.</p>
        <div class="empty-actions"><button class="btn btn-ghost" data-action="clear-all">Limpar filtros e pesquisa</button></div>
      </div>`;
    return;
  }

  grid.innerHTML = filtered.map((item, index) => renderCard(item, index)).join('');
  requestAnimationFrame(applyBadgeOverflow);
}

// ── BADGE OVERFLOW: mostra +N só quando não cabe ──
function applyBadgeOverflow() {
  document.querySelectorAll('.badge-overflow-row').forEach(row => {
    const counter = row.querySelector('.badge-overflow-counter');
    if (!counter) return;

    const badges = Array.from(row.querySelectorAll('.badge:not(.badge-overflow-counter)'));

    // Começa a medição com todos os badges visíveis.
    badges.forEach(badge => {
      badge.style.display = '';
    });
    counter.style.display = 'none';
    counter.style.visibility = '';
    counter.textContent = '';

    const rowWidth = row.clientWidth;
    if (rowWidth <= 0 || badges.length === 0) return;

    // Evita cortes de 1 ou 2 pixels causados por arredondamento do navegador.
    const safeRowWidth = Math.max(0, rowWidth - 2);
    const styles = getComputedStyle(row);
    const gap = Number.parseFloat(styles.columnGap || styles.gap) || 0;
    const badgeWidths = badges.map(badge => badge.getBoundingClientRect().width);
    const allBadgesWidth = badgeWidths.reduce((total, width) => total + width, 0)
      + gap * Math.max(0, badges.length - 1);

    // Todos cabem: não há necessidade do contador.
    if (allBadgesWidth <= safeRowWidth) return;

    // Testa o contador já com o texto real (+1, +2, +10...), pois sua
    // largura muda conforme a quantidade de itens escondidos.
    let visibleCount = 0;
    let hiddenCount = badges.length;

    counter.style.display = '';
    counter.style.visibility = 'hidden';

    for (let candidateVisible = badges.length - 1; candidateVisible >= 0; candidateVisible--) {
      const candidateHidden = badges.length - candidateVisible;
      counter.textContent = `+${candidateHidden}`;

      const counterWidth = counter.getBoundingClientRect().width;
      const visibleBadgesWidth = badgeWidths
        .slice(0, candidateVisible)
        .reduce((total, width) => total + width, 0);
      const itemCount = candidateVisible + 1; // badges visíveis + contador
      const totalWidth = visibleBadgesWidth
        + counterWidth
        + gap * Math.max(0, itemCount - 1);

      if (totalWidth <= safeRowWidth) {
        visibleCount = candidateVisible;
        hiddenCount = candidateHidden;
        break;
      }
    }

    badges.forEach((badge, index) => {
      badge.style.display = index < visibleCount ? '' : 'none';
    });

    counter.textContent = `+${hiddenCount}`;
    counter.style.visibility = '';
    counter.style.display = '';
  });
}

function renderCard(s, idx) {
  const delay = Math.min(idx || 0, 18) * 25;
  const animStyle = `style="animation-delay:${delay}ms"`;
  const safeId = escHtml(String(s.id));
  const safeName = escHtml(s.name);
  const genres = Array.isArray(s.genres) ? s.genres : (s.genre ? [s.genre] : []);
  const posterUrl = normalizeImageUrl(s.poster);
  const posterHtml = posterUrl
    ? `<img class="card-poster" src="${escHtml(posterUrl)}" alt="${safeName}" loading="lazy" decoding="async" data-poster-fallback="card" />`
    : createCardPosterPlaceholder(s.name);

  const contentType = getContentType(s);
  const contentTypeLabel = getContentTypeLabel(s);
  const contentTypeBadge = `<span class="badge badge-content-type" data-content-type="${escHtml(contentType)}">${escHtml(contentTypeLabel)}</span>`;
  const hasOrigin = contentType !== 'movie';
  const flag = hasOrigin ? (COUNTRY_FLAG[s.type] || '') : '';
  const year = getSeriesYear(s);
  const yearBadgeGrid = year ? `<span class="badge badge-year">${escHtml(year)}</span>` : '';
  const platforms = getSeriesPlatforms(s);

  const originBadge = hasOrigin && s.type
    ? `<span class="badge badge-type" title="Origem: ${escHtml(s.type)}">${flag ? `${flag} ` : ''}${escHtml(s.type)}</span>`
    : '';

  const readingProgressBadge = isReadingContentType(contentType) && (s.current_chapter !== null && s.current_chapter !== undefined && s.current_chapter !== '')
    ? `<span class="badge badge-type" title="Progresso de leitura">Cap. ${escHtml(s.current_chapter)}${s.chapters ? `/${escHtml(s.chapters)}` : ''}</span>`
    : '';
  const readingStatusBadge = isReadingContentType(contentType) && s.reading_status
    ? `<span class="badge badge-type">${escHtml(getReadingStatusLabel(s.reading_status))}</span>`
    : '';

  const platformBadges = platforms.map(platform =>
    `<span class="badge badge-platform" data-platform="${escHtml(platform)}" title="${escHtml(platform)}">${escHtml(platform)}</span>`
  ).join('');

  const genreBadges = genres.map(genre =>
    `<span class="badge badge-genre" title="${escHtml(genre)}">${escHtml(genre)}</span>`
  ).join('');

  const primaryMeta = originBadge || platformBadges || readingProgressBadge || readingStatusBadge
    ? `<div class="card-meta-row card-meta-row-primary badge-overflow-row">${originBadge}${readingProgressBadge}${readingStatusBadge}${platformBadges}<span class="badge badge-more badge-overflow-counter" style="display:none"></span></div>`
    : '';
  const genreMeta = genreBadges
    ? `<div class="card-meta-row card-meta-row-genres badge-overflow-row">${genreBadges}<span class="badge badge-more badge-overflow-counter" style="display:none"></span></div>`
    : '';

  const cardInfo = primaryMeta || genreMeta
    ? `<div class="card-meta-groups">${primaryMeta}${genreMeta}</div>`
    : '';

  const hoverOverlay = currentView === 'grid' ? `
    <div class="card-hover-overlay">
      ${s.synopsis ? `<div class="card-hover-synopsis">${escHtml(s.synopsis)}</div>` : ''}
      <span class="card-hover-cta">
        <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
        Ver detalhes
      </span>
    </div>` : '';

  const posterBadges = `<div class="card-poster-badges">${contentTypeBadge}${yearBadgeGrid}</div>`;
  const posterBlock = `<div class="card-poster-wrap">${posterBadges}${posterHtml}${currentView === 'grid' ? hoverOverlay : ''}</div>`;
  const openButton = `<button type="button" class="card-open-button" data-action="open-series" data-series-id="${safeId}" aria-label="Ver detalhes de ${safeName}"></button>`;
  const manageCardActions = canManage();

  if (currentView === 'list') {
    return `<article class="series-card" ${animStyle} data-series-id="${safeId}">
      ${openButton}
      ${posterBlock}
      <div class="card-body">
        <div class="card-title">${safeName}</div>
        ${cardInfo}
      </div>
      ${manageCardActions ? `<div class="card-actions">
        <button type="button" class="card-action-btn card-action-edit" data-action="edit-series" data-series-id="${safeId}" aria-label="Editar ${safeName}" title="Editar">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
        </button>
        <button type="button" class="card-action-btn card-action-delete" data-action="delete-series" data-series-id="${safeId}" aria-label="Excluir ${safeName}" title="Excluir">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="m19 6-.867 12.142A2 2 0 0 1 16.138 20H7.862a2 2 0 0 1-1.995-1.858L5 6m5 0V4a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v2"/></svg>
        </button>
      </div>` : ''}
    </article>`;
  }

  return `<article class="series-card" ${animStyle} data-series-id="${safeId}">
    ${openButton}
    ${posterBlock}
    ${manageCardActions ? `<div class="card-actions">
      <button type="button" class="card-action-btn card-action-edit" data-action="edit-series" data-series-id="${safeId}" aria-label="Editar ${safeName}" title="Editar">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
      </button>
      <button type="button" class="card-action-btn card-action-delete" data-action="delete-series" data-series-id="${safeId}" aria-label="Excluir ${safeName}" title="Excluir">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="m19 6-.867 12.142A2 2 0 0 1 16.138 20H7.862a2 2 0 0 1-1.995-1.858L5 6m5 0V4a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v2"/></svg>
      </button>
    </div>` : ''}
    <div class="card-body">
      <div class="card-title">${safeName}</div>
      ${cardInfo}
    </div>
  </article>`;
}

// ── FILTER / SEARCH ──
function getFiltered() {
  return series.filter(s => {
    const genres = Array.isArray(s.genres) ? s.genres : (s.genre ? [s.genre] : []);
    const platforms = getSeriesPlatforms(s);

    if (searchQuery) {
      const q = normalizeSeriesName(searchQuery);
      if (!normalizeSeriesName(s.name).includes(q)) return false;
    }
    if (filters.contentType.length && !filters.contentType.includes(getContentType(s))) return false;
    // O filtro de origem se aplica a todos os conteúdos, exceto filmes.
    const sHasOrigin = getContentType(s) !== 'movie';
    if (filters.type.length && (!sHasOrigin || !filters.type.includes(s.type))) return false;
    if (filters.genre.length && !filters.genre.some(g => genres.includes(g))) return false;
    if (filters.platform.length && !filters.platform.some(platform => platforms.includes(platform))) return false;
    return true;
  });
}

function toggleFilter(el) {
  const filterKey = el.dataset.filter;
  const value = el.dataset.value;
  const arr = filters[filterKey];

  // Conteúdo e origem são filtros de seleção única.
  if (filterKey === 'type' || filterKey === 'contentType') {
    if (arr.includes(value)) {
      filters[filterKey] = [];
      el.classList.remove('active');
      el.setAttribute('aria-pressed', 'false');
    } else {
      filters[filterKey] = [value];
      document.querySelectorAll(`[data-filter="${filterKey}"].active`).forEach(chip => {
        chip.classList.remove('active');
        chip.setAttribute('aria-pressed', 'false');
      });
      el.classList.add('active');
      el.setAttribute('aria-pressed', 'true');
    }
  } else {
    const idx = arr.indexOf(value);
    if (idx === -1) arr.push(value);
    else arr.splice(idx, 1);
    const selected = arr.includes(value);
    el.classList.toggle('active', selected);
    el.setAttribute('aria-pressed', String(selected));
  }
  updateFiltersClearBtn();
  render();
}

function renderMobileActiveFilters() {
  const container = document.getElementById('mobileActiveFilters');
  if (!container) return;

  const labels = { contentType: 'Conteúdo', type: 'Origem', genre: 'Gênero', platform: 'Plataforma' };
  const active = [];
  ['contentType', 'type', 'genre', 'platform'].forEach(filterKey => {
    filters[filterKey].forEach(value => active.push({
      filterKey,
      value,
      displayValue: filterKey === 'contentType' ? getContentTypeLabel(value) : value
    }));
  });

  container.classList.toggle('visible', active.length > 0);
  if (active.length === 0) {
    container.innerHTML = '';
    return;
  }

  container.innerHTML = active.map(({ filterKey, value, displayValue }) => `
    <button class="mobile-filter-chip" data-action="remove-mobile-filter" data-filter="${filterKey}" data-value="${escHtml(value)}" aria-label="Remover filtro ${escHtml(labels[filterKey])}: ${escHtml(displayValue)}">
      <span>${escHtml(labels[filterKey])}: ${escHtml(displayValue)}</span>
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M18 6 6 18M6 6l12 12"/></svg>
    </button>`).join('') + `
    <button class="mobile-filters-clear" data-action="clear-filters">Limpar todos</button>`;
}

function removeMobileFilter(button) {
  const filterKey = button.dataset.filter;
  const value = button.dataset.value;
  if (!filters[filterKey]) return;

  filters[filterKey] = filters[filterKey].filter(item => item !== value);
  document.querySelectorAll(`.chip[data-filter="${filterKey}"]`).forEach(chip => {
    if (chip.dataset.value === value) {
      chip.classList.remove('active');
      chip.setAttribute('aria-pressed', 'false');
    }
  });
  updateFiltersClearBtn();
  render();
}

function clearFilters() {
  filters = { contentType: [], type: [], genre: [], platform: [] };
  document.querySelectorAll('.chip.active').forEach(c => {
    c.classList.remove('active');
    c.setAttribute('aria-pressed', 'false');
  });
  updateFiltersClearBtn();
  render();
}

function clearSearch() {
  searchQuery = '';
  document.getElementById('searchInput').value = '';
  document.getElementById('searchClear').classList.remove('visible');
  render();
}

function clearAll() {
  clearFilters();
  clearSearch();
}

function updateFiltersClearBtn() {
  const total = filters.contentType.length + filters.type.length + filters.genre.length + filters.platform.length;
  document.getElementById('filtersClear').classList.toggle('visible', total > 0);
  const badge = document.getElementById('filterCountBadge');
  badge.textContent = total;
  badge.classList.toggle('visible', total > 0);
}

// ── VIEW ──
function setView(v) {
  currentView = v;
  document.getElementById('viewGrid').classList.toggle('active', v === 'grid');
  document.getElementById('viewList').classList.toggle('active', v === 'list');
  document.getElementById('viewGrid').setAttribute('aria-pressed', String(v === 'grid'));
  document.getElementById('viewList').setAttribute('aria-pressed', String(v === 'list'));
  render();
}

// ── MODAL HELPERS ──
const MODAL_IDS = ['detailModal', 'formModal', 'confirmModal', 'contentTypeModal', 'authModal'];
const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

function getOpenModal() {
  const overlay = MODAL_IDS.map(id => document.getElementById(id))
    .find(element => element?.classList.contains('open'));
  return overlay?.querySelector('[role="dialog"]') || null;
}

function syncPageInteractionState() {
  const hasOpenModal = Boolean(getOpenModal());
  const sidebar = document.getElementById('sidebar');
  const hasOpenSidebar = mobileSidebarMedia.matches && sidebar.classList.contains('open');
  const pageLocked = hasOpenModal || hasOpenSidebar;

  document.body.style.overflow = pageLocked ? 'hidden' : '';
  document.body.classList.toggle('modal-open', hasOpenModal);
  document.querySelector('.site-header').inert = pageLocked;
  document.querySelector('.app-layout').inert = hasOpenModal;
  document.getElementById('mainContent').inert = hasOpenSidebar;
  document.getElementById('fab').inert = pageLocked;
  sidebar.inert = hasOpenModal || (mobileSidebarMedia.matches && !hasOpenSidebar);

  if (mobileSidebarMedia.matches) {
    sidebar.setAttribute('aria-hidden', String(!hasOpenSidebar));
  } else {
    sidebar.removeAttribute('aria-hidden');
  }
}

function handleSidebarBreakpointChange() {
  if (!mobileSidebarMedia.matches) {
    document.getElementById('sidebar').classList.remove('open');
    document.getElementById('sidebarOverlay').classList.remove('open');
    document.getElementById('sidebarOverlay').setAttribute('aria-hidden', 'true');
    document.getElementById('filterToggleBtn').setAttribute('aria-expanded', 'false');
  }
  syncPageInteractionState();
}

if (mobileSidebarMedia.addEventListener) {
  mobileSidebarMedia.addEventListener('change', handleSidebarBreakpointChange);
} else {
  mobileSidebarMedia.addListener(handleSidebarBreakpointChange);
}

syncPageInteractionState();

function openModal(id) {
  const overlay = document.getElementById(id);
  if (!overlay) return;

  if (!getOpenModal() && document.activeElement instanceof HTMLElement) {
    activeModalReturnFocus = document.activeElement;
  }

  overlay.setAttribute('aria-hidden', 'false');
  overlay.classList.add('open');
  syncPageInteractionState();

  setTimeout(() => {
    const dialog = overlay.querySelector('[role="dialog"]');
    const target = dialog?.querySelector('[autofocus]')
      || dialog?.querySelector('input:not([type="hidden"]), button:not([disabled]), select, textarea');
    if (typeof target?.focus === 'function') target.focus({ preventScroll: true });
    else if (typeof dialog?.focus === 'function') {
      dialog.tabIndex = -1;
      dialog.focus({ preventScroll: true });
    }
  }, 50);
}

function closeModal(id) {
  const overlay = document.getElementById(id);
  if (!overlay) return;
  if (id === 'formModal' && isSaving) return;
  overlay.classList.remove('open');
  overlay.setAttribute('aria-hidden', 'true');
  if (id === 'formModal') invalidateCatalogRequests();
  if (id === 'detailModal') clearRandomDrawTimers();
  if (id === 'confirmModal') pendingDeleteId = null;
  syncPageInteractionState();

  const remainingModal = getOpenModal();
  if (remainingModal) {
    const nextFocus = remainingModal.querySelector(FOCUSABLE_SELECTOR);
    if (typeof nextFocus?.focus === 'function') nextFocus.focus();
  } else if (activeModalReturnFocus?.isConnected) {
    activeModalReturnFocus.focus();
    activeModalReturnFocus = null;
  }
}

// ── ADD / EDIT MODAL ──
function openContentTypeChooser() {
  if (!requireManagementAccess()) return;
  closeSidebar();
  openModal('contentTypeModal');
}

function startAddContent(contentType) {
  if (!requireManagementAccess()) return;
  closeModal('contentTypeModal');
  openAddModal(contentType);
}

function openAddModal(contentType = 'series') {
  invalidateCatalogRequests();
  editingId = null;
  currentPosterData = null;
  pendingTmdb = null;
  pendingAniList = null;
  document.getElementById('editId').value = '';
  document.getElementById('inputContentType').value = getContentType({ content_type: contentType });
  document.getElementById('inputName').value = '';
  document.getElementById('inputType').value = '';
  document.querySelectorAll('.platform-chip.selected').forEach(chip => {
    chip.classList.remove('selected');
    chip.setAttribute('aria-pressed', 'false');
  });
  document.getElementById('inputSynopsis').value = '';
  document.getElementById('inputAuthor').value = '';
  document.getElementById('inputChapters').value = '';
  document.getElementById('inputCurrentChapter').value = '';
  document.getElementById('inputReadingStatus').value = 'quero_ler';
  document.getElementById('inputPosterUrl').value = '';
  document.getElementById('tmdbSearchInput').value = '';
  document.getElementById('tmdbResults').classList.remove('visible');
  setTmdbPlatformStatus('');
  document.querySelectorAll('.genre-chip.selected').forEach(chip => {
    chip.classList.remove('selected');
    chip.setAttribute('aria-pressed', 'false');
  });
  resetPosterUI();
  updateContentTypeFormUI(contentType, false);
  openModal('formModal');
  setTimeout(() => document.getElementById('tmdbSearchInput').focus(), 100);
}

function openEditModal(id) {
  if (!requireManagementAccess()) return;
  const item = series.find(entry => String(entry.id) === String(id));
  if (!item) return;
  invalidateCatalogRequests();
  editingId = id;
  currentPosterData = item.poster || null;
  pendingTmdb = null;
  pendingAniList = null;

  const contentType = getContentType(item);
  document.getElementById('editId').value = id;
  document.getElementById('inputContentType').value = contentType;
  document.getElementById('inputName').value = item.name;
  document.getElementById('inputType').value = item.type;

  const platforms = getSeriesPlatforms(item);
  document.querySelectorAll('.platform-chip').forEach(chip => {
    const selected = platforms.includes(chip.dataset.value);
    chip.classList.toggle('selected', selected);
    chip.setAttribute('aria-pressed', String(selected));
  });

  document.getElementById('inputSynopsis').value = item.synopsis || '';
  document.getElementById('inputAuthor').value = item.author || '';
  document.getElementById('inputChapters').value = item.chapters ?? '';
  document.getElementById('inputCurrentChapter').value = item.current_chapter ?? '';
  document.getElementById('inputReadingStatus').value = normalizeReadingStatus(item.reading_status);
  document.getElementById('inputPosterUrl').value = '';
  document.getElementById('tmdbSearchInput').value = '';
  document.getElementById('tmdbResults').classList.remove('visible');
  setTmdbPlatformStatus('');

  const genres = Array.isArray(item.genres) ? item.genres : (item.genre ? [item.genre] : []);
  document.querySelectorAll('.genre-chip').forEach(chip => {
    const selected = genres.includes(chip.dataset.value);
    chip.classList.toggle('selected', selected);
    chip.setAttribute('aria-pressed', String(selected));
  });

  if (item.poster) showPosterPreview(item.poster);
  else resetPosterUI();

  updateContentTypeFormUI(contentType, true);
  closeModal('detailModal');
  openModal('formModal');
  setTimeout(() => document.getElementById('inputName').focus(), 100);
}

async function saveSeries() {
  if (isSaving) return;
  if (!requireManagementAccess()) return;
  const form = document.getElementById('seriesForm');
  if (!form.checkValidity()) {
    form.reportValidity();
    return;
  }

  const name = document.getElementById('inputName').value.trim();
  const contentType = getFormContentType();
  const selectedType = document.getElementById('inputType').value;
  const type = contentType === 'movie' ? 'Outros' : selectedType;
  const isReading = isReadingContentType(contentType);
  const synopsis = document.getElementById('inputSynopsis').value.trim();
  const genres = Array.from(document.querySelectorAll('.genre-chip.selected')).map(chip => chip.dataset.value);
  const platforms = Array.from(document.querySelectorAll('.platform-chip.selected')).map(chip => chip.dataset.value);
  const contentLabel = getContentTypeLabel(contentType).toLowerCase();
  const author = document.getElementById('inputAuthor').value.trim();
  const chaptersValue = document.getElementById('inputChapters').value;
  const currentChapterValue = document.getElementById('inputCurrentChapter').value;
  const readingStatus = document.getElementById('inputReadingStatus').value;
  const chapters = chaptersValue === '' ? null : Number.parseInt(chaptersValue, 10);
  const currentChapter = currentChapterValue === '' ? null : Number.parseFloat(currentChapterValue);
  const targetId = editingId;
  const pendingTmdbAtSave = pendingTmdb;
  const pendingAniListAtSave = pendingAniList;

  if (!name) {
    showToast(`Informe o nome do ${contentLabel}.`, 'error');
    document.getElementById('inputName').focus();
    return;
  }

  const duplicate = series.find(item =>
    String(item.id) !== String(targetId) &&
    getContentType(item) === contentType &&
    normalizeSeriesName(item.name) === normalizeSeriesName(name)
  );
  if (duplicate) {
    const inputName = document.getElementById('inputName');
    const duplicateListLabel = `${getContentTypeLabel(contentType).toLowerCase()}s`;
    showToast(`“${duplicate.name}” já está na sua lista de ${duplicateListLabel}.`, 'error');
    inputName.focus();
    inputName.select();
    return;
  }

  if (contentType !== 'movie' && !type) { showToast('Selecione a origem.', 'error'); return; }
  if (genres.length === 0) { showToast('Selecione pelo menos um gênero.', 'error'); return; }
  if (!isReading && platforms.length === 0) { showToast('Selecione pelo menos uma plataforma.', 'error'); return; }
  if (isReading && (chaptersValue !== '' && (!Number.isInteger(chapters) || chapters < 0))) {
    showToast('Informe um total de capítulos válido.', 'error');
    document.getElementById('inputChapters').focus();
    return;
  }
  if (isReading && (currentChapterValue !== '' && (!Number.isFinite(currentChapter) || currentChapter < 0))) {
    showToast('Informe um capítulo atual válido.', 'error');
    document.getElementById('inputCurrentChapter').focus();
    return;
  }
  if (isReading && chapters !== null && currentChapter !== null && currentChapter > chapters) {
    showToast('O capítulo atual não pode ser maior que o total.', 'error');
    document.getElementById('inputCurrentChapter').focus();
    return;
  }

  const existingItem = targetId
    ? series.find(item => String(item.id) === String(targetId))
    : null;
  const importedYear = Number.parseInt((pendingAniListAtSave && pendingAniListAtSave.year) || (pendingTmdbAtSave && pendingTmdbAtSave.year), 10);
  const savedYear = Number.parseInt(existingItem ? getSeriesYear(existingItem) : '', 10);
  const year = Number.isFinite(importedYear) && importedYear > 0
    ? importedYear
    : (Number.isFinite(savedYear) && savedYear > 0 ? savedYear : null);

  const payload = {
    name,
    content_type: contentType,
    type,
    genres,
    platform: serializePlatforms(platforms),
    synopsis,
    poster: normalizeImageUrl(currentPosterData) || null,
    year
  };

  if (isReading) {
    payload.author = author || null;
    payload.chapters = chapters;
    payload.current_chapter = currentChapter;
    payload.reading_status = normalizeReadingStatus(readingStatus);
    payload.publication_status = pendingAniListAtSave && pendingAniListAtSave.publication_status
      ? pendingAniListAtSave.publication_status
      : (existingItem && existingItem.publication_status) || null;
  } else {
    payload.author = null;
    payload.chapters = null;
    payload.current_chapter = null;
    payload.reading_status = null;
    payload.publication_status = null;
  }

  const saveButton = document.getElementById('saveSeriesBtn');
  const saveLabel = document.getElementById('saveSeriesLabel');
  const formCloseButtons = Array.from(document.querySelectorAll('#formModal [data-action="close-modal"]'));
  isSaving = true;
  saveButton.disabled = true;
  saveButton.setAttribute('aria-busy', 'true');
  formCloseButtons.forEach(button => { button.disabled = true; });
  saveLabel.textContent = targetId ? 'Atualizando…' : 'Salvando…';

  try {
    if (targetId) {
      const updated = normalizeSeriesItem(await updateSeries(targetId, payload));
      const index = series.findIndex(item => String(item.id) === String(targetId));
      if (index !== -1 && updated) series[index] = updated;
      if (pendingTmdbAtSave) {
        tmdbCache[targetId] = pendingTmdbAtSave;
        saveTmdbCache();
      }
      showToast(`${getContentTypeLabel(contentType)} atualizado!`, 'success');
    } else {
      const created = normalizeSeriesItem(await insertSeries({ id: createId(), ...payload }));
      if (!created) throw new Error('O registro retornado é inválido.');
      series.unshift(created);
      if (pendingTmdbAtSave && created && created.id) {
        tmdbCache[created.id] = pendingTmdbAtSave;
        saveTmdbCache();
      }
      showToast(`${getContentTypeLabel(contentType)} adicionado!`, 'success');
    }

    pendingTmdb = null;
    pendingAniList = null;
    isSaving = false;
    closeModal('formModal');
    if (supabaseClient) saveRemoteSnapshot(series);
    render();
  } catch (error) {
    console.error(error);
    const errorText = String(error && (error.message || error.details || ''));
    const missingContentType = errorText.includes('content_type');
    const missingYear = errorText.includes('year');
    const missingReadingColumns = ['author', 'chapters', 'current_chapter', 'reading_status', 'publication_status'].some(column => errorText.includes(column));
    showToast(
      missingContentType
        ? 'Crie a coluna content_type no Supabase antes de salvar.'
        : missingYear
          ? 'Crie a coluna year no Supabase antes de salvar o ano.'
          : missingReadingColumns
            ? 'Crie as colunas de leitura no Supabase usando o SQL enviado nas instruções.'
            : 'Erro ao salvar no Supabase.',
      'error'
    );
  } finally {
    isSaving = false;
    saveButton.disabled = false;
    saveButton.removeAttribute('aria-busy');
    formCloseButtons.forEach(button => { button.disabled = false; });
    saveLabel.textContent = 'Salvar';
  }
}

// ── POSTER ──
async function handlePosterUpload(e) {
  const file = e.target.files[0];
  if (!file) return;
  const allowedTypes = new Set(['image/jpeg', 'image/png', 'image/webp']);
  if (!allowedTypes.has(file.type)) {
    showToast('Use uma imagem JPG, PNG ou WEBP.', 'error');
    e.target.value = '';
    return;
  }
  if (file.size > 5 * 1024 * 1024) {
    showToast('Imagem muito grande. Máx. 5MB.', 'error');
    e.target.value = '';
    return;
  }

  try {
    const bitmap = await createImageBitmap(file);
    const maxDimension = 1000;
    const scale = Math.min(1, maxDimension / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext('2d');
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();

    const encoded = canvas.toDataURL('image/webp', 0.82);
    if (encoded.length > 1.5 * 1024 * 1024) {
      throw new Error('A imagem continua muito grande após a compactação.');
    }

    currentPosterData = encoded;
    showPosterPreview(encoded);
  } catch (error) {
    console.error(error);
    showToast('Não foi possível processar essa imagem.', 'error');
    e.target.value = '';
  }
}

function showPosterPreview(src) {
  const area = document.getElementById('posterUploadArea');
  const hint = document.getElementById('posterHint');
  const preview = document.getElementById('posterPreview');
  const removeBtn = document.getElementById('posterRemoveBtn');
  const safeSource = normalizeImageUrl(src);
  if (!safeSource) return;
  area.classList.add('has-image');
  hint.style.display = 'none';
  preview.src = safeSource;
  preview.style.display = 'block';
  removeBtn.style.display = 'flex';
}

function removePoster(e) {
  e.stopPropagation();
  currentPosterData = null;
  resetPosterUI();
  document.getElementById('posterInput').value = '';
}

function resetPosterUI() {
  const area = document.getElementById('posterUploadArea');
  const hint = document.getElementById('posterHint');
  const preview = document.getElementById('posterPreview');
  const removeBtn = document.getElementById('posterRemoveBtn');
  area.classList.remove('has-image');
  hint.style.display = '';
  preview.removeAttribute('src');
  preview.style.display = 'none';
  removeBtn.style.display = 'none';
}

// ── GENRE CHIPS (form) ──
function toggleGenreChip(el) {
  const selected = el.classList.toggle('selected');
  el.setAttribute('aria-pressed', String(selected));
}

function togglePlatformChip(el) {
  const selected = el.classList.toggle('selected');
  el.setAttribute('aria-pressed', String(selected));
}

// ── RANDOM SERIES DRAW ──
function clearRandomDrawTimers() {
  randomDrawTimers.forEach(timer => clearTimeout(timer));
  randomDrawTimers = [];
}

function chooseRandomSeries(candidates, avoidId = null) {
  const pool = candidates.length > 1 && avoidId
    ? candidates.filter(item => String(item.id) !== String(avoidId))
    : candidates;
  return pool[Math.floor(Math.random() * pool.length)];
}

function drawRandomSeries() {
  if (isLoading) {
    showToast('Aguarde a lista terminar de carregar.', 'info');
    return;
  }

  const candidates = getFiltered();
  if (!candidates.length) {
    const message = series.length
      ? 'Nenhum título corresponde à pesquisa ou aos filtros atuais.'
      : 'Adicione pelo menos um título antes de sortear.';
    showToast(message, 'error');
    return;
  }

  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
    const selected = chooseRandomSeries(candidates, lastRandomSeriesId);
    lastRandomSeriesId = selected.id;
    closeSidebar();
    openDetail(selected.id, true);
    showToast(`${getContentTypeLabel(selected)} sorteado: ${selected.name}`, 'success');
    return;
  }

  closeSidebar();
  clearRandomDrawTimers();

  document.getElementById('detailTitle').textContent = 'Sorteando...';
  document.getElementById('detailContent').innerHTML = `
    <div class="random-draw-body">
      <div class="random-draw-icon">
        <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="4"/><circle cx="8" cy="8" r="1" fill="currentColor"/><circle cx="16" cy="8" r="1" fill="currentColor"/><circle cx="12" cy="12" r="1" fill="currentColor"/><circle cx="8" cy="16" r="1" fill="currentColor"/><circle cx="16" cy="16" r="1" fill="currentColor"/></svg>
      </div>
      <div class="random-draw-label">Escolhendo o próximo título</div>
      <div class="random-draw-name" id="randomDrawName" aria-live="polite">Preparando o sorteio...</div>
      <div class="random-draw-note">O sorteio considera a pesquisa e os filtros selecionados.</div>
    </div>`;
  document.getElementById('detailFooter').innerHTML = `
    <button class="btn btn-ghost" style="flex:1;justify-content:center" data-action="close-modal" data-modal-id="detailModal">Cancelar</button>`;
  openModal('detailModal');

  const totalSteps = Math.min(20, Math.max(12, candidates.length * 2));

  function runStep(step) {
    const modal = document.getElementById('detailModal');
    const nameEl = document.getElementById('randomDrawName');
    if (!modal.classList.contains('open') || !nameEl) return;

    const preview = candidates[Math.floor(Math.random() * candidates.length)];
    nameEl.textContent = preview.name;

    if (step >= totalSteps) {
      const selected = chooseRandomSeries(candidates, lastRandomSeriesId);
      lastRandomSeriesId = selected.id;
      randomDrawTimers.push(setTimeout(() => {
        openDetail(selected.id, true);
        showToast(`${getContentTypeLabel(selected)} sorteado: ${selected.name}`, 'success');
      }, 260));
      return;
    }

    const delay = 55 + Math.round(step * 10);
    randomDrawTimers.push(setTimeout(() => runStep(step + 1), delay));
  }

  runStep(0);
}

// ── DETAIL MODAL ──
function openDetail(id, fromRandomDraw = false) {
  const s = series.find(x => String(x.id) === String(id));
  if (!s) return;
  const safeId = escHtml(String(s.id));
  const genres = Array.isArray(s.genres) ? s.genres : (s.genre ? [s.genre] : []);
  const platforms = getSeriesPlatforms(s);
  const detailYear = getSeriesYear(s);

  clearRandomDrawTimers();
  document.getElementById('detailTitle').textContent = fromRandomDraw ? `${getContentTypeLabel(s)} sorteado!` : s.name;

  const detailContentType = getContentType(s);
  const detailContentTypeLabel = getContentTypeLabel(s);
  const detailTypeOverlay = `<span class="detail-content-type-overlay" data-content-type="${escHtml(detailContentType)}">${escHtml(detailContentTypeLabel)}</span>`;
  const posterUrl = normalizeImageUrl(s.poster);
  const posterHtml = posterUrl
    ? `<div class="detail-poster-wrap">
        <img class="detail-poster" src="${escHtml(posterUrl)}" alt="${escHtml(s.name)}" decoding="async" data-poster-fallback="detail" />
        ${detailTypeOverlay}
        <div class="detail-poster-gradient"></div>
       </div>`
    : `<div class="detail-poster-wrap">
        ${createDetailPosterPlaceholder(s.name)}
        ${detailTypeOverlay}
        <div class="detail-poster-gradient"></div>
       </div>`;

  const genreBadges = genres.length
    ? genres.map(g => `<span class="detail-badge detail-badge-genre">${escHtml(g)}</span>`).join('')
    : `<span class="detail-empty-value">Nenhum gênero informado.</span>`;

  const platformBadges = platforms.length
    ? platforms.map(platform => `<span class="detail-badge detail-badge-platform">${escHtml(platform)}</span>`).join('')
    : `<span class="detail-empty-value">${isReadingContentType(detailContentType) ? 'Nenhum local de leitura informado.' : 'Nenhuma plataforma informada.'}</span>`;

  const synopsisHtml = s.synopsis
    ? `<p class="detail-synopsis">${escHtml(s.synopsis).replace(/\n/g, '<br>')}</p>`
    : `<p class="detail-no-synopsis">Sem sinopse cadastrada.</p>`;

  const infoItems = [
    {
      label: 'Tipo',
      value: detailContentTypeLabel
    },
    detailYear ? {
      label: 'Ano',
      value: detailYear
    } : null,
    detailContentType !== 'movie' && s.type ? {
      label: 'Origem',
      value: s.type
    } : null,
    isReadingContentType(detailContentType) && s.author ? { label: 'Autor / Artista', value: s.author } : null,
    isReadingContentType(detailContentType) && s.current_chapter !== null && s.current_chapter !== undefined ? { label: 'Capítulo atual', value: String(s.current_chapter) } : null,
    isReadingContentType(detailContentType) && s.chapters ? { label: 'Capítulos', value: String(s.chapters) } : null,
    isReadingContentType(detailContentType) && s.reading_status ? { label: 'Meu status', value: getReadingStatusLabel(s.reading_status) } : null,
    isReadingContentType(detailContentType) && s.publication_status ? { label: 'Publicação', value: getPublicationStatusLabel(s.publication_status) } : null
  ].filter(Boolean);

  const infoGridHtml = infoItems.map(item => `
    <div class="detail-info-item">
      <span class="detail-info-label">${escHtml(item.label)}</span>
      <span class="detail-info-value">${escHtml(item.value)}</span>
    </div>
  `).join('');

  document.getElementById('detailContent').innerHTML = `
    ${posterHtml}
    <div class="detail-body">
      ${fromRandomDraw ? `<div class="random-result-badge">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2l2.4 6.1L21 9l-5 4.3 1.5 6.5L12 16.4 6.5 19.8 8 13.3 3 9l6.6-.9L12 2z"/></svg>
        Resultado do sorteio
      </div>` : ''}

      <h3 class="detail-title">${escHtml(s.name)}</h3>

      <div class="detail-info-grid">
        ${infoGridHtml}
      </div>

      <section class="detail-section">
        <div class="detail-section-heading">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M7 15h4M7 11h10"/></svg>
          ${isReadingContentType(detailContentType) ? 'Onde você lê' : 'Plataformas'}
        </div>
        <div class="detail-chip-list">${platformBadges}</div>
      </section>

      <section class="detail-section">
        <div class="detail-section-heading">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20.59 13.41 11 3.83V3H4v7h.83l9.58 9.59a2 2 0 0 0 2.82 0l3.36-3.36a2 2 0 0 0 0-2.82Z"/><circle cx="7.5" cy="6.5" r=".5" fill="currentColor"/></svg>
          Gêneros
        </div>
        <div class="detail-chip-list">${genreBadges}</div>
      </section>

      <section class="detail-section">
        <div class="detail-section-heading">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 4h16v16H4z"/><path d="M8 8h8M8 12h8M8 16h5"/></svg>
          Sinopse
        </div>
        ${synopsisHtml}
      </section>
    </div>`;

  const detailManagementFooter = canManage() ? `
      <button type="button" class="btn btn-ghost" style="flex:1;justify-content:center" data-action="edit-series" data-series-id="${safeId}">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
        Editar
      </button>
      <button type="button" class="btn btn-danger" style="flex:1;justify-content:center" data-action="delete-series" data-series-id="${safeId}">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="m19 6-.867 12.142A2 2 0 0 1 16.138 20H7.862a2 2 0 0 1-1.995-1.858L5 6m5 0V4a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v2"/></svg>
        Excluir
      </button>` : `
      <button type="button" class="btn btn-ghost" style="flex:1;justify-content:center" data-action="close-modal" data-modal-id="detailModal">Fechar</button>`;

  document.getElementById('detailFooter').innerHTML = fromRandomDraw
    ? `
      <button class="btn btn-random" style="flex:1;justify-content:center" data-action="draw-random">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 7h-3a4 4 0 0 0-4 4v6"/><path d="m17 4 3 3-3 3"/><path d="M4 17h3a4 4 0 0 0 4-4V7"/><path d="m7 20-3-3 3-3"/></svg>
        Sortear novamente
      </button>
      <button class="btn btn-ghost" style="flex:1;justify-content:center" data-action="close-modal" data-modal-id="detailModal">Fechar</button>`
    : detailManagementFooter;

  openModal('detailModal');
}

// ── DELETE ──
function confirmDelete(id) {
  if (!requireManagementAccess()) return;
  const s = series.find(x => String(x.id) === String(id));
  if (!s) return;
  pendingDeleteId = id;
  document.getElementById('confirmTitle').textContent = `Excluir ${getContentTypeLabel(s).toLowerCase()}?`;
  document.getElementById('confirmText').textContent = `Tem certeza que deseja excluir "${s.name}"? Esta ação não pode ser desfeita.`;
  openModal('confirmModal');
}

async function deleteSeries(id) {
  if (isDeleting) return;
  if (!requireManagementAccess()) return;
  const item = series.find(entry => String(entry.id) === String(id));
  if (!item) {
    closeModal('confirmModal');
    return;
  }
  const deleteButton = document.getElementById('confirmDeleteBtn');
  isDeleting = true;
  deleteButton.disabled = true;
  deleteButton.setAttribute('aria-busy', 'true');
  deleteButton.textContent = 'Excluindo…';

  try {
    await removeSeriesFromDb(id);
    series = series.filter(entry => String(entry.id) !== String(id));
    if (tmdbCache[id]) { delete tmdbCache[id]; saveTmdbCache(); }
    closeModal('confirmModal');
    const deletedType = getContentType(item);
    showToast(
      deletedType === 'series' ? 'Série excluída.' : `${getContentTypeLabel(deletedType)} excluído.`,
      'info'
    );
    if (supabaseClient) saveRemoteSnapshot(series);
    render();
  } catch (error) {
    console.error(error);
    showToast('Erro ao excluir no Supabase.', 'error');
  } finally {
    isDeleting = false;
    deleteButton.disabled = false;
    deleteButton.removeAttribute('aria-busy');
    deleteButton.textContent = 'Excluir';
  }
}

// ── TOAST ──
function showToast(msg, type = 'info') {
  const container = document.getElementById('toastContainer');
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.setAttribute('role', type === 'error' ? 'alert' : 'status');
  const icons = {
    success: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#22c55e" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>`,
    error: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><path d="M15 9l-6 6M9 9l6 6"/></svg>`,
    info: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#E50914" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/></svg>`
  };
  toast.innerHTML = `${icons[type] || icons.info}<span>${escHtml(msg)}</span>`;
  container.appendChild(toast);
  setTimeout(() => {
    toast.style.animation = 'toastOut 0.25s ease forwards';
    setTimeout(() => toast.remove(), 250);
  }, 3000);
}

// ── UI HELPERS ──
function posterFallbackIcon(size = 28) {
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="m21 15-5-5L5 21"/></svg>`;
}

function createCardPosterPlaceholder(name) {
  return `<div class="card-poster-placeholder">
    ${posterFallbackIcon(28)}
    <span class="poster-fallback-title">${escHtml(name || 'Sem pôster')}</span>
  </div>`;
}

function createDetailPosterPlaceholder(name) {
  return `<div class="detail-poster-placeholder">
    ${posterFallbackIcon(40)}
    <span class="poster-fallback-title">${escHtml(name || 'Sem pôster')}</span>
  </div>`;
}

function replaceBrokenCardPoster(img) {
  const wrapper = document.createElement('div');
  wrapper.innerHTML = createCardPosterPlaceholder(img.alt || 'Sem pôster');
  const placeholder = wrapper.firstElementChild;
  if (placeholder) img.replaceWith(placeholder);
}

function replaceBrokenDetailPoster(img) {
  const wrapper = document.createElement('div');
  wrapper.innerHTML = createDetailPosterPlaceholder(img.alt || 'Sem pôster');
  const placeholder = wrapper.firstElementChild;
  if (placeholder) img.replaceWith(placeholder);
}

// ── INTERACTIONS ──
document.addEventListener('click', event => {
  if (!(event.target instanceof Element)) return;

  const overlay = event.target.closest('.modal-overlay');
  if (overlay && event.target === overlay) {
    closeModal(overlay.id);
    return;
  }

  const actionTarget = event.target.closest('[data-action]');
  if (actionTarget) {
    const { action } = actionTarget.dataset;
    if (action === 'clear-search') clearSearch();
    else if (action === 'toggle-theme') toggleTheme();
    else if (action === 'close-sidebar') closeSidebar();
    else if (action === 'clear-filters') clearFilters();
    else if (action === 'clear-all') clearAll();
    else if (action === 'toggle-sidebar') toggleSidebar();
    else if (action === 'draw-random') drawRandomSeries();
    else if (action === 'toggle-auth') toggleAuth();
    else if (action === 'open-content-chooser') openContentTypeChooser();
    else if (action === 'close-modal') closeModal(actionTarget.dataset.modalId);
    else if (action === 'load-poster-url') loadPosterFromUrl();
    else if (action === 'remove-poster') removePoster(event);
    else if (action === 'remove-mobile-filter') removeMobileFilter(actionTarget);
    else if (action === 'open-series') openDetail(actionTarget.dataset.seriesId);
    else if (action === 'edit-series') openEditModal(actionTarget.dataset.seriesId);
    else if (action === 'confirm-delete' && pendingDeleteId !== null) deleteSeries(pendingDeleteId);
    else if (action === 'delete-series') {
      const id = actionTarget.dataset.seriesId;
      if (actionTarget.closest('#detailModal')) closeModal('detailModal');
      confirmDelete(id);
    }
    return;
  }

  const addTypeTarget = event.target.closest('[data-add-content-type]');
  if (addTypeTarget) {
    startAddContent(addTypeTarget.dataset.addContentType);
    return;
  }

  const viewTarget = event.target.closest('[data-view]');
  if (viewTarget) {
    setView(viewTarget.dataset.view);
    return;
  }

  const filterChip = event.target.closest('.chip[data-filter]');
  if (filterChip) {
    toggleFilter(filterChip);
    return;
  }

  const genreChip = event.target.closest('.genre-chip');
  if (genreChip) {
    toggleGenreChip(genreChip);
    return;
  }

  const platformChip = event.target.closest('.platform-chip');
  if (platformChip) {
    togglePlatformChip(platformChip);
    return;
  }

  const tmdbResult = event.target.closest('[data-tmdb-id]');
  if (tmdbResult) {
    selectTmdbResult(Number.parseInt(tmdbResult.dataset.tmdbId, 10), tmdbResult.dataset.contentType);
    return;
  }

  const aniListResult = event.target.closest('[data-anilist-id]');
  if (aniListResult) {
    selectAniListResult(aniListResult.dataset.anilistId);
    return;
  }

});

document.getElementById('seriesForm').addEventListener('submit', event => {
  event.preventDefault();
  saveSeries();
});

document.getElementById('authForm').addEventListener('submit', event => {
  event.preventDefault();
  sendMagicLink();
});

document.getElementById('posterInput').addEventListener('change', handlePosterUpload);

document.addEventListener('load', event => {
  if (event.target instanceof HTMLImageElement && event.target.classList.contains('card-poster')) {
    event.target.classList.add('loaded');
  }
}, true);

document.addEventListener('error', event => {
  if (!(event.target instanceof HTMLImageElement)) return;
  if (event.target.dataset.posterFallback === 'card') replaceBrokenCardPoster(event.target);
  if (event.target.dataset.posterFallback === 'detail') replaceBrokenDetailPoster(event.target);
}, true);

// ── KEYBOARD ──
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    const openOverlay = document.querySelector('.modal-overlay.open');
    if (openOverlay) closeModal(openOverlay.id);
    else closeSidebar();
    return;
  }

  const openDialog = getOpenModal();
  if (openDialog && e.key === 'Tab') {
    const focusable = Array.from(openDialog.querySelectorAll(FOCUSABLE_SELECTOR))
      .filter(element => element instanceof HTMLElement && element.offsetParent !== null);
    if (!focusable.length) {
      e.preventDefault();
      openDialog.focus();
      return;
    }
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
    return;
  }

  // Ignorar atalhos quando algum campo de texto está focado
  const tag = (e.target && e.target.tagName) || '';
  const isEditable = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || (e.target && e.target.isContentEditable);
  if (isEditable) return;

  // Ignorar combos com modificadores
  if (e.ctrlKey || e.metaKey || e.altKey) return;

  // Não atrapalhar se algum modal estiver aberto
  if (openDialog) return;

  if (e.key === '/') {
    e.preventDefault();
    const inp = document.getElementById('searchInput');
    inp.focus();
    inp.select();
  } else if (e.key === 'n' || e.key === 'N') {
    e.preventDefault();
    openContentTypeChooser();
  } else if (e.key === 'r' || e.key === 'R') {
    e.preventDefault();
    drawRandomSeries();
  }
});

// ── CONTENT TYPE INPUT ──
document.getElementById('inputContentType').addEventListener('change', event => {
  if (event.target.value !== 'movie') {
    document.getElementById('inputType').value = '';
  }
  invalidateCatalogRequests();
  pendingTmdb = null;
  pendingAniList = null;
  document.getElementById('tmdbSearchInput').value = '';
  const results = document.getElementById('tmdbResults');
  results.classList.remove('visible');
  results.setAttribute('aria-busy', 'false');
  document.getElementById('tmdbSearchSpinner').classList.remove('visible');
  updateContentTypeFormUI(event.target.value, Boolean(editingId));
});

// ── TMDB SEARCH INPUT ──
document.getElementById('tmdbSearchInput').addEventListener('input', e => {
  const val = e.target.value.trim();
  clearTimeout(tmdbSearchTimer);
  if (!val || val.length < 2) {
    invalidateCatalogRequests();
    const results = document.getElementById('tmdbResults');
    results.classList.remove('visible');
    results.setAttribute('aria-busy', 'false');
    document.getElementById('tmdbSearchSpinner').classList.remove('visible');
    return;
  }
  tmdbSearchTimer = setTimeout(() => searchExternalCatalog(val), 350);
});

// ── SEARCH INPUT ──
document.getElementById('searchInput').addEventListener('input', e => {
  searchQuery = e.target.value.trim();
  document.getElementById('searchClear').classList.toggle('visible', searchQuery.length > 0);
  clearTimeout(searchRenderTimer);
  searchRenderTimer = setTimeout(render, 120);
});

// ── THEME TOGGLE ──
function toggleTheme() {
  const html = document.documentElement;
  const isLight = html.getAttribute('data-theme') === 'light';
  if (isLight) {
    html.removeAttribute('data-theme');
    try { localStorage.setItem('justlist_theme', 'dark'); } catch (error) { console.warn(error); }
  } else {
    html.setAttribute('data-theme', 'light');
    try { localStorage.setItem('justlist_theme', 'light'); } catch (error) { console.warn(error); }
  }
  updateThemeIcon();
}

function updateThemeIcon() {
  const isLight = document.documentElement.getAttribute('data-theme') === 'light';
  document.getElementById('themeIconDark').style.display = isLight ? 'none' : 'block';
  document.getElementById('themeIconLight').style.display = isLight ? 'block' : 'none';
  const toggle = document.getElementById('themeToggle');
  const nextThemeLabel = isLight ? 'Ativar tema escuro' : 'Ativar tema claro';
  toggle.setAttribute('aria-label', nextThemeLabel);
  toggle.title = nextThemeLabel;
  document.querySelector('meta[name="theme-color"]').content = isLight ? '#f5f5f5' : '#0d0d0d';
}

function loadSavedTheme() {
  let saved = null;
  try { saved = localStorage.getItem('justlist_theme'); } catch (error) { console.warn(error); }
  let theme = saved;
  if (!theme) {
    // Auto: segue preferência do sistema
    theme = window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
  }
  if (theme === 'light') {
    document.documentElement.setAttribute('data-theme', 'light');
  } else {
    document.documentElement.removeAttribute('data-theme');
  }
  updateThemeIcon();

  // Se o usuário ainda não escolheu, acompanha mudanças do sistema em tempo real
  if (!saved && window.matchMedia) {
    const mq = window.matchMedia('(prefers-color-scheme: light)');
    const handler = (e) => {
      try {
        if (localStorage.getItem('justlist_theme')) return;
      } catch (error) {
        console.warn(error);
      }
      if (e.matches) document.documentElement.setAttribute('data-theme', 'light');
      else document.documentElement.removeAttribute('data-theme');
      updateThemeIcon();
    };
    if (mq.addEventListener) mq.addEventListener('change', handler);
    else if (mq.addListener) mq.addListener(handler);
  }
}

// ── POSTER FROM URL ──
function loadPosterFromUrl() {
  const input = document.getElementById('inputPosterUrl');
  const url = input.value.trim();
  if (!url) { showToast('Cole o link da imagem primeiro.', 'error'); return; }
  const safeUrl = normalizeImageUrl(url);
  if (!safeUrl || !safeUrl.startsWith('https://')) {
    showToast('Cole um link HTTPS válido para a imagem.', 'error');
    input.focus();
    return;
  }
  currentPosterData = safeUrl;
  showPosterPreview(safeUrl);
  input.value = '';
  showToast('Imagem carregada!', 'success');
}

// ── INIT ──
loadSavedTheme();

// Recalcula overflow quando o grid muda de largura (resize de janela ou sidebar)
if (typeof ResizeObserver !== 'undefined') {
  const ro = new ResizeObserver(() => applyBadgeOverflow());
  const gridEl = document.getElementById('seriesGrid');
  if (gridEl) ro.observe(gridEl);
}
(async function init() {
  render(); // show skeletons immediately
  try {
    await initializeAuth();
  } catch (error) {
    console.error(error);
  }
  try {
    await loadData();
    syncPlatformOptionsFromSavedItems();
  } catch (error) {
    console.error(error);
    showToast('Não foi possível inicializar a lista.', 'error');
  } finally {
    isLoading = false;
    render();
  }
})();
