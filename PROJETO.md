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
| sobre.html | Sobre (biografia) | ⚠️ Aguarda conteúdo real |
| blog.html | Blog | ✅ Com posts de exemplo |
| loja.html | Loja | ⚠️ Preços/links reais a preencher |
| biblioteca.html | Biblioteca | ✅ Com trilhas e materiais de exemplo |
| estudos.html | (redireciona → biblioteca.html) | ✅ |
| cafe.html | Café & Meditação | ✅ Com receitas e meditações |
| dashboard.html | (redireciona → index.html) | ✅ |

## Navegação (ordem no menu)
🐝 Sobre → 📝 Blog → 🛍️ Loja → 📚 Biblioteca → ☕ Café → 🎮 Game Relax
- Todos os ícones do menu têm o mesmo tamanho (width: 104px, fixo).
- "Game Relax" abre na mesma aba: NectarMine/index.html (dentro do próprio domínio biffi.online — importante para anúncios/monetização). O front-end é a cópia estática servida pelo GitHub Pages; ele fala com o backend do Railway por baixo dos panos (ver abaixo).

## NectarMine (jogo) — front-end no próprio domínio, backend no Railway
- **URL que o usuário vê:** https://biffi.online/NectarMine/ (GitHub Pages, mesmo domínio do site — bom para AdSense/anúncios)
- **Onde roda o backend (banco de dados):** Railway (projeto "sweet-endurance", serviço "BIFFI.ONLINE", repo Silvio-Velicka/BIFFI.ONLINE, Root Directory = /NectarMine)
- **URL direta do backend:** https://biffionline-production.up.railway.app (não usar como link público — só existe para o front-end conversar com o banco via API)
- **Como funciona:** `NectarMine/js/api.js` detecta o domínio: se a página estiver em biffi.online (ou qualquer domínio que não seja o Railway/localhost), todas as chamadas de API (`/api/register`, `/api/login`, etc.) são enviadas automaticamente para a URL do Railway acima, via CORS (liberado em `server.js` com `Access-Control-Allow-Origin: *`, sem uso de cookies). Assim o usuário nunca sai do domínio biffi.online, mas os dados vão pro banco real.
- **Deploy:** automático a cada push em `main` — GitHub Pages republica a cópia estática (biffi.online/NectarMine) e o Railway republica o backend, ambos a partir do mesmo repositório.
- **Backend:** Node.js 22+ (`node:sqlite`), zero dependências — `NectarMine/server/server.js`, start command `node server/server.js` (via package.json)
- **Banco:** SQLite persistido em volume Railway `biffi.online-volume`, montado em `/data`; variável `DB_PATH=/data/nectarmine.db`

## Painel Admin (biffi.online/admin/)
- **URL:** https://biffi.online/admin/ (não linkado no menu público — acesso direto pela URL)
- **Login:** senha única (não tem usuário), comparada no backend com a variável de ambiente `ADMIN_KEY` (configurar em Railway → serviço → Variables). Sem `ADMIN_KEY` configurada, o login sempre falha (seguro por padrão).
- **Como funciona:** `admin/login.html` chama `POST /api/admin/login` no Railway; se a senha bater, guarda a própria senha em `localStorage` (`biffi_admin_key`) e usa como header `x-admin-key` nas próximas chamadas (ex: `PUT /api/announcement`). Mesmo esquema de CORS cross-domain do NectarMine.
- **Visual:** identidade BIFFI.ONLINE (rosa/roxo/dourado, Georgia + Arial), sidebar de ícones — pensado para crescer com mais módulos no futuro.
- **Módulos existentes:**
  - 📢 **Modal do Jogo** — edita Título / Texto / Subtítulo / Texto do modal comunicativo que aparece na tela de login do NectarMine (liga/desliga com o campo "ativo"). Lê/grava na tabela `site_config` do backend do NectarMine.
- **Arquivos:** `admin/login.html`, `admin/index.html`, `admin/js/admin.js`

## Design
- **Cores:** rosa (#FFB6D9 → #FFD1EB), roxo (#8B2D8F), dourado (#FFD700)
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

## Pendências
- [ ] Foto real na página Sobre (substituir emoji 🐝 por `<img>`)
- [ ] Texto biográfico real na página Sobre
- [ ] URLs reais do Instagram, Facebook e Telegram no footer
- [ ] Links reais de compra na Loja (botões "Comprar agora")
- [ ] Conteúdo real para posts do Blog
- [ ] Materiais reais para download na Biblioteca

## Dev
- **Desenvolvedor:** Silvio Velicka — silviovelicka@gmail.com
- **WhatsApp Dev:** +55 11 94737-7498
