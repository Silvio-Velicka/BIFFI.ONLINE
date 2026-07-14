/* ═══════════════════════════════════════
   NECTARMINE — Cliente da API
   Requer o servidor rodando (node server/server.js)
   ═══════════════════════════════════════ */

const NM_API = {
  // O backend (Node + SQLite) só roda no Railway. Se a página estiver sendo
  // servida de outro domínio/cópia estática (ex: GitHub Pages), as chamadas
  // de API são redirecionadas automaticamente para o backend real.
  base: (location.hostname === 'biffionline-production.up.railway.app' || location.hostname === 'localhost')
    ? ''
    : 'https://biffionline-production.up.railway.app',

  token: () => localStorage.getItem('nm_token'),

  async call(path, method = 'GET', body = null) {
    const headers = { 'Content-Type': 'application/json' };
    const t = NM_API.token();
    if (t) headers['Authorization'] = 'Bearer ' + t;
    const res = await fetch(NM_API.base + path, { method, headers, body: body ? JSON.stringify(body) : null });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Erro na comunicação com o servidor.');
    return data;
  },

  /* ── Autenticação ── */
  async register(username, email, password, ref) {
    const d = await NM_API.call('/api/register', 'POST', { username, email, password, ref });
    localStorage.setItem('nm_token', d.token);
    return d.user;
  },

  async login(login, password) {
    const d = await NM_API.call('/api/login', 'POST', { login, password });
    localStorage.setItem('nm_token', d.token);
    return d.user;
  },

  async logout() {
    try { await NM_API.call('/api/logout', 'POST'); } catch {}
    localStorage.removeItem('nm_token');
    location.href = 'transicao.html?to=' + encodeURIComponent('https://biffi.online');
  },

  me: () => NM_API.call('/api/me'),

  /* ── Estado do jogo ── */
  saveState: (state) => NM_API.call('/api/state', 'PUT', state),

  // Registra produção ou entrega (alimenta os rankings)
  event: (tipo, amount) => NM_API.call('/api/event', 'POST', { tipo, amount }),

  /* ── Rankings ── */
  ranking: (tipo = 'producao', periodo = 'diario') =>
    NM_API.call(`/api/ranking?tipo=${tipo}&periodo=${periodo}`),

  // Modal comunicativo da tela de login (conteúdo editável no futuro painel admin)
  announcement: () => NM_API.call('/api/announcement'),

  /* ── Jogo (economia real: apiários, produção, loja) ── */
  jogoStatus: () => NM_API.call('/api/jogo/status'),
  envasar: () => NM_API.call('/api/jogo/envasar', 'POST'),
  comprarApiario: (tipo) => NM_API.call('/api/loja/apiario', 'POST', { tipo }),
  comprarCapacidade: () => NM_API.call('/api/loja/capacidade', 'POST'),
  comprarRelogio: () => NM_API.call('/api/loja/relogio', 'POST'),

  /* ── Desafios (metas diárias) ── */
  desafios: () => NM_API.call('/api/desafios'),
  resgatarDesafio: (chave) => NM_API.call('/api/desafios/resgatar', 'POST', { chave }),

  /* ── Amigos (referral) ── */
  amigos: () => NM_API.call('/api/amigos'),
  resgatarBonusAmigos: () => NM_API.call('/api/amigos/resgatar', 'POST'),

  /* ── Mercado (compra/venda real de potes) ── */
  mercado: () => NM_API.call('/api/mercado'),
  venderMercado: (quantidade) => NM_API.call('/api/mercado/vender', 'POST', { quantidade }),
  comprarMercado: (quantidade) => NM_API.call('/api/mercado/comprar', 'POST', { quantidade }),
};

/* ── GUARD DE AUTENTICAÇÃO ──
   Páginas públicas não exigem login; as demais redirecionam
   para login.html se o usuário não estiver autenticado. */
const NM_PUBLIC_PAGES = ['index.html', 'login.html', 'whitepaper.html', 'roadmap.html', ''];

async function nmAuthGuard() {
  const page = location.pathname.split('/').pop().toLowerCase();
  const isPublic = NM_PUBLIC_PAGES.includes(page);

  if (!NM_API.token()) {
    if (!isPublic) location.href = 'login.html';
    return;
  }

  try {
    const { user, state } = await NM_API.me();
    window.NM_USER = user;
    window.NM_STATE = state;
    nmFillSidebar(user, state);
    document.dispatchEvent(new CustomEvent('nm:ready', { detail: { user, state } }));
  } catch {
    localStorage.removeItem('nm_token');
    if (!isPublic) location.href = 'login.html';
  }
}

/* Preenche os dados do usuário na sidebar */
function nmFillSidebar(user, state) {
  const name = document.querySelector('.sidebar-user .user-info strong');
  const uid = document.querySelector('.sidebar-user .user-info span');
  const lvl = document.querySelector('.sidebar-user .user-level');
  const av = document.querySelector('.sidebar-user .user-avatar');
  if (name) name.textContent = user.username;
  if (uid) uid.textContent = 'ID #' + user.id;
  if (lvl) lvl.textContent = 'Nv.' + user.level;
  if (av) av.textContent = user.avatar;

  const stats = document.querySelectorAll('.sidebar-stats .sidebar-stat strong');
  if (stats[0] && state) stats[0].textContent = Number(state.nct).toLocaleString('pt-BR', { maximumFractionDigits: 0 });
  if (stats[1] && state) stats[1].textContent = Number(state.potes).toLocaleString('pt-BR');
}

/* Intercepta o link "Sair" da sidebar */
document.addEventListener('click', (e) => {
  const a = e.target.closest('a[href="/logout"], a[href="logout"]');
  if (a) { e.preventDefault(); NM_API.logout(); }
});

document.addEventListener('DOMContentLoaded', nmAuthGuard);
