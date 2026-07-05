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
| loja.html | Lojinha | ⚠️ Preços/links reais a preencher |
| parcerias.html | Parcerias | ⚠️ Placeholder "conteúdo em breve" |
| blog.html | Blog | ✅ Com posts de exemplo — fora do menu principal, arquivo mantido mas sem link na navegação |
| estudos.html | Biblioteca (cópia própria, mesmo conteúdo de biblioteca.html) | ✅ |
| dashboard.html | (redireciona → index.html) | ✅ |

## Navegação (ordem no menu)
🎯 Missão → 🐝 Quem sou → ✨ O Sonho → 📖 Biblioteca de Oração → 🙏 Sala de Oração → 🛍️ Lojinha → 🤝 Parcerias → 🎮 Game Relax
- Mapeamento: Missão = missao.html (novo) · Quem sou = sobre.html · O Sonho = o-sonho.html (novo) · Biblioteca de Oração = biblioteca.html · Sala de Oração = cafe.html · Lojinha = loja.html · Parcerias = parcerias.html (novo) · Game Relax = NectarMine/index.html.
- "Blog" saiu do menu principal (o arquivo blog.html continua existindo, só não está mais linkado na navegação).
- Ícones do menu: width 88px, gap 8px, `flex-wrap: wrap` no nav para não quebrar o layout em telas médias; label permite quebra de linha (sem `white-space: nowrap`) para caber nomes maiores como "Biblioteca de Oração" e "Sala de Oração".
- "Game Relax" abre na mesma aba: NectarMine/index.html (dentro do próprio domínio biffi.online — importante para anúncios/monetização). O front-end é a cópia estática servida pelo GitHub Pages; ele fala com o backend do Railway por baixo dos panos (ver abaixo).
- missao.html, o-sonho.html e parcerias.html são páginas novas, criadas apenas com a estrutura visual do site (header/nav/rodapé/abelhas) e um aviso "conteúdo em breve" — o conteúdo definitivo de cada uma será desenvolvido depois, ícone por ícone.

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
- [ ] Conteúdo definitivo de missao.html (Missão)
- [ ] Conteúdo definitivo de o-sonho.html (O Sonho)
- [ ] Conteúdo definitivo de parcerias.html (Parcerias)
- [ ] Adaptar biblioteca.html e cafe.html para o tema de oração (hoje têm conteúdo genérico de trilhas/receitas, mas os ícones do menu já chamam "Biblioteca de Oração" e "Sala de Oração")

## Dev
- **Desenvolvedor:** Silvio Velicka — silviovelicka@gmail.com
- **WhatsApp Dev:** +55 11 94737-7498

## NectarMine — Notas recentes
- Página `NectarMine/amigos.html`: sistema de referral (10% de comissão contínua + 50 potes de mel de bônus único por parceiro ativo), com link de convite, resgate de potes e tabela de parceiros.
- Botão "Voltar ao Dashboard" (`.btn-voltar-dashboard`, em `css/global.css`) fica fixo no topo direito da tela em todas as páginas internas.
- Transição entre páginas (`NectarMine/transicao.html`) dura 12 segundos, com propagandas fixas no topo e no rodapé da tela.
- Nota: se depois de um deploy o site não atualizar mesmo com Ctrl+Shift+R, o motivo normalmente é o job "deploy" do GitHub Pages falhando silenciosamente ("Deployment failed, try again later"), não cache do navegador — checar em github.com/Silvio-Velicka/BIFFI.ONLINE/actions.
