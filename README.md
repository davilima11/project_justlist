# JustList

Lista pessoal multiusuário para organizar séries, filmes, animes, mangás, manhwas e manhuas. Cada conta autenticada tem sua própria lista: os registros de uma pessoa não aparecem para outra.

## Recursos

- busca e filtros por conteúdo, origem, gênero e plataforma;
- visualização em grade ou lista e sorteio entre os resultados filtrados;
- importação de metadados do TMDB para séries, filmes e animes;
- importação de metadados do AniList para mangás, manhwas e manhuas;
- pôster por arquivo ou URL, com validação, redimensionamento e conversão para WebP;
- tema claro/escuro, layout responsivo e navegação por teclado;
- autenticação por link mágico, sem senha;
- sessão persistida no navegador;
- isolamento por usuário usando Supabase RLS;
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
index.html                    marcação e componentes da interface
src/app.js                    estado, autenticação, renderização e integrações
src/styles.css                estilos e responsividade
src/utils.js                  normalização, sanitização e utilitários puros
test/utils.test.js             testes unitários
supabase/multi-user-rls.sql   migração e políticas privadas por usuário
.github/workflows/            build e deploy do GitHub Pages
```

## Configuração do Supabase — passo a passo

A chave `anon` aparece no navegador por definição. A proteção dos dados vem das políticas Row Level Security (RLS), não de esconder essa chave.

### 1. Criar ou confirmar o projeto

Use o projeto Supabase já configurado no `src/app.js`. Não troque a URL ou a chave sem atualizar o arquivo e fazer um novo build.

### 2. Ativar login por e-mail

1. Abra **Authentication → Providers**.
2. Ative o provedor **Email**.
3. Mantenha o login por link mágico habilitado.
4. Permita novos cadastros, pois cada visitante poderá criar a própria conta pelo e-mail.

### 3. Configurar as URLs

Em **Authentication → URL Configuration**:

**Site URL**

```text
https://davilima11.github.io/project_justlist/
```

Adicione às **Redirect URLs**:

```text
https://davilima11.github.io/project_justlist/
http://localhost:5173/
```

### 4. Escolher a conta dona dos registros antigos

Antes de executar o SQL, abra **Authentication → Users** e crie ou confirme a conta que ficará com os registros antigos da lista original.

Anote o e-mail exatamente como aparece no Supabase.

### 5. Preparar a migração RLS

Abra [`supabase/multi-user-rls.sql`](supabase/multi-user-rls.sql) e substitua:

```text
SEU_EMAIL@EXEMPLO.COM
```

pelo e-mail real da conta dona dos registros antigos.

### 6. Executar a migração

1. No Supabase, abra **SQL Editor**.
2. Clique em **New query**.
3. Cole o conteúdo completo de `supabase/multi-user-rls.sql`.
4. Clique em **Run**.

O script:

- adiciona `user_id` à tabela `public.series`;
- associa registros antigos à conta escolhida;
- impede registros sem proprietário;
- remove políticas antigas da tabela;
- permite somente usuários autenticados lerem suas próprias linhas;
- permite inserir, editar e excluir somente as próprias linhas;
- cria um índice para acelerar a busca por usuário.

Se o script disser que o usuário não existe, pare, crie a conta em **Authentication → Users**, confira o e-mail no arquivo e execute novamente.

### 7. Conferir os registros

Abra **Table Editor → series** e confirme que a coluna `user_id` foi criada e que os registros antigos receberam o ID da conta dona.

### 8. Publicar a atualização

Depois de aplicar o SQL:

1. Faça merge da branch para `main`.
2. Em **Settings → Pages**, selecione **GitHub Actions** como origem.
3. Em **Actions**, aguarde o workflow `Deploy to GitHub Pages` terminar com sucesso.

O workflow publica o diretório `dist/`, que é o build correto do Vite.

## Como cada pessoa usa o site

1. A pessoa abre o site.
2. Clica em **Entrar**.
3. Informa o próprio e-mail.
4. Abre o link mágico recebido.
5. O Supabase cria ou recupera a conta.
6. O site consulta apenas as linhas cujo `user_id` pertence àquela conta.
7. Ao adicionar um título, o site grava automaticamente o `user_id` do usuário atual.

Visitantes sem login não visualizam a lista privada. Ao sair da conta, os títulos desaparecem da tela até que outra conta faça login; eles continuam salvos no banco.

## Sessão persistente

O login fica persistido no navegador e continua ativo após recarregar a página, até o usuário sair ou a sessão expirar. Como o GitHub Pages usa a origem compartilhada `davilima11.github.io`, publique o site em um domínio próprio dedicado quando possível para isolar melhor o armazenamento da sessão.

## GitHub Pages

O workflow publica `dist/` após cada push na branch `main`. Em **Settings → Pages → Build and deployment**, selecione **GitHub Actions** como origem. Isso é necessário porque o Vite precisa executar o build antes da publicação.

## Integrações e chaves públicas

As chamadas ao TMDB são feitas diretamente no navegador, então a chave da API também é pública no bundle. Para esconder essa credencial ou aplicar limites próprios, mova a chamada para uma função serverless/proxy. A integração com o AniList não usa chave.

URLs de pôster são aceitas somente via HTTPS; conteúdo dinâmico é escapado antes de entrar no HTML e a página aplica uma Content Security Policy restritiva.
