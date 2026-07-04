/* ═══════════════════════════════════════
   NECTARMINE — Global JS
   ═══════════════════════════════════════ */

/* ── LOADER ── */
const NM_LOADER_TEXTS = [
  'Aquecendo as colmeias...',
  'Convocando as abelhas...',
  'Calculando produção de mel...',
  'Sincronizando apiários...',
  'Preparando o mercado...',
  'Envasando potes...',
  'Monitorando florais...',
  'Verificando estoque de mel...',
];

function nmInitLoader() {
  const loader = document.getElementById('nm-loader');
  const loaderText = document.getElementById('loader-text');
  if (!loader) return;

  let idx = 0;
  const interval = setInterval(() => {
    idx = (idx + 1) % NM_LOADER_TEXTS.length;
    if (loaderText) loaderText.textContent = NM_LOADER_TEXTS[idx];
  }, 900);

  window.addEventListener('load', () => {
    setTimeout(() => {
      loader.classList.add('hide');
      clearInterval(interval);
      setTimeout(() => loader.remove(), 500);
    }, 2400);
  });
}

/* ── SIDEBAR MOBILE ── */
function nmInitSidebar() {
  const toggle = document.querySelector('.menu-toggle');
  const sidebar = document.querySelector('.sidebar');
  if (!toggle || !sidebar) return;

  toggle.addEventListener('click', () => {
    sidebar.classList.toggle('open');
  });

  // Fechar ao clicar fora
  document.addEventListener('click', (e) => {
    if (!sidebar.contains(e.target) && !toggle.contains(e.target)) {
      sidebar.classList.remove('open');
    }
  });
}

/* ── FORMATAR NÚMEROS ── */
function nmFormat(num, decimals = 2) {
  if (num === null || num === undefined) return '0';
  return Number(num).toLocaleString('pt-BR', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals
  });
}

function nmFormatInt(num) {
  return Number(num).toLocaleString('pt-BR');
}

/* ── SWAL TEMAS ── */
const NM_SWAL = {
  confirm: (title, text, confirmText = 'Confirmar') => {
    return Swal.fire({
      title, html: text,
      background: '#0A1220',
      color: '#D4C9E8',
      confirmButtonText: confirmText,
      confirmButtonColor: '#FFD700',
      cancelButtonText: 'Cancelar',
      showCancelButton: true,
      cancelButtonColor: 'rgba(255,255,255,0.08)',
      customClass: { popup: 'nm-swal' }
    });
  },
  success: (title, text) => {
    return Swal.fire({
      icon: 'success',
      title, html: text,
      background: '#0A1220',
      color: '#D4C9E8',
      confirmButtonColor: '#FFD700',
      confirmButtonText: 'OK',
      customClass: { popup: 'nm-swal' }
    });
  },
  error: (title, text) => {
    return Swal.fire({
      icon: 'error',
      title, html: text,
      background: '#0A1220',
      color: '#D4C9E8',
      confirmButtonColor: '#7B2FBE',
      customClass: { popup: 'nm-swal' }
    });
  },
  info: (title, text) => {
    return Swal.fire({
      icon: 'info',
      title, html: text,
      background: '#0A1220',
      color: '#D4C9E8',
      confirmButtonColor: '#FFD700',
      customClass: { popup: 'nm-swal' }
    });
  },
  // Modal com anúncio (interstitial)
  withAd: (title, text, confirmText = 'Continuar', adSlotId = '') => {
    const adHtml = adSlotId
      ? `<div id="${adSlotId}" style="width:300px;height:250px;background:rgba(255,215,0,0.04);border:1px dashed rgba(255,215,0,0.15);border-radius:6px;display:flex;align-items:center;justify-content:center;color:#6B5F8A;font-size:11px;margin:16px auto;">Publicidade 300×250</div>`
      : '';
    return Swal.fire({
      title, html: `<p style="color:#9E8FC0;margin-bottom:12px;">${text}</p>${adHtml}`,
      background: '#0A1220',
      color: '#D4C9E8',
      confirmButtonText: confirmText,
      confirmButtonColor: '#FFD700',
      showCancelButton: false,
      customClass: { popup: 'nm-swal' }
    });
  },
  // Modal comunicativo da tela de login (Título / texto / Subtítulo / texto),
  // conteúdo vem do backend (/api/announcement) e será editável por um painel admin.
  anuncio: (titulo, texto, subtitulo, texto2) => {
    return Swal.fire({
      title: titulo || '',
      html: `
        ${texto ? `<p style="color:#D4C9E8;font-size:14px;line-height:1.7;margin-bottom:16px;">${texto}</p>` : ''}
        ${subtitulo ? `<h3 style="color:#FFD700;font-size:15px;margin-bottom:8px;">${subtitulo}</h3>` : ''}
        ${texto2 ? `<p style="color:#9E8FC0;font-size:13px;line-height:1.6;">${texto2}</p>` : ''}
      `,
      background: '#0A1220',
      color: '#D4C9E8',
      confirmButtonText: 'Continuar',
      confirmButtonColor: '#FFD700',
      allowOutsideClick: false,
      allowEscapeKey: false,
      showCancelButton: false,
      customClass: { popup: 'nm-swal' }
    });
  }
};

/* ── TICKER DE MERCADO ── */
function nmInitTicker(items = []) {
  const track = document.querySelector('.market-ticker-track');
  if (!track) return;

  const defaultItems = [
    { label: '🍯 Mel Bruto', price: '24,57', change: '+6.51%', up: true },
    { label: '🌸 Flores (energia)', price: '0,04', change: '-1.2%', up: false },
    { label: '🐝 Apiário Industrial', price: '3.438', change: '+2.1%', up: true },
    { label: '📦 Pote Estocado', price: '24,57', change: '+6.51%', up: true },
    { label: '💎 Néctar', price: '$ 26,21', change: '+0.8%', up: true },
    { label: '🏭 Plataforma Quântica', price: '16.500', change: '0.0%', up: true },
  ];

  const data = items.length ? items : [...defaultItems, ...defaultItems]; // duplicar para loop contínuo
  track.innerHTML = data.map(i => `
    <span class="ticker-item">
      ${i.label}
      <strong style="color:var(--amarelo)">${i.price}</strong>
      <span class="${i.up ? 'up' : 'down'}">${i.up ? '▲' : '▼'} ${i.change}</span>
    </span>
  `).join('');
}

/* ── BARRA DE PROGRESSO ANIMADA ── */
function nmAnimateProgress(selector, targetPercent, delay = 300) {
  setTimeout(() => {
    const fill = document.querySelector(selector);
    if (fill) fill.style.width = Math.min(100, targetPercent) + '%';
  }, delay);
}

/* ── MARCAR LINK ATIVO NA SIDEBAR ── */
function nmSetActiveNav() {
  const path = window.location.pathname;
  document.querySelectorAll('.nav-link').forEach(link => {
    const href = link.getAttribute('href');
    if (href && href !== '#' && path.includes(href.replace('.html',''))) {
      link.classList.add('active');
    }
  });
}

/* ── INIT ── */
document.addEventListener('DOMContentLoaded', () => {
  nmInitLoader();
  nmInitSidebar();
  nmSetActiveNav();
  nmInitTicker();
});
