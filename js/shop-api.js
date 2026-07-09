/* ═══════════════════════════════════════════════════════════
   BIFFI.ONLINE — LOJINHA: API + CARRINHO
   Reaproveita o mesmo login/token do jogo NectarMine (localStorage
   "nm_token"), pois a loja usa o mesmo backend/banco de dados.
   Requer: NectarMine/server/server.js rodando no Railway.
   ═══════════════════════════════════════════════════════════ */

const SHOP_API = {
  // Mesma lógica de detecção de domínio usada em NectarMine/js/api.js
  base: (location.hostname === 'biffionline-production.up.railway.app' || location.hostname === 'localhost')
    ? ''
    : 'https://biffionline-production.up.railway.app',

  token: () => localStorage.getItem('nm_token'),

  async call(path, method = 'GET', body = null) {
    const headers = { 'Content-Type': 'application/json' };
    const t = SHOP_API.token();
    if (t) headers['Authorization'] = 'Bearer ' + t;
    const res = await fetch(SHOP_API.base + path, { method, headers, body: body ? JSON.stringify(body) : null });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Erro na comunicação com o servidor.');
    return data;
  },

  listarProdutos: () => SHOP_API.call('/api/shop/products'),
  produto: (id) => SHOP_API.call(`/api/shop/products/${id}`),
  me: () => SHOP_API.call('/api/me'),
  perfil: () => SHOP_API.call('/api/me/perfil'),
  salvarPerfil: (dados) => SHOP_API.call('/api/me/perfil', 'PUT', dados),
  salvarEndereco: (endereco) => SHOP_API.call('/api/me/enderecos', 'POST', endereco),
  checkout: (payload) => SHOP_API.call('/api/checkout', 'POST', payload),
  meusPedidos: () => SHOP_API.call('/api/shop/pedidos'),
  pedido: (id) => SHOP_API.call(`/api/shop/pedidos/${id}`),
  meusLivros: () => SHOP_API.call('/api/me/livros'),
};

/* ── CARRINHO (client-side, localStorage — some no dispositivo do usuário) ── */
const CART_KEY = 'biffi_cart';

const CART = {
  itens() {
    try { return JSON.parse(localStorage.getItem(CART_KEY) || '[]'); } catch { return []; }
  },

  salvar(itens) {
    localStorage.setItem(CART_KEY, JSON.stringify(itens));
    document.dispatchEvent(new CustomEvent('cart:changed', { detail: { itens } }));
  },

  adicionar(produto, quantidade = 1) {
    const itens = CART.itens();
    const existente = itens.find(i => i.produto_id === produto.id);
    if (existente) existente.quantidade += quantidade;
    else itens.push({ produto_id: produto.id, nome: produto.nome, preco_cents: produto.preco_cents, imagem: produto.imagem, quantidade });
    CART.salvar(itens);
  },

  atualizarQuantidade(produtoId, quantidade) {
    let itens = CART.itens();
    if (quantidade <= 0) itens = itens.filter(i => i.produto_id !== produtoId);
    else itens = itens.map(i => i.produto_id === produtoId ? { ...i, quantidade } : i);
    CART.salvar(itens);
  },

  remover(produtoId) {
    CART.salvar(CART.itens().filter(i => i.produto_id !== produtoId));
  },

  limpar() { CART.salvar([]); },

  totalCents() { return CART.itens().reduce((s, i) => s + i.preco_cents * i.quantidade, 0); },
  totalItens() { return CART.itens().reduce((s, i) => s + i.quantidade, 0); },
};

/* ── HELPERS DE EXIBIÇÃO ── */
function formatarReais(cents) {
  return 'R$ ' + (Number(cents) / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// "imagem" vem do banco: pode ser um emoji (ex: "📓") ou o nome de um arquivo de
// imagem (ex: "Capa BIFFI .jpeg"), sempre relativo à raiz do site.
function imagemProdutoHTML(imagem) {
  if (imagem && /\.(jpe?g|png|webp|gif|svg)$/i.test(imagem)) {
    return `<img src="${imagem}" alt="" style="width:100%;height:100%;object-fit:cover;">`;
  }
  return imagem || '🛍️';
}

const STATUS_LABEL = {
  aguardando_pagamento: { texto: 'Aguardando pagamento', cor: '#B8860B' },
  pago:                 { texto: 'Pago', cor: '#2e7d4f' },
  enviado:               { texto: 'Enviado', cor: '#2563eb' },
  entregue:              { texto: 'Entregue', cor: '#2e7d4f' },
  cancelado:             { texto: 'Cancelado', cor: '#b91c1c' },
};
