/* ═══════════════════════════════════════════════════════════
   BIFFI.ONLINE — LOGIN UNIFICADO DO SITE
   Mostra em qualquer página (site principal + loja) se o visitante
   já está logado (mesma conta/token do jogo NectarMine, localStorage
   "nm_token") e cuida do "deslogar automático" quando o token está
   inválido ou expirado — assim nenhuma página fica com uma sessão
   quebrada sem o usuário entender o motivo.

   Uso: incluir <script src="js/site-auth.js"></script> em qualquer
   página na raiz do site (não usar dentro de NectarMine/ — lá o
   próprio jogo já cuida disso via NectarMine/js/api.js).
   ═══════════════════════════════════════════════════════════ */

const SITE_AUTH = {
  // Mesma lógica de detecção de domínio usada em NectarMine/js/api.js e js/shop-api.js
  base: (location.hostname === 'biffionline-production.up.railway.app' || location.hostname === 'localhost')
    ? ''
    : 'https://biffionline-production.up.railway.app',

  token: () => localStorage.getItem('nm_token'),

  // Página atual (para montar o "redirect" de volta após o login)
  paginaAtual() {
    return (location.pathname.split('/').pop() || 'index.html') + location.search;
  },

  // Verifica se o token é válido de verdade (consulta o servidor).
  // Se estiver ausente, inválido ou expirado, limpa o localStorage
  // sozinho — isso é o "deslogar automático". Resultado é cacheado
  // durante o carregamento da página, pra não repetir a chamada
  // toda vez que alguma parte da página perguntar se está logado.
  _verificacao: null,
  async verificar() {
    if (SITE_AUTH._verificacao) return SITE_AUTH._verificacao;
    SITE_AUTH._verificacao = (async () => {
      const t = SITE_AUTH.token();
      if (!t) return null;
      try {
        const res = await fetch(SITE_AUTH.base + '/api/me', { headers: { Authorization: 'Bearer ' + t } });
        if (!res.ok) throw new Error('sessão inválida');
        const data = await res.json();
        return data.user;
      } catch {
        localStorage.removeItem('nm_token');
        return null;
      }
    })();
    return SITE_AUTH._verificacao;
  },

  async logout() {
    const t = SITE_AUTH.token();
    localStorage.removeItem('nm_token');
    if (t) {
      try {
        await fetch(SITE_AUTH.base + '/api/logout', { method: 'POST', headers: { Authorization: 'Bearer ' + t } });
      } catch { /* mesmo se falhar, o token local já foi removido */ }
    }
    location.reload();
  },
};

function siteAuthEscapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

async function montarWidgetAuth() {
  const header = document.querySelector('header');
  if (!header) return;
  const user = await SITE_AUTH.verificar();
  const redirect = encodeURIComponent('../' + SITE_AUTH.paginaAtual());
  const hrefLogin = `NectarMine/login.html?redirect=${redirect}`;
  const hrefConta = 'NectarMine/dashboard.html';

  const nav = header.querySelector('nav');

  if (nav) {
    // Páginas do site principal e a loja: nav com ícone + label, igual aos demais itens.
    if (user) {
      nav.insertAdjacentHTML('beforeend', `
        <a href="${hrefConta}" title="Ir para o painel do jogo">${siteAuthEscapeHtml(user.username)}</a>
        <a href="#" id="site-auth-sair">Sair</a>
      `);
    } else {
      nav.insertAdjacentHTML('beforeend', `
        <a href="${hrefLogin}">Entrar</a>
      `);
    }
  } else {
    // Páginas com header simples (checkout.html, meus-pedidos.html): logo + um link só.
    // Agrupa o link existente (ex: "Voltar à loja") junto com o widget de login,
    // pra não quebrar o layout "space-between" do header (que espera 2 elementos).
    const linkExistente = header.querySelector('a:not(.logo)');
    const wrapper = document.createElement('div');
    wrapper.style.cssText = 'display:flex;align-items:center;gap:16px;flex-wrap:wrap;';
    if (linkExistente) wrapper.appendChild(linkExistente);

    if (user) {
      wrapper.insertAdjacentHTML('beforeend', `
        <span style="font-family:Arial,sans-serif;font-size:13px;font-weight:700;color:var(--roxo,#8B2D8F);display:flex;align-items:center;gap:10px;">
          👤 ${siteAuthEscapeHtml(user.username)}
          <a href="#" id="site-auth-sair" style="font-family:Arial,sans-serif;font-size:13px;font-weight:700;color:var(--roxo,#8B2D8F);text-decoration:none;">Sair</a>
        </span>
      `);
    } else {
      wrapper.insertAdjacentHTML('beforeend', `
        <a href="${hrefLogin}" style="font-family:Arial,sans-serif;font-size:13px;font-weight:700;color:var(--roxo,#8B2D8F);text-decoration:none;">Entrar / Criar conta</a>
      `);
    }
    header.appendChild(wrapper);
  }

  const sair = document.getElementById('site-auth-sair');
  if (sair) sair.addEventListener('click', (e) => { e.preventDefault(); SITE_AUTH.logout(); });
}

document.addEventListener('DOMContentLoaded', montarWidgetAuth);
