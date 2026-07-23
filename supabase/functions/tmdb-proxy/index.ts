// JustList — TMDB proxy (Supabase Edge Function)
//
// Esconde a TMDB_API_KEY do bundle do navegador. O site chama esta função e
// ela repassa a requisição ao TMDB injetando a chave lida do secret.
//
// Rotas suportadas (todas via POST com corpo JSON):
//   { path: "search/tv",     query: { ... } }
//   { path: "search/movie",  query: { ... } }
//   { path: "tv/{id}",                       query: { ... } }
//   { path: "movie/{id}",                    query: { ... } }
//   { path: "tv/{id}/watch/providers",       query: { ... } }
//   { path: "movie/{id}/watch/providers",    query: { ... } }
//
// A função valida o `path`, mescla a query string recebida com defaults
// seguros (language=pt-BR, include_adult=false) e retorna o JSON cru do TMDB.
// Qualquer outro path retorna 400. Erros do TMDB são repassados com status 502.
//
// Deploy:
//   supabase functions deploy tmdb-proxy --project-ref <SEU_PROJECT_REF>
//   supabase secrets set TMDB_API_KEY=<sua_chave> --project-ref <SEU_PROJECT_REF>

export const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

// Prefixos permitidos. Qualquer path fora desta lista é rejeitado.
const ALLOWED_PATH_PREFIXES = [
  'search/tv',
  'search/movie',
  'tv/',
  'movie/',
];

function isPathAllowed(path: string): boolean {
  if (!path || typeof path !== 'string') return false;
  const normalized = path.replace(/^\/+/, '');
  return ALLOWED_PATH_PREFIXES.some(prefix => normalized.startsWith(prefix));
}

function jsonResponse(body: unknown, status = 200, extraHeaders: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      ...CORS_HEADERS,
      ...extraHeaders,
    },
  });
}

Deno.serve(async (req: Request) => {
  // Preflight CORS
  if (req.method === 'OPTIONS') {
    return new Response('ok', { status: 204, headers: CORS_HEADERS });
  }

  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed. Use POST.' }, 405, { Allow: 'POST, OPTIONS' });
  }

  const apiKey = Deno.env.get('TMDB_API_KEY');
  if (!apiKey) {
    console.error('TMDB_API_KEY secret não configurado.');
    return jsonResponse({ error: 'Proxy misconfigured: missing TMDB_API_KEY.' }, 500);
  }

  let body: { path?: unknown; query?: Record<string, string> };
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: 'Invalid JSON body.' }, 400);
  }

  const { path, query } = body;
  if (!isPathAllowed(path as string)) {
    return jsonResponse({ error: 'Path not allowed.' }, 400);
  }

  // Defaults de segurança: idioma e conteúdo adulto sempre controlados pelo proxy.
  const mergedQuery = new URLSearchParams({
    api_key: apiKey,
    language: 'pt-BR',
    ...(query && typeof query === 'object' ? query : {}),
  });
  // include_adult=false é forçado mesmo se o cliente tentar true.
  mergedQuery.set('include_adult', 'false');

  const tmdbUrl = `https://api.themoviedb.org/3/${(path as string).replace(/^\/+/, '')}?${mergedQuery.toString()}`;

  // Cache curto no cliente (CDN/edge) para reduzir custo de quota TMDB.
  const fetchInit: RequestInit & { cf?: Record<string, unknown> } = {
    method: 'GET',
    headers: {
      'Accept': 'application/json',
      'User-Agent': 'JustList-Proxy/1.0',
    },
  };

  try {
    const tmdbRes = await fetch(tmdbUrl, fetchInit);

    if (!tmdbRes.ok) {
      const text = await tmdbRes.text();
      console.error(`TMDB upstream error ${tmdbRes.status}: ${text}`);
      return jsonResponse(
        { error: 'TMDB upstream error', status: tmdbRes.status },
        502,
      );
    }

    const data = await tmdbRes.json();
    return jsonResponse(data, 200, {
      'Cache-Control': 'public, max-age=300', // 5 min
    });
  } catch (err) {
    console.error('Erro ao contatar TMDB:', err);
    return jsonResponse({ error: 'Failed to reach TMDB.' }, 502);
  }
});
