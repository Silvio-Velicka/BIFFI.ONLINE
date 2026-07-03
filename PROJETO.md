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
- "Game Relax" abre em nova aba: https://biffionline-production.up.railway.app (não usa mais a cópia estática NectarMine/ do próprio site).

## NectarMine (jogo) — hospedagem separada
- **Onde roda:** Railway (projeto "sweet-endurance", serviço "BIFFI.ONLINE", repo Silvio-Velicka/BIFFI.ONLINE, Root Directory = /NectarMine)
- **URL pública:** https://biffionline-production.up.railway.app
- **Deploy:** automático a cada push em `main` (GitHub → Railway)
- **Backend:** Node.js 22+ (`node:sqlite`), zero dependências — `NectarMine/server/server.js`, start command `node server/server.js` (via package.json)
- **Banco:** SQLite persistido em volume Railway `biffi.online-volume`, montado em `/data`; variável `DB_PATH=/data/nectarmine.db`
- **Pasta local `NectarMine/` no repo:** continua existindo e é hospedada também no GitHub Pages (biffi.online/NectarMine/), mas SEM backend — login/cadastro só funcionam pela URL do Railway acima.

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
