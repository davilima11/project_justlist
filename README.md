# JustList

**JustList** é uma plataforma para organizar suas séries favoritas, permitindo cadastrar títulos, gêneros, plataformas e pôsteres. Site estático, hospedado no GitHub Pages.

## Funcionalidades

- Cadastro de séries com nome, tipo (país), gêneros, plataforma, sinopse e pôster
- **Integração com TMDB**: busca por título e preenche automaticamente nome, sinopse (em pt-BR), pôster oficial, país e gêneros
- **Trailer automático**: quando o TMDB tiver trailer disponível, um botão aparece no modal de detalhe e abre o vídeo embutido (YouTube)
- Filtros por tipo, gênero e plataforma
- Pesquisa por nome
- Visualização em grade ou lista
- Tema claro/escuro
- Persistência via Supabase (com fallback para localStorage)
- Responsivo para mobile

## Como usar a integração TMDB

1. Clique em **Adicionar**
2. No topo do formulário, digite o nome da série em "Buscar no TMDB"
3. Selecione o resultado correto — campos serão preenchidos automaticamente (pôster, sinopse, país, gêneros)
4. Escolha a **plataforma** manualmente e clique em **Salvar**
5. Se um trailer estiver disponível, ele aparece no modal de detalhe da série

## Configuração

O arquivo `index.html` contém duas constantes que podem ser substituídas:

```js
// TMDB (obtenha sua chave em https://www.themoviedb.org/settings/api)
const TMDB_API_KEY = '...';

// Supabase (Project Settings > Data API)
const SUPABASE_URL = '...';
const SUPABASE_ANON_KEY = '...';
```
