# BIFFI.ONLINE — Notas do Projeto

## Site
- **URL:** https://biffi.online
- **Hospedagem:** GitHub Pages
- **Repositório:** https://github.com/Silvio-Velicka/BIFFI.ONLINE
- **Deploy:** rodar `deploy.bat` ou `git add -A && git commit -m "msg" && git push`

## Páginas existentes
| Arquivo | Título | Status |
|---|---|---|
| index.html | Home (landing page) | ✅ Completo |
| missao.html | Missão | ⚠️ Placeholder "conteúdo em breve" |
| sobre.html | Quem sou (biografia) | ⚠️ Aguarda conteúdo real |
| o-sonho.html | O Sonho | ⚠️ Placeholder "conteúdo em breve" |
| biblioteca.html | Biblioteca de Oração | ✅ Com trilhas e materiais de exemplo (conteúdo ainda genérico, a adaptar para o tema de oração) |
| cafe.html | Sala de Oração | ✅ Com receitas e meditações (conteúdo ainda genérico, a adaptar para o tema de oração) |
| loja.html | Lojinha (e-commerce completo — ver seção própria abaixo) | ✅ |
| checkout.html | Finalizar compra (endereço + pagamento) | ✅ |
| meus-pedidos.html | Histórico de pedidos do cliente | ✅ |
| parcerias.html | Parcerias | ⚠️ Placeholder "conteúdo em breve" |
| blog.html | Blog | ✅ Com posts de exemplo — fora do menu principal, arquivo mantido mas sem link na navegação |
| estudos.html | Biblioteca (cópia própria, mesmo conteúdo de biblioteca.html) | ✅ |
| dashboard.html | (redireciona → index.html) | ✅ |

## Navegação (barra lateral esquerda — sessão 10/07/2026)
A navegação era um header horizontal fixo no topo, com ícones emoji + label
embaixo. Agora é uma **barra lateral fixa à esquerda** (`header.sidebar`,
220px de largura, altura total da tela), com fundo amadeirado (gradiente
marrom escuro + `repeating-linear-gradient` sutil simulando veios de madeira).
No topo da barra: o logotipo (`logo-teologia-que-motiva.png`), em tamanho
máximo (`width:100%; max-width:190px`, preenchendo a largura útil da barra) —
**o texto "BIFFI.ONLINE" abaixo do logo foi removido** (`.sidebar-logo-text` e
o `<span>` correspondente não existem mais; o `alt` da imagem continua
"BIFFI.ONLINE" para acessibilidade). Abaixo do logo: os itens do menu, um
embaixo do outro, **apenas texto, sem ícones/emojis** (antes cada item tinha
um emoji grande + label pequeno; isso foi removido a pedido — "sem desenhos").

**index.html (home) — hero com o logotipo em 400x400px:** a imagem do hero
(antes "Capa BIFFI .jpeg", a capa do livro, 240×360) foi trocada pelo próprio
logotipo (`logo-teologia-que-motiva.png`), exibido a `400x400px`,
`object-fit: contain` (sem crop/box-shadow de capa de livro — só o
`drop-shadow` suave do wrapper `.hero-book`), centralizado na tela junto com
o texto de boas-vindas. No mobile, reduz para 200x200px.

Ordem dos itens: Missão → Quem sou → O Sonho → Biblioteca de Oração → Sala de
Oração → Lojinha → Parcerias → Game Relax.
- Mapeamento: Missão = missao.html · Quem sou = sobre.html · O Sonho =
  o-sonho.html · Biblioteca de Oração = biblioteca.html · Sala de Oração =
  cafe.html · Lojinha = loja.html · Parcerias = parcerias.html · Game Relax =
  NectarMine/index.html.
- Aplicado nas 10 páginas com nav completo: index, missao, sobre, o-sonho,
  biblioteca, cafe, loja, estudos, blog, parcerias. `checkout.html` e
  `meus-pedidos.html` mantiveram o header simples (logo + link "voltar à
  loja") — não entraram nesta troca. `admin/` tem seu próprio sidebar interno,
  não mexido. `leitor.html` (modo leitura) não mexido.
- Como o conteúdo agora abre à esquerda: `body { padding-left: 220px }` (ou
  130px no mobile, `@media max-width:700px`, onde a barra fica mais estreita
  e o texto menor). O rodapé (`footer`, fixo embaixo) também passou a começar
  em `left: 220px` (130px no mobile) pra não ficar atrás da barra.
- Na Lojinha, o botão do carrinho (antes um ícone circular no header) virou
  um botão de texto ("Carrinho" + contador) fixado na base da barra lateral
  via `margin-top: auto` dentro do `header.sidebar` (que é `flex-direction:
  column`).
- `js/site-auth.js` — o widget de login/logout injetado no `<nav>` (usuário
  logado / botão Sair / link Entrar) também deixou de usar ícone, agora é só
  texto, pra combinar com o resto do menu.
- "Blog" (blog.html) e "Estudos" (estudos.html, que é uma cópia de
  biblioteca.html) continuam fora do menu — arquivos existem mas sem link na
  navegação, como já era antes.
- "Game Relax" abre na mesma aba: NectarMine/index.html (dentro do próprio
  domínio biffi.online — importante para anúncios/monetização). O front-end é
  a cópia estática servida pelo GitHub Pages; ele fala com o backend do
  Railway por baixo dos panos (ver abaixo).
- missao.html, o-sonho.html e parcerias.html continuam com aviso "conteúdo em
  breve" — conteúdo definitivo ainda por vir.

## NectarMine (jogo) — front-end no próprio domínio, backend no Railway
- **URL que o usuário vê:** https://biffi.online/NectarMine/ (GitHub Pages, mesmo domínio do site — bom para AdSense/anúncios)
- **Onde roda o backend (banco de dados):** Railway (projeto "sweet-endurance", serviço "BIFFI.ONLINE", repo Silvio-Velicka/BIFFI.ONLINE, Root Directory = /NectarMine)
- **URL direta do backend:** https://biffionline-production.up.railway.app (não usar como link público — só existe para o front-end conversar com o banco via API)
- **Como funciona:** `NectarMine/js/api.js` detecta o domínio: se a página estiver em biffi.online (ou qualquer domínio que não seja o Railway/localhost), todas as chamadas de API (`/api/register`, `/api/login`, etc.) são enviadas automaticamente para a URL do Railway acima, via CORS (liberado em `server.js` com `Access-Control-Allow-Origin: *`, sem uso de cookies). Assim o usuário nunca sai do domínio biffi.online, mas os dados vão pro banco real.
- **Deploy:** automático a cada push em `main` — GitHub Pages republica a cópia estática (biffi.online/NectarMine) e o Railway republica o backend, ambos a partir do mesmo repositório.
- **Backend:** Node.js 22+ (`node:sqlite`), zero dependências — `NectarMine/server/server.js`, start command `node server/server.js` (via package.json)
- **Banco:** SQLite persistido em volume Railway `biffi.online-volume`, montado em `/data`; variável `DB_PATH=/data/nectarmine.db`

## Login unificado do site — sessão 09/07/2026
Antes, só a loja (no checkout) e o jogo pediam login — as páginas principais do
site (Home, Missão, Sobre, etc.) não sabiam se o visitante estava logado ou
não, e não tinha nenhum link de "Entrar" fora da loja/jogo. Agora o site
inteiro mostra o mesmo estado de login, usando a mesma conta/token
(`localStorage.nm_token`) do jogo NectarMine — quem já logou uma vez consegue
navegar, comprar na loja e jogar sem precisar entrar de novo em cada lugar.

- **Arquivo novo:** `js/site-auth.js` — inclui em index.html, missao.html,
  sobre.html, o-sonho.html, biblioteca.html, cafe.html, blog.html,
  estudos.html, parcerias.html, loja.html, checkout.html e meus-pedidos.html.
  (Não é usado dentro de `NectarMine/` — lá o próprio jogo já resolve isso via
  `NectarMine/js/api.js`, que segue funcionando exatamente como antes.)
- **O que ele mostra:** nas páginas com o menu de ícones (Home, Missão, Sobre
  etc. e a loja), aparece um ícone a mais no menu — "🔑 Entrar" se ninguém
  estiver logado, ou "👤 <usuário>" + "🚪 Sair" se estiver. Em checkout.html e
  meus-pedidos.html (que têm um cabeçalho mais simples, sem o menu de ícones),
  o mesmo aviso aparece ao lado do link "Voltar à loja".
- **Deslogar automático (o pedido principal desta sessão):** antes, `checkout.html`
  e `meus-pedidos.html` só olhavam se *existia* um token guardado no
  navegador — nunca confirmavam com o servidor se aquele token ainda era
  válido. Um token vencido (sessão dura 30 dias) ou de alguma forma inválido
  deixava a tela "quebrada" (formulário aparecia, mas a compra falhava sem
  explicação). Agora todo mundo usa `SITE_AUTH.verificar()`, que consulta
  `GET /api/me` de verdade; se o servidor responder que o token não é válido
  (vencido, revogado ou inexistente), o token é apagado do navegador na hora
  e a página volta a mostrar "Entrar", em vez de ficar com uma sessão quebrada.
- **Logout:** o botão "Sair" (em qualquer página) chama `POST /api/logout`
  (revoga a sessão no servidor) e limpa o token local, do mesmo jeito que o
  "Sair" de dentro do jogo.
- **Testado localmente (09/07/2026):** rotina de teste rodando o servidor com
  banco temporário — token válido → `/api/me` responde 200; token
  inexistente/forjado → 401; sessão marcada como expirada manualmente no
  banco → 401; depois de `/api/logout`, o mesmo token passa a responder 401.
  Também testado com um DOM simulado (jsdom) carregando o `site-auth.js` de
  verdade: com token válido mostra usuário + Sair; sem token mostra Entrar;
  com token inválido, limpa o token e cai para Entrar — em ambos os estilos
  de cabeçalho (menu de ícones e cabeçalho simples).

## Lojinha (E-commerce) — sessão 09/07/2026
A lojinha (`loja.html`) virou um e-commerce de verdade, usando **o mesmo banco/backend do jogo NectarMine** (mesmo Railway, mesmo SQLite) — só foram acrescentadas tabelas novas, sem mexer no que já existia. O login também é o mesmo: quem já tem conta no jogo já pode comprar, sem cadastro separado.

### Como o carrinho funciona
- O carrinho fica **no navegador do cliente** (`localStorage`, chave `biffi_cart`) — não existe tabela de carrinho no banco. Só quando o cliente clica em "Finalizar compra" o carrinho vira um pedido de verdade no servidor.
- Arquivo `js/shop-api.js` (raiz do site): objeto `SHOP_API` (chamadas HTTP) + objeto `CART` (carrinho em localStorage), reaproveitado por `loja.html`, `checkout.html` e `meus-pedidos.html`.
- Login: usa o mesmo token `nm_token` do `localStorage` que o jogo já usa — por isso quem já está logado no Game Relax já aparece logado na loja automaticamente.

### Páginas novas
- **`checkout.html`**: exige login (se não tiver `nm_token`, manda para `NectarMine/login.html?redirect=../checkout.html` — o login.html foi ajustado para voltar pra essa URL depois de entrar). Formulário de endereço (com autopreenchimento por CEP via ViaCEP, API pública gratuita), CPF, telefone, e escolha da forma de pagamento.
- **`meus-pedidos.html`**: histórico de pedidos do cliente logado, com status colorido (aguardando pagamento / pago / enviado / entregue / cancelado).

### Banco de dados — tabelas novas (em `NectarMine/server/server.js`)
- `produtos` — nome, descrição, preço (em centavos), imagem (emoji OU nome de arquivo de imagem), categoria, estoque, destaque, ativo, ordem. Semeado automaticamente com os 5 produtos que já existiam na loja (Livro BIFFI + 4 itens).
- `pedidos` — cliente, status, método de pagamento, valores (subtotal/frete/total em centavos), endereço completo "congelado" no momento da compra (não muda se o cliente editar o endereço depois).
- `pedido_itens` — itens de cada pedido, com nome e preço "congelados" no momento da compra (preço nunca é confiado vindo do navegador do cliente — o servidor sempre confere no banco).
- `enderecos` — endereços salvos do cliente, para reaproveitar em compras futuras.
- `users` ganhou 3 colunas novas: `nome_completo`, `cpf`, `telefone` (o jogo não usa essas colunas, só a loja).

### Frete
Regra simples por enquanto: grátis acima de R$150, senão R$15 fixo (função `calcularFrete` no server.js). Fácil de trocar depois por cálculo real via CEP/transportadora.

### Pagamento — Mercado Pago e PayPal (estrutura pronta, chaves pendentes)
Como decidido, o pagamento será via **Mercado Pago e/ou PayPal**, mas as contas/chaves ainda não existem. Por isso o código já está pronto, só falta configurar as variáveis de ambiente no Railway quando as chaves existirem:

| Variável (Railway → serviço → Variables) | Para quê |
|---|---|
| `MP_ACCESS_TOKEN` | Access Token do Mercado Pago (Checkout Pro) |
| `PAYPAL_CLIENT_ID` / `PAYPAL_CLIENT_SECRET` | Credenciais do app PayPal |
| `PAYPAL_MODE` | `sandbox` (teste) ou `live` (produção) — se não definir, usa sandbox |

**Enquanto essas variáveis não existirem**, o checkout cai automaticamente no modo manual: o pedido é registrado normalmente no banco com status `aguardando_pagamento`, e o cliente vê o aviso "entraremos em contato para combinar o pagamento (PIX/transferência)". Nenhuma mudança de código é necessária depois — assim que as chaves forem cadastradas no Railway, os botões de Mercado Pago/PayPal passam a gerar um link de pagamento de verdade automaticamente.

Webhooks já reservados (ainda sem validação de assinatura, é um TODO no código):
- `POST /api/payments/mercadopago/webhook`
- `POST /api/payments/paypal/webhook`

### Rotas de API novas
Públicas: `GET /api/shop/products`, `GET /api/shop/products/:id`.
Do cliente logado (header `Authorization: Bearer <token>`, mesmo token do jogo): `GET/PUT /api/me/perfil`, `POST /api/me/enderecos`, `POST /api/checkout`, `GET /api/shop/pedidos`, `GET /api/shop/pedidos/:id`.
Do admin (header `x-admin-key`, mesma chave `ADMIN_KEY` do painel): `GET/POST /api/admin/products`, `PUT/DELETE /api/admin/products/:id`, `GET /api/admin/pedidos`, `PUT /api/admin/pedidos/:id`.

### Painel admin — módulos novos
- **🛒 Produtos**: cadastrar produto novo (nome, preço, descrição, imagem, categoria, estoque, destaque) e editar/excluir os existentes direto na lista.
- **📦 Pedidos**: lista todos os pedidos com dados do cliente/endereço/total, com um seletor pra mudar o status (aguardando pagamento → pago → enviado → entregue, ou cancelado).

### Testado localmente (09/07/2026)
Fluxo completo testado rodando o server.js localmente: cadastro/login, listagem de produtos, checkout (com e sem gateway configurado), verificação de estoque/produto inválido, salvamento automático de CPF/telefone no perfil, histórico de pedidos, e todas as rotas de admin (criar/editar produto, listar/atualizar status de pedido) — inclusive os bloqueios de segurança (401 sem login, 403 sem chave de admin).

## Livraria Digital (e-book protegido) — sessão 09/07/2026
O "Livro BIFFI" agora também é vendido como **e-book**: quem compra lê direto no navegador (celular ou PC), folheando as páginas com efeito 3D realista, sem nunca ter acesso ao arquivo original.

### Como funciona a proteção
Nenhuma tecnologia web impede 100% print de tela — isso é uma limitação física, não de código. O que foi implementado cobre tudo o que dá pra cobrir:
- O PDF original **nunca** fica em pasta pública do site. As páginas foram convertidas em imagens (PNG) e guardadas em `NectarMine/server/biblioteca-privada/mulheres-na-teologia/` — uma pasta dentro de `server/`, que o próprio servidor já bloqueia de ser acessada diretamente (mesma regra que protege o banco de dados).
- Cada página só é entregue pela rota `GET /api/livraria/:produtoId/pagina/:n`, que exige: login válido + compra confirmada (pedido com status pago/enviado/entregue) daquele produto específico.
- Toda página é gerada **na hora**, com marca d'água aplicada automaticamente: uma marca diagonal repetida (tênue) com o e-mail do leitor, e uma faixa legível no rodapé com usuário + e-mail + data/hora do acesso. Se uma imagem vazar, dá pra saber exatamente de qual conta ela saiu.
- Resposta sempre com `Cache-Control: no-store` — o navegador não guarda cópia.
- Limite de 90 requisições de página por minuto por usuário, pra dificultar um script tentando baixar o livro inteiro de uma vez.
- `leitor.html` carrega só uma "janela" de páginas por vez (a atual ± 2), nunca o livro inteiro de uma vez, e libera da memória as páginas que ficaram para trás.
- Bloqueios de deterrência no leitor: clique-direito, seleção de texto, arrastar imagem, atalhos comuns de inspecionar (F12, Ctrl+Shift+I/J/C, Ctrl+U) e impressão via CSS `@media print`.

### O leitor (`leitor.html?produto=<id>`)
Efeito de virar página feito com a biblioteca **StPageFlip** (`page-flip` no npm, carregada via CDN jsDelivr) — funciona com mouse (PC) e touch/swipe (celular). Exige login (reaproveita o mesmo `nm_token` do jogo); se não estiver logado, redireciona para `NectarMine/login.html?redirect=...` e volta pro leitor depois de entrar.

Link de acesso: aparece automaticamente em `meus-pedidos.html` (seção "📚 Meus e-books") para quem já comprou.

### Banco de dados — tabela nova
```
livros_digitais (produto_id, slug, total_paginas)
```
Liga um `produto` da loja a uma pasta de páginas. **O vínculo é automático**: ao iniciar, o servidor verifica se existe a pasta `biblioteca-privada/<slug>` com páginas e, se o produto ainda não estiver marcado como e-book, faz o vínculo sozinho (ver `vinculosAutomaticos` em `server.js`) — não precisa chamar nenhuma API manualmente depois do deploy. Hoje só há um vínculo configurado: `Livro BIFFI → mulheres-na-teologia` (124 páginas).

### Conversão do PDF → páginas
O PDF enviado (`Livros/Mulheres na Teologia - Veronica Biffi..pdf`, 124 páginas) foi convertido para PNG a 150 DPI (~915×1360px por página, ~150KB cada) e as imagens foram colocadas em `NectarMine/server/biblioteca-privada/mulheres-na-teologia/pagina-0001.png` até `pagina-0124.png`.

**Importante — o PDF original não deve ir para o GitHub.** Foi criado um `.gitignore` na raiz do projeto que já exclui a pasta `Livros/` (e bancos `.db`, `node_modules/`) de qualquer commit — assim o PDF fonte nunca é publicado, só as páginas processadas (que já ficam protegidas dentro de `server/`). Mesmo assim, recomendo mover ou apagar o PDF de `Livros/` depois de conferir que as páginas ficaram boas, só por organização — ele não é mais necessário ali.

### Para adicionar outro e-book no futuro (sessão 09/07/2026 — upload automático)
Agora não precisa mais converter o PDF manualmente. É só:
1. Cadastrar o produto na loja pelo admin (🛒 Produtos → "Novo produto") **e anexar o PDF no campo "PDF do e-book"** do próprio formulário — ao salvar, o servidor já converte o PDF em páginas e vincula tudo sozinho (o campo é opcional; sem PDF, o produto é tratado como físico).
2. Para um produto que já existe, clicar em **"Editar"** na lista → o modal tem um campo de upload de PDF (basta escolher um arquivo nesse campo pra reprocessar o e-book daquele produto) e também um seletor de pastas já processadas, caso prefira reaproveitar um vínculo existente.
3. Por baixo dos panos: `POST /api/admin/livros-digitais/upload` recebe o PDF (multipart, via `busboy`), salva num arquivo temporário, roda `pdftoppm` (pacote de sistema `poppler-utils`, instalado via `NectarMine/nixpacks.toml`) pra gerar as páginas PNG em `biblioteca-privada/<slug-gerado>/`, apaga o PDF temporário, e vincula o produto automaticamente (`livros_digitais`). O PDF original nunca fica salvo no servidor.
4. A conversão de um livro de ~120 páginas leva cerca de 1 minuto — o admin mostra uma mensagem de "Convertendo..." enquanto isso acontece.

O jeito manual antigo (`pdftoppm` na mão + seletor de pasta) continua funcionando como alternativa, caso precise reaproveitar páginas já processadas de outra forma:
- Converter o PDF em páginas PNG (`pdftoppm -png -r 150 arquivo.pdf pagina`), renomear pro padrão `pagina-0001.png` (4 dígitos) e colocar a pasta em `biblioteca-privada/<slug-do-livro>/`.
- No modal de edição do produto, o seletor **"E-book — vincular a uma pasta já processada"** lista todas as pastas detectadas automaticamente.
- (O vínculo automático via `vinculosAutomaticos` em `server.js`, casado por nome exato do produto, continua existindo como atalho pro primeiro deploy.)

### Produto físico vs. produto digital do mesmo livro
Cada produto da loja é uma linha própria — então "Livro BIFFI" físico e uma eventual versão digital são **dois produtos separados** (nomes, preços e estoque independentes). Se um for excluído e outro criado depois com o mesmo e-book, o seletor da lista de produtos permite vincular a pasta de páginas ao novo produto normalmente (o sistema libera automaticamente o vínculo antigo).

Obs: um produto que já tem pedidos associados não pode ser excluído (só desativado, desmarcando "Ativo") — isso evita perder o histórico de compras.

## Painel Admin (biffi.online/admin/)
- **URL:** https://biffi.online/admin/ (não linkado no menu público — acesso direto pela URL)
- **Login:** senha única (não tem usuário), comparada no backend com a variável de ambiente `ADMIN_KEY` (configurar em Railway → serviço → Variables). Sem `ADMIN_KEY` configurada, o login sempre falha (seguro por padrão).
- **Como funciona:** `admin/login.html` chama `POST /api/admin/login` no Railway; se a senha bater, guarda a própria senha em `localStorage` (`biffi_admin_key`) e usa como header `x-admin-key` nas próximas chamadas (ex: `PUT /api/announcement`). Mesmo esquema de CORS cross-domain do NectarMine.
- **Visual:** identidade BIFFI.ONLINE (rosa/roxo/dourado, Georgia + Arial), sidebar de ícones — pensado para crescer com mais módulos no futuro.
- **Módulos existentes:**
  - 📢 **Modal do Jogo** — edita Título / Texto / Subtítulo / Texto do modal comunicativo que aparece na tela de login do NectarMine (liga/desliga com o campo "ativo"). Lê/grava na tabela `site_config` do backend do NectarMine.
  - 🛒 **Produtos** — lista com toggle rápido de Destaque/Ativo direto na linha, e botão **"Editar"** que abre um modal completo com todos os campos do produto (nome, descrição, preço, imagem, categoria, estoque/ilimitado, destaque, ativo) + upload de PDF do e-book ou vínculo a uma pasta já processada. O formulário "Novo produto" também aceita anexar um PDF direto na criação — sobe e converte automaticamente (ver seção "Livraria Digital" acima).
- **Arquivos:** `admin/login.html`, `admin/index.html`, `admin/js/admin.js`

### Upload de foto/capa do produto (sessão 09/07/2026)
Antes, o campo "Imagem" só aceitava texto (emoji ou nome de arquivo já existente no repositório) — não dava pra simplesmente anexar uma foto. Agora dá:
- Tanto no formulário **"Novo produto"** quanto no modal **"Editar"**, existe um campo de upload de arquivo (JPG, PNG, WEBP ou GIF, até 8MB) ao lado do campo de texto "Imagem". Anexando uma foto, ela é enviada e usada automaticamente — não precisa mexer no campo de texto.
- Por baixo dos panos: `POST /api/admin/products/:id/imagem` (multipart via `busboy`) salva o arquivo em `imagens-produtos/` (nome aleatório, extensão original preservada), apaga a foto antiga do produto se houver, e atualiza o campo `imagem` do produto para `api/imagens/produtos/<arquivo>`. Servido publicamente (sem login) por `GET /api/imagens/produtos/:arquivo`, com cache de 1 ano (o nome do arquivo muda a cada novo upload, então não tem risco de servir versão desatualizada).
- O front-end (`js/shop-api.js` na loja, `admin/index.html` no admin) já sabe diferenciar: se `imagem` começa com `api/imagens/produtos/`, busca a foto no backend Railway; se for nome de arquivo do próprio repositório (ex.: `Capa BIFFI .jpeg`), busca relativo à raiz do site; senão, mostra como emoji/texto puro.

### Persistência de arquivos enviados — variável `DATA_DIR` (importante para o Railway)
Tanto as páginas de e-book geradas pelo upload de PDF quanto as fotos de produto enviadas pelo admin são gravadas em disco pelo próprio servidor (não vão para o Git). Sem cuidado, esses arquivos seriam **apagados a cada novo deploy** (o Railway recria o container do zero a cada push), porque só o banco SQLite estava configurado para usar o volume persistente.
- O servidor agora usa `const DATA_DIR = process.env.DATA_DIR || __dirname;` — tanto `biblioteca-privada/` (páginas de e-book) quanto `imagens-produtos/` (fotos de produto) ficam dentro de `DATA_DIR`.
- **Recomendação:** configurar a variável de ambiente `DATA_DIR=/data` no Railway (Variables), apontando para o mesmo volume persistente já usado por `DB_PATH`. Sem isso, tudo continua funcionando normalmente entre uma request e outra, mas **fotos e e-books enviados via admin seriam perdidos no próximo deploy**.

### Loja (`loja.html`) — layout simplificado (sessão 09/07/2026)
A pedido, a vitrine deixou de ter uma seção de "produto em destaque" separada dos demais. Agora todos os produtos aparecem numa única lista vertical, um embaixo do outro, com o mesmo tratamento visual (miniatura + nome + descrição + preço + botão "Adicionar"/"Indisponível") — sem nenhuma configuração de destaque na exibição pública (o campo "Destaque" ainda existe no admin, mas hoje não altera a ordem/aparência na loja).

## Design
- **Cores (atualizado 09/07/2026 — estilo colonial/vintage romano, a pedido da dona do site, substituindo a paleta rosa anterior):**
  `--rosa` (fundo claro/gradiente) `#F2E6D3` → `--rosa-med` `#D9BC8E`, `--roxo` (cor principal — títulos, ícones, bordas) `#7A4A2D` (terracota/marrom), `--roxo-esc` (texto escuro) `#3D2817` (marrom café), `--dourado` `#C9A227` (dourado antigo). Gradiente de fundo do body: `linear-gradient(160deg, #F2E6D3 0%, #EAD7B8 50%, #E3CC9E 100%)` (pergaminho/mármore). Aplicado em todas as páginas do site principal, loja, checkout, meus-pedidos, leitor e admin — o NectarMine (jogo) mantém seu próprio tema escuro, não foi alterado. Cores decorativas cor-de-rosa em blog.html/cafe.html/biblioteca.html/estudos.html/sobre.html (thumbnails, tags, placeholder de foto) também foram trocadas por tons terracota/oliva/dourado da mesma paleta.
- **Fontes:** Georgia (títulos), Arial (corpo)
- **Elementos fixos:** Header e Footer em todas as páginas
- **Abelhas:** 10 animadas em cada página (position: fixed, pointer-events: none)
- **Ícones:** Font Awesome 6.5 via CDN (cdnjs.cloudflare.com)

## Rodapé
- **Esquerda:** Contatos → WhatsApp / Instagram / Facebook / Telegram
- **Centro:** 🐝 © 2025 BIFFI.ONLINE — feito com amor
- **Direita:** "Dev" (hover mostra tooltip → clique abre WhatsApp do dev)

## Contatos / Redes Sociais
- **WhatsApp (site):** +55 11 94737-7498 → https://wa.me/5511947377498
- **Instagram:** a preencher (href="#" em todos os footers)
- **Facebook:** a preencher (href="#" em todos os footers)
- **Telegram:** a preencher (href="#" em todos os footers)

## Imagem
- `Capa BIFFI .jpeg` — capa do livro, usada na home e na loja

## Dependências do backend (NectarMine)
- `jimp` — marca d'água nas páginas do e-book.
- `busboy` — parsing do upload de PDF no admin (multipart/form-data).
- `poppler-utils` (pacote de sistema, não npm) — fornece o binário `pdftoppm` usado na conversão de PDF → PNG; instalado automaticamente no Railway via `NectarMine/nixpacks.toml` (`aptPkgs = ["poppler-utils"]`). Se algum dia trocar de plataforma de deploy (sair do Nixpacks/Railway), lembrar de instalar esse pacote de sistema também no novo ambiente.

## Pendências
- [ ] Configurar `DATA_DIR=/data` no Railway (Variables) — sem isso, fotos de produto e e-books enviados via admin são perdidos a cada novo deploy (ver seção "Persistência de arquivos enviados" acima)
- [ ] Foto real na página Sobre (substituir emoji 🐝 por `<img>`)
- [ ] Texto biográfico real na página Sobre
- [ ] URLs reais do Instagram, Facebook e Telegram no footer
- [ ] Criar conta e pegar chaves de API no Mercado Pago e/ou PayPal, e configurar `MP_ACCESS_TOKEN` / `PAYPAL_CLIENT_ID` / `PAYPAL_CLIENT_SECRET` no Railway (sem isso, a loja funciona no modo "combinar pagamento manualmente")
- [ ] Cadastrar/revisar produtos reais da loja no painel admin (🛒 Produtos) — hoje estão os 5 produtos de exemplo que já existiam
- [ ] Conteúdo real para posts do Blog
- [ ] Materiais reais para download na Biblioteca
- [ ] Conteúdo definitivo de missao.html (Missão)
- [ ] Conteúdo definitivo de o-sonho.html (O Sonho)
- [ ] Conteúdo definitivo de parcerias.html (Parcerias)
- [ ] Adaptar biblioteca.html e cafe.html para o tema de oração (hoje têm conteúdo genérico de trilhas/receitas, mas os ícones do menu já chamam "Biblioteca de Oração" e "Sala de Oração")

## Dev
- **Desenvolvedor:** Silvio Velicka — silviovelicka@gmail.com
- **WhatsApp Dev:** +55 11 94737-7498

## NectarMine — Notas recentes (sessão 04/07/2026)
Tudo abaixo foi implementado, deployado e confirmado ao vivo em biffi.online:

- **Transição entre páginas** (`NectarMine/transicao.html`): dura 12 segundos; anúncio Adcash (zoneId `11566174`) fixo no topo da tela, anúncio zerads (728x90) fixo no rodapé — ambos com `position: fixed`, não mais centralizados.
- **`NectarMine/medidas-propagandas.txt`**: deletado (não é mais usado).
- **Botão "Sair" (logout)**: `js/api.js` → `NM_API.logout()` agora limpa o token, passa uma última vez pela `transicao.html` e redireciona para `https://biffi.online` (site raiz) — não vai mais para `login.html` do jogo.
- **Página Amigos**: `ganhar-nectar.html` foi renomeada para `amigos.html` (link atualizado no sidebar do dashboard). Contém sistema de referral completo, no estilo do dashboard (anúncio 468x60 + título em amarelo no topo):
  - Reward: 50 potes de mel de bônus único + 10% de comissão contínua sobre a produção do indicado, por parceiro.
  - Cards: comissão, bônus, parceiros, potes disponíveis, link de convite (com botão copiar), resgate de potes, tabela de parceiros registrados.
  - Todos os cards usam o mesmo estilo visual transparente (`rgba(255,255,255,.04)` + `backdrop-filter: blur(10px)`).
  - Propagandas no rodapé, nesta ordem: Adcash zoneId `11566166`, Adcash zoneId `11566158`, zerads (728x90), Adcash zoneId `11566174`.
- **Botão "Voltar ao Dashboard"** (`.btn-voltar-dashboard`, em `css/global.css`): reposicionado do topo-esquerdo para o topo-direito da tela, em todas as páginas internas (classe compartilhada, uma única mudança no CSS afeta todas as páginas).

### Problema de deploy resolvido (importante para o futuro)
Depois da mudança do botão, o GitHub Pages falhou em publicar por 4 tentativas seguidas (runs #44 a #47), sempre com o erro genérico "Deployment failed, try again later." mesmo com o deployment sendo criado com sucesso (confirmado direto no log do job "deploy").

**Causa raiz encontrada:** em Settings → Pages, o domínio customizado `biffi.online` estava com "DNS Check in Progress" travado (em vez do check verificado/verde). Isso instabiliza a etapa final de "Getting Pages deployment status" do GitHub Pages.

**Correção:** em Settings → Pages → Custom domain, clicar em "Save" no campo do domínio (sem alterar o valor) força o GitHub a refazer a verificação de DNS. Depois disso o deploy voltou a funcionar normalmente.

**Se esse erro voltar a acontecer:** checar primeiro `github.com/Silvio-Velicka/BIFFI.ONLINE/settings/pages` — se o "DNS Check" não estiver com o check verde, repetir o "Save" acima antes de tentar mais commits ou re-runs.
