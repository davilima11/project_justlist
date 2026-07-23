export const LANGUAGE_STORAGE_KEY = 'justlist_language';
export const DEFAULT_LANGUAGE = 'pt-BR';
export const LANGUAGE_OPTIONS = [
  { value: 'en-US', name: 'English', region: 'en-US', short: 'EN' },
  { value: 'es-ES', name: 'Español', region: 'es-ES', short: 'ES' },
  { value: 'fr-FR', name: 'Français', region: 'fr-FR', short: 'FR' },
  { value: 'it-IT', name: 'Italiano', region: 'it-IT', short: 'IT' },
  { value: 'nl-NL', name: 'Nederlands', region: 'nl-NL', short: 'NL' },
  { value: 'pt-PT', name: 'Português', region: 'pt-PT', short: 'PT' },
  { value: 'pt-BR', name: 'Português', region: 'pt-BR', short: 'BR' },
  { value: 'ro-RO', name: 'Română', region: 'ro-RO', short: 'RO' },
];
export const SUPPORTED_LANGUAGES = LANGUAGE_OPTIONS.map(option => option.value);

const messages = {
  'pt-BR': {
    skip: 'Pular para o conteúdo',
    searchLabel: 'Pesquisar títulos',
    searchPlaceholder: 'Pesquisar séries, filmes e animes...',
    clearSearch: 'Limpar pesquisa',
    account: 'Conta',
    signIn: 'Entrar',
    signOut: 'Sair',
    filters: 'Filtros',
    hideFilters: 'Esconder filtros',
    showFilters: 'Mostrar filtros',
    clear: 'Limpar',
    clearAll: 'Limpar todos',
    content: 'Conteúdo',
    origin: 'Origem',
    genre: 'Gênero',
    genres: 'Gêneros',
    platform: 'Plataforma',
    platforms: 'Plataformas',
    series: 'Séries',
    movie: 'Filmes',
    anime: 'Animes',
    add: 'Adicionar',
    addWhat: 'O que deseja adicionar?',
    addSeries: 'Adicionar série',
    addMovie: 'Adicionar filme',
    addAnime: 'Adicionar anime',
    searchSeries: 'Buscar série no TMDB · preencher automaticamente',
    searchMovie: 'Buscar filme no TMDB · preencher automaticamente',
    searchAnime: 'Buscar anime no TMDB · preencher automaticamente',
    manual: 'ou preencha manualmente',
    random: 'Sortear',
    grid: 'Grade',
    list: 'Lista',
    save: 'Salvar',
    cancel: 'Cancelar',
    close: 'Fechar',
    language: 'Idioma',
    portuguese: 'Português',
    english: 'Inglês',
    noResults: 'Nenhum resultado',
    noResultsDescription: 'Nenhum título corresponde aos filtros ou à pesquisa atual.',
    emptyList: 'Sua lista está vazia',
    emptyListDescription: 'Comece adicionando uma série, filme ou anime. O TMDB pode preencher os dados automaticamente.',
    signInToSeeList: 'Entre para ver sua lista',
    signInDescription: 'Entre ou crie uma conta para acessar sua lista particular e adicionar seus títulos.',
    firstTitle: 'Adicionar primeiro título',
    signInOrCreate: 'Entrar ou criar conta',
    resultsShowing: 'Mostrando',
    titles: 'títulos',
    title: 'título',
    registered: 'cadastrado',
    registeredPlural: 'cadastrados',
    sortHint: 'Sortear entre {count} {label} dos resultados atuais',
    noTitlesAvailable: 'Nenhum título disponível nos resultados atuais',
    selectedFilter: 'Remover filtro {filter}: {value}',
    noGenre: 'Nenhum gênero informado.',
    noPlatform: 'Nenhuma plataforma informada.',
    noSynopsis: 'Sem sinopse cadastrada.',
    details: 'Detalhes',
    type: 'Tipo',
    year: 'Ano',
    yearFilter: 'Ano de lançamento',
    yearStart: 'Ano inicial',
    yearEnd: 'Ano final',
    loadMore: 'Carregar mais',
    loadingMore: 'Carregando mais…',
    loadedCount: 'Mostrando {shown} de {total}',
    resultOfDraw: 'Resultado do sorteio',
    authTitle: 'Entrar ou criar uma conta',
    authDescription: 'Entre com sua conta Google ou informe seu e-mail para receber um link de acesso. Sua lista permanece particular.',
    emailLogin: 'ou entre com seu e-mail',
    email: 'E-mail',
    sendLink: 'Enviar link de acesso',
    poster: 'Capa / pôster',
    load: 'Carregar',
    synopsis: 'Sinopse',
    selectOrigin: 'Selecione a origem',
  },
  en: {
    skip: 'Skip to content',
    searchLabel: 'Search titles',
    searchPlaceholder: 'Search series, movies and anime...',
    clearSearch: 'Clear search',
    account: 'Account',
    signIn: 'Sign in',
    signOut: 'Sign out',
    filters: 'Filters',
    hideFilters: 'Hide filters',
    showFilters: 'Show filters',
    clear: 'Clear',
    clearAll: 'Clear all',
    content: 'Content',
    origin: 'Origin',
    genre: 'Genre',
    genres: 'Genres',
    platform: 'Platform',
    platforms: 'Platforms',
    series: 'Series',
    movie: 'Movies',
    anime: 'Anime',
    add: 'Add',
    addWhat: 'What would you like to add?',
    addSeries: 'Add series',
    addMovie: 'Add movie',
    addAnime: 'Add anime',
    searchSeries: 'Search series on TMDB · fill automatically',
    searchMovie: 'Search movie on TMDB · fill automatically',
    searchAnime: 'Search anime on TMDB · fill automatically',
    manual: 'or fill in manually',
    random: 'Random',
    grid: 'Grid',
    list: 'List',
    save: 'Save',
    cancel: 'Cancel',
    close: 'Close',
    language: 'Language',
    portuguese: 'Portuguese',
    english: 'English',
    noResults: 'No results',
    noResultsDescription: 'No title matches the current filters or search.',
    emptyList: 'Your list is empty',
    emptyListDescription: 'Start by adding a series, movie, or anime. TMDB can fill in the details automatically.',
    signInToSeeList: 'Sign in to see your list',
    signInDescription: 'Sign in or create an account to access your private list and add titles.',
    firstTitle: 'Add your first title',
    signInOrCreate: 'Sign in or create account',
    resultsShowing: 'Showing',
    titles: 'titles',
    title: 'title',
    registered: 'registered',
    registeredPlural: 'registered',
    sortHint: 'Randomize among {count} {label} in the current results',
    noTitlesAvailable: 'No titles available in the current results',
    selectedFilter: 'Remove {filter} filter: {value}',
    noGenre: 'No genres informed.',
    noPlatform: 'No platforms informed.',
    noSynopsis: 'No synopsis available.',
    details: 'Details',
    type: 'Type',
    year: 'Year',
    yearFilter: 'Release year',
    yearStart: 'Start year',
    yearEnd: 'End year',
    loadMore: 'Load more',
    loadingMore: 'Loading more…',
    loadedCount: 'Showing {shown} of {total}',
    resultOfDraw: 'Random result',
    authTitle: 'Sign in or create an account',
    authDescription: 'Sign in with Google or enter your email to receive an access link. Your list stays private.',
    emailLogin: 'or sign in with email',
    email: 'Email',
    sendLink: 'Send access link',
    poster: 'Cover / poster',
    load: 'Load',
    synopsis: 'Synopsis',
    selectOrigin: 'Select an origin',
  },
};

const valueTranslations = {
  'pt-BR': {
    series: 'Séries', movie: 'Filmes', anime: 'Animes', Outros: 'Outros',
    Ação: 'Ação', Comédia: 'Comédia', Crime: 'Crime', Detetive: 'Detetive',
    Direito: 'Direito', Drama: 'Drama', Escola: 'Escola', Esportes: 'Esportes',
    Família: 'Família', Fantasia: 'Fantasia', 'Ficção científica': 'Ficção científica',
    Histórico: 'Histórico', Militar: 'Militar', Médico: 'Médico', Negócios: 'Negócios',
    Político: 'Político', Romance: 'Romance', Suspense: 'Suspense', Terror: 'Terror', Vida: 'Vida',
    China: 'China', Coreia: 'Coreia', EUA: 'EUA', Espanha: 'Espanha', Japão: 'Japão', Turquia: 'Turquia',
  },
  en: {
    series: 'Series', movie: 'Movies', anime: 'Anime', Outros: 'Other',
    Ação: 'Action', Comédia: 'Comedy', Crime: 'Crime', Detetive: 'Detective',
    Direito: 'Legal', Drama: 'Drama', Escola: 'School', Esportes: 'Sports',
    Família: 'Family', Fantasia: 'Fantasy', 'Ficção científica': 'Science fiction',
    Histórico: 'Historical', Militar: 'Military', Médico: 'Medical', Negócios: 'Business',
    Político: 'Political', Romance: 'Romance', Suspense: 'Thriller', Terror: 'Horror', Vida: 'Slice of life',
    China: 'China', Coreia: 'Korea', EUA: 'USA', Espanha: 'Spain', Japão: 'Japan', Turquia: 'Turkey',
  },
};

const contentTypeLabels = {
  'pt-BR': { series: 'Série', movie: 'Filme', anime: 'Anime' },
  en: { series: 'Series', movie: 'Movie', anime: 'Anime' },
};

function isPortugueseLanguage(language) {
  return String(language || '').toLowerCase().startsWith('pt');
}

function getMessageSet(language) {
  return messages[language] || (isPortugueseLanguage(language) ? messages['pt-BR'] : messages.en);
}

export function isEnglishLanguage(language = getLanguage()) {
  return !isPortugueseLanguage(language);
}

export function getLanguage() {
  try {
    const saved = localStorage.getItem(LANGUAGE_STORAGE_KEY);
    const normalized = saved === 'en' ? 'en-US' : saved;
    return SUPPORTED_LANGUAGES.includes(normalized) ? normalized : DEFAULT_LANGUAGE;
  } catch {
    return DEFAULT_LANGUAGE;
  }
}

export function setLanguage(language) {
  const normalized = language === 'en' ? 'en-US' : language;
  const next = SUPPORTED_LANGUAGES.includes(normalized) ? normalized : DEFAULT_LANGUAGE;
  try { localStorage.setItem(LANGUAGE_STORAGE_KEY, next); } catch { /* storage can be unavailable */ }
  return next;
}

export function t(key, replacements = {}) {
  const value = getMessageSet(getLanguage())[key] || messages[DEFAULT_LANGUAGE][key] || key;
  return String(value).replace(/\{(\w+)\}/g, (_, name) => replacements[name] ?? '');
}

export function translateValue(value, language = getLanguage()) {
  const key = String(value ?? '');
  const fallbackLanguage = isPortugueseLanguage(language) ? DEFAULT_LANGUAGE : 'en';
  return valueTranslations[language]?.[key] || valueTranslations[fallbackLanguage]?.[key] || key;
}

export function translateContentType(value, language = getLanguage()) {
  const key = String(value ?? 'series');
  const fallbackLanguage = isPortugueseLanguage(language) ? DEFAULT_LANGUAGE : 'en';
  return contentTypeLabels[language]?.[key] || contentTypeLabels[fallbackLanguage]?.[key] || contentTypeLabels[DEFAULT_LANGUAGE].series;
}

export function applyLanguage() {
  const language = getLanguage();
  document.documentElement.lang = language;

  const textTargets = {
    '#authModalTitle': 'authTitle',
    '#authModalDescription': 'authDescription',
    '#authEmailLabel': 'email',
    '#authEmailDivider': 'emailLogin',
    '#authSubmitLabel': 'sendLink',
    '#formPosterLabel': 'poster',
    '#inputSynopsisLabel': 'synopsis',
  };
  Object.entries(textTargets).forEach(([selector, key]) => {
    const element = document.querySelector(selector);
    if (element) element.textContent = t(key);
  });

  document.querySelectorAll('[data-i18n]').forEach(element => {
    element.textContent = t(element.dataset.i18n);
  });
  document.querySelectorAll('[data-i18n-placeholder]').forEach(element => {
    element.placeholder = t(element.dataset.i18nPlaceholder);
  });
  document.querySelectorAll('[data-i18n-label]').forEach(element => {
    element.setAttribute('aria-label', t(element.dataset.i18nLabel));
  });
  document.querySelectorAll('[data-i18n-title]').forEach(element => {
    element.title = t(element.dataset.i18nTitle);
  });

  document.querySelectorAll('[data-filter][data-value], .genre-chip[data-value], .platform-chip[data-value]').forEach(element => {
    element.textContent = translateValue(element.dataset.value, language);
  });
  document.querySelectorAll('#inputContentType option, #inputType option').forEach(option => {
    if (option.value) option.textContent = translateValue(option.value, language);
    else option.textContent = isEnglishLanguage(language) ? 'Select an origin' : 'Selecione a origem';
  });

  const selector = document.getElementById('languageSelect');
  if (selector) selector.value = language;
  const languageOption = LANGUAGE_OPTIONS.find(option => option.value === language) || LANGUAGE_OPTIONS.find(option => option.value === DEFAULT_LANGUAGE);
  const languageTriggerLabel = document.getElementById('languageTriggerLabel');
  const languageMenu = document.getElementById('languageMenu');
  if (languageTriggerLabel && languageOption) languageTriggerLabel.textContent = languageOption.short;
  languageMenu?.querySelectorAll('[data-language-option]').forEach(option => {
    option.setAttribute('aria-selected', String(option.dataset.languageOption === language));
  });
  const meta = document.querySelector('meta[name="description"]');
  if (meta) meta.content = isEnglishLanguage(language)
    ? 'Organize series, movies, and anime in your personal list.'
    : 'Organize séries, filmes e animes em uma lista pessoal.';
  const title = document.querySelector('title');
  if (title) title.textContent = isEnglishLanguage(language)
    ? 'JustList — Series, Movies and Anime'
    : 'JustList — Séries, Filmes e Animes';
}
