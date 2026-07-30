/* ═══════════════════════════════════════════════════════════
   BIFFI.ONLINE — RODAPÉ: CONTATOS DINÂMICOS
   Busca os links de Instagram, Facebook, Telegram e e-mail cadastrados
   no painel admin (aba "Contatos") e preenche o rodapé de qualquer
   página que inclua este script. Um contato sem valor cadastrado fica
   oculto (em vez de mostrar um link quebrado apontando para "#").
   ═══════════════════════════════════════════════════════════ */
(function () {
  const BASE = (location.hostname === 'biffionline-production.up.railway.app' || location.hostname === 'localhost')
    ? ''
    : 'https://biffionline-production.up.railway.app';

  const IDS = ['contato-instagram', 'contato-facebook', 'contato-telegram', 'contato-email'];

  function aplicar(id, valor) {
    const link = document.getElementById(id);
    if (!link) return;
    if (!valor) { link.style.display = 'none'; return; }
    link.href = link.dataset.tipo === 'email' ? ('mailto:' + valor) : valor;
    link.style.display = '';
  }

  fetch(BASE + '/api/site-contatos')
    .then(res => res.json())
    .then(c => {
      aplicar('contato-instagram', c.instagram);
      aplicar('contato-facebook', c.facebook);
      aplicar('contato-telegram', c.telegram);
      aplicar('contato-email', c.email);
    })
    .catch(() => {
      // Sem conexão com o backend — mantém os links ocultos (nada de "#").
      IDS.forEach(id => { const el = document.getElementById(id); if (el) el.style.display = 'none'; });
    });
})();
