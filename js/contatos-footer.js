/* ═══════════════════════════════════════════════════════════
   BIFFI.ONLINE — CONTATOS DINÂMICOS
   Busca os links de Instagram, Facebook, Telegram e e-mail cadastrados
   no painel admin (aba "Contatos") e preenche qualquer elemento —
   rodapé ou qualquer outro bloco da página — que inclua este script.
   Um contato sem valor cadastrado fica oculto (em vez de mostrar um
   link quebrado apontando para "#").

   Cada elemento pode ser identificado por um id "contato-<rede>"
   (usado no rodapé) e/ou por um atributo data-rede="<rede>" (usado em
   outros pontos da página, como o quadro de redes sociais de
   sobre.html). Ambos são atualizados juntos, então qualquer página que
   inclua este mesmo script.js tem a mesma funcionalidade automaticamente.
   ═══════════════════════════════════════════════════════════ */
(function () {
  const BASE = (location.hostname === 'biffionline-production.up.railway.app' || location.hostname === 'localhost')
    ? ''
    : 'https://biffionline-production.up.railway.app';

  const REDES = ['instagram', 'facebook', 'telegram', 'email'];

  function aplicar(rede, valor) {
    const seletor = `#contato-${rede}, [data-rede="${rede}"]`;
    document.querySelectorAll(seletor).forEach(link => {
      if (!valor) { link.style.display = 'none'; return; }
      const tipo = link.dataset.tipo || (rede === 'email' ? 'email' : '');
      link.href = tipo === 'email' ? ('mailto:' + valor) : valor;
      link.style.display = '';
    });
  }

  fetch(BASE + '/api/site-contatos')
    .then(res => res.json())
    .then(c => {
      aplicar('instagram', c.instagram);
      aplicar('facebook', c.facebook);
      aplicar('telegram', c.telegram);
      aplicar('email', c.email);
    })
    .catch(() => {
      // Sem conexão com o backend — mantém os links ocultos (nada de "#").
      REDES.forEach(rede => {
        document.querySelectorAll(`#contato-${rede}, [data-rede="${rede}"]`)
          .forEach(el => { el.style.display = 'none'; });
      });
    });
})();
