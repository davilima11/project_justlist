# JustList

Lista pessoal para organizar séries, filmes, animes, mangás, manhwas e manhuas. O catálogo é público para consulta, enquanto cadastro, edição e exclusão ficam disponíveis apenas para o proprietário autenticado.

## Recursos

- busca e filtros por conteúdo, origem, gênero e plataforma;
- visualização em grade ou lista e sorteio entre os resultados filtrados;
- importação de metadados do TMDB para séries, filmes e animes;
- importação de metadados do AniList para mangás, manhwas e manhuas;
- pôster por arquivo ou URL, com validação, redimensionamento e conversão para WebP;
- tema claro/escuro, layout responsivo e navegação por teclado;
- persistência no Supabase com snapshot local para leitura em caso de falha;
- login do proprietário por link mágico, sem senha;
- build e deploy automatizados no GitHub Pages.

## Stack

- HTML, CSS e JavaScript modular;
- Vite 8;
- Supabase JS 2;
- Node.js 20.19+ na linha 20, ou 22.12+;
- pnpm 11.

## Desenvolvimento local

```bash
pnpm install
pnpm dev
```

Verificações antes de enviar uma mudança:

```bash
pnpm run check
pnpm run build
```

`pnpm run check` valida a sintaxe e executa os testes unitários. O build de produção é gerado em `dist/`.

## Estrutura

```text
index.html                 marcação e componentes da interface
src/app.js                 estado, renderização e integrações
src/styles.css             estilos e responsividade
src/utils.js               normalização, sanitização e utilitários puros
test/utils.test.js         testes unitários
supabase/owner-rls.sql     políticas de acesso do banco
.github/workflows/         build e deploy do GitHub Pages
```

## Configurar o Supabase com segurança

A chave `anon` do Supabase aparece no navegador por definição. A proteção real dos dados deve ser feita por Row Level Security (RLS), e não escondendo essa chave.

1. No Supabase, habilite o provedor de autenticação por e-mail.
2. Em **Authentication → Users**, crie previamente o usuário proprietário. Depois desative novos cadastros públicos nas configurações de autenticação; o cliente também usa `shouldCreateUser: false`.
3. Em **Authentication → URL Configuration**, use como URL do site `https://davilima11.github.io/project_justlist/` e inclua também `http://localhost:5173/` nas URLs de redirecionamento para desenvolvimento.
4. Abra [`supabase/owner-rls.sql`](supabase/owner-rls.sql), substitua todas as ocorrências de `SEU_EMAIL@EXEMPLO.COM` pelo e-mail desse usuário e execute o script no SQL Editor.
5. Abra o site, clique em **Entrar** e use exatamente o e-mail configurado na política.

O script mantém leitura pública e bloqueia `insert`, `update` e `delete` para visitantes anônimos ou outras contas. Ele também remove políticas anteriores da tabela `series`; revise o arquivo antes de aplicá-lo se essa tabela for compartilhada com outro sistema.

O login fica persistido no navegador e continua ativo após recarregar a página, até o usuário sair ou a sessão expirar. Como o GitHub Pages usa a origem compartilhada `davilima11.github.io`, publique o site em um domínio próprio dedicado quando possível para isolar melhor o armazenamento da sessão.

## GitHub Pages

O workflow publica `dist/` após cada push na branch `main`. Em **Settings → Pages → Build and deployment**, selecione **GitHub Actions** como origem. Isso é necessário porque o Vite precisa executar o build antes da publicação.

## Integrações e chaves públicas

As chamadas ao TMDB são feitas diretamente no navegador, então a chave da API também é pública no bundle. Para esconder essa credencial ou aplicar limites próprios, mova a chamada para uma função serverless/proxy. A integração com o AniList não usa chave.

URLs de pôster são aceitas somente via HTTPS; conteúdo dinâmico é escapado antes de entrar no HTML e a página aplica uma Content Security Policy restritiva.
