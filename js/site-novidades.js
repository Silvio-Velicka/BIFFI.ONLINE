/* ═══════════════════════════════════════
   BIFFI.ONLINE — Novidade da Página
   Busca (se houver) o aviso/novidade cadastrado no admin para esta página
   específica e mostra no final do conteúdo. Cada página (Missão, Quem sou,
   O Sonho, Sala de Oração, Biblioteca de Oração) tem seu próprio texto,
   independente das demais — não é um mural compartilhado.
   Precisa de um elemento âncora na página: <div id="novidade-pagina" data-pagina="...">
   Falha em silêncio — nunca trava nem quebra a página do visitante.
   ═══════════════════════════════════════ */
(function () {
  const API_BASE = 'https://biffionline-production.up.railway.app';

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  async function carregarNovidade() {
    const anchor = document.getElementById('novidade-pagina');
    if (!anchor) return;
    const pagina = anchor.dataset.pagina;
    if (!pagina) return;

    try {
      const res = await fetch(`${API_BASE}/api/novidades/${pagina}`);
      const data = await res.json();
      if (!data || !data.ativo || !data.texto) return;

      anchor.innerHTML = `
        <div class="novidade-box">
          <span class="novidade-icon">✨</span>
          ${data.titulo ? `<h2>${escapeHtml(data.titulo)}</h2>` : ''}
          <p>${escapeHtml(data.texto).replace(/\n/g, '<br>')}</p>
        </div>
      `;
    } catch (e) {
      // Falha silenciosa — se a API não responder, a página segue normal sem a novidade.
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', carregarNovidade);
  } else {
    carregarNovidade();
  }
})();
