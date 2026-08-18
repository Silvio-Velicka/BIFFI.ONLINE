/* ═══════════════════════════════════════
   BIFFI.ONLINE — Novidades da Página
   Busca a lista de novidades ativas cadastradas no admin para esta página
   específica e mostra no final do conteúdo, mais recente primeiro — cada
   uma com a data de publicação original (fixa: não muda se o texto for
   editado depois no admin). Cada página (Missão, Quem sou, O Sonho, Sala de
   Oração, Biblioteca de Oração) tem sua própria lista, independente das
   demais — não é um mural compartilhado.
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

  function formatarData(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    if (isNaN(d)) return '';
    return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' });
  }

  async function carregarNovidades() {
    const anchor = document.getElementById('novidade-pagina');
    if (!anchor) return;
    const pagina = anchor.dataset.pagina;
    if (!pagina) return;

    try {
      const res = await fetch(`${API_BASE}/api/novidades/${pagina}`);
      const data = await res.json();
      const lista = (data && Array.isArray(data.novidades)) ? data.novidades : [];
      if (!lista.length) return;

      anchor.innerHTML = `
        <div class="novidade-secao">
          ${lista.map(n => `
            <div class="novidade-box">
              <span class="novidade-icon">✨</span>
              <span class="novidade-data">${escapeHtml(formatarData(n.data_publicacao))}</span>
              ${n.titulo ? `<h2>${escapeHtml(n.titulo)}</h2>` : ''}
              <p>${escapeHtml(n.texto)}</p>
            </div>
          `).join('')}
        </div>
      `;
    } catch (e) {
      // Falha silenciosa — se a API não responder, a página segue normal sem as novidades.
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', carregarNovidades);
  } else {
    carregarNovidades();
  }
})();
