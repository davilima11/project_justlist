# TMDB Proxy — JustList

Edge Function para o Supabase que esconde a `TMDB_API_KEY` do bundle do navegador.
Sem ela, a chave fica exposta no `src/app.js` e qualquer um pode usar sua cota do TMDB.

## Por que existe

O JustList é um site estático (Vite + GitHub Pages). Chamadas ao TMDB precisam
da `api_key` na URL, e qualquer chave no cliente é pública por definição. A
proteção real contra abuso só acontece no servidor. Esta Edge Function injeta a
chave no servidor e repassa a resposta do TMDB.

## Pré-requisitos

- Supabase CLI (`npm i -g supabase` ou `brew install supabase/tap/supabase`)
- Projeto Supabase já configurado (o mesmo do `src/app.js`)

## Deploy

```bash
# 1. Definir a chave do TMDB como secret (uma única vez)
supabase secrets set TMDB_API_KEY=<sua_chave_tmdb> \
  --project-ref <SEU_PROJECT_REF>

# 2. Deploy da função
supabase functions deploy tmdb-proxy \
  --project-ref <SEU_PROJECT_REF>
```

Após o deploy, a função ficará disponível em:
```
https://<SEU_PROJECT_REF>.supabase.co/functions/v1/tmdb-proxy
```

## Como o site a chama

O `src/app.js` faz POSTs no formato:

```json
{
  "path": "search/tv",
  "query": { "query": "breaking bad", "page": "1" }
}
```

O proxy injeta `api_key`, `language=pt-BR`, `include_adult=false` e retorna o JSON do TMDB.

## Pontos do código que mudaram

- `src/app.js`: removida a constante `TMDB_API_KEY` e trocadas as 3 chamadas `fetch` ao TMDB para chamarem o proxy.
- Variável `TMDB_PROXY_URL` (em `src/app.js`) é a URL da Edge Function; em dev local, pode ser substituída por uma mock se necessário.

## Teste rápido

```bash
curl -X POST https://<PROJECT>.supabase.co/functions/v1/tmdb-proxy \
  -H "Content-Type: application/json" \
  -d '{"path":"search/tv","query":{"query":"breaking bad"}}'
```

Resposta esperada: JSON do TMDB com resultados de busca.
