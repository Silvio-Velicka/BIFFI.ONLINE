/* ═══════════════════════════════════════════════════════════
   BIFFI.ONLINE — CONTADOR DE ACESSOS
   Avisa o backend (Railway) a cada carregamento de página, pra alimentar o
   módulo "📊 Acessos" do painel admin (contador diário/semanal/mensal + lista
   com id, localização e horário). Não mostra nada pro visitante, não usa
   cookies, e nunca trava/atrasa a página — se falhar, falha em silêncio.

   Uso: incluir <script src="js/site-track.js"></script> em qualquer página
   na raiz do site. Não precisa de mais nada — dispara sozinho.
   ═══════════════════════════════════════════════════════════ */

(function () {
  // Mesma lógica de detecção de domínio usada em js/site-auth.js, js/shop-api.js
  // e NectarMine/js/api.js: se já estiver no domínio do backend (ou localhost),
  // chama a API relativa; senão (biffi.online via GitHub Pages), chama o
  // backend completo no Railway via CORS.
  const base = (location.hostname === 'biffionline-production.up.railway.app' || location.hostname === 'localhost')
    ? ''
    : 'https://biffionline-production.up.railway.app';

  // Id de visitante gerado uma vez só e guardado no localStorage — não
  // identifica a pessoa (não é o login), só ajuda o admin a diferenciar
  // "visitante novo" de "visitante voltando" nas estatísticas.
  function visitorId() {
    try {
      let id = localStorage.getItem('biffi_visitor_id');
      if (!id) {
        id = (crypto.randomUUID ? crypto.randomUUID() : (Date.now().toString(36) + Math.random().toString(36).slice(2)));
        localStorage.setItem('biffi_visitor_id', id);
      }
      return id;
    } catch {
      return ''; // navegador com localStorage bloqueado (modo privado restrito etc.) — segue sem id
    }
  }

  function registrarAcesso() {
    try {
      fetch(base + '/api/track-visit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          visitor_id: visitorId(),
          pagina: (location.pathname.split('/').pop() || 'index.html') || 'index.html',
        }),
        keepalive: true,
      }).catch(() => { /* falha silenciosa — nunca atrapalha o visitante */ });
    } catch { /* mesmo erro síncrono (ex: fetch indisponível) não pode quebrar a página */ }
  }

  document.addEventListener('DOMContentLoaded', registrarAcesso);
})();
