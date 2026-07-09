/* ═══════════════════════════════════════
   BIFFI.ONLINE ADMIN — Cliente da API
   Fala com o backend do NectarMine (Railway), que é o único
   backend/banco de dados que o site tem hoje.
   ═══════════════════════════════════════ */

const BiffiAdmin = {
  base: 'https://biffionline-production.up.railway.app',
  key: () => localStorage.getItem('biffi_admin_key'),

  async login(senha) {
    const res = await fetch(this.base + '/api/admin/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ senha })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Senha incorreta.');
    localStorage.setItem('biffi_admin_key', senha);
    return true;
  },

  logout() {
    localStorage.removeItem('biffi_admin_key');
    location.href = 'login.html';
  },

  // Garante que existe uma chave salva; senão manda pro login
  requireAuth() {
    if (!this.key()) {
      location.href = 'login.html';
      throw new Error('Não autenticado.');
    }
  },

  async getAnnouncement() {
    const res = await fetch(this.base + '/api/announcement');
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Erro ao carregar dados.');
    return data;
  },

  async saveAnnouncement(payload) {
    const res = await fetch(this.base + '/api/announcement', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'x-admin-key': this.key() || ''
      },
      body: JSON.stringify(payload)
    });
    const data = await res.json().catch(() => ({}));
    if (res.status === 403) {
      // chave inválida/expirada — volta pro login
      localStorage.removeItem('biffi_admin_key');
      location.href = 'login.html?expirado=1';
      throw new Error('Sessão expirada.');
    }
    if (!res.ok) throw new Error(data.error || 'Erro ao salvar.');
    return data;
  },

  /* ── LOJINHA: PRODUTOS ── */
  async _fetch(path, method = 'GET', body = null) {
    const res = await fetch(this.base + path, {
      method,
      headers: { 'Content-Type': 'application/json', 'x-admin-key': this.key() || '' },
      body: body ? JSON.stringify(body) : null,
    });
    const data = await res.json().catch(() => ({}));
    if (res.status === 403) {
      localStorage.removeItem('biffi_admin_key');
      location.href = 'login.html?expirado=1';
      throw new Error('Sessão expirada.');
    }
    if (!res.ok) throw new Error(data.error || 'Erro na comunicação com o servidor.');
    return data;
  },

  getProdutos() { return this._fetch('/api/admin/products'); },
  criarProduto(payload) { return this._fetch('/api/admin/products', 'POST', payload); },
  atualizarProduto(id, payload) { return this._fetch(`/api/admin/products/${id}`, 'PUT', payload); },
  excluirProduto(id) { return this._fetch(`/api/admin/products/${id}`, 'DELETE'); },

  /* ── LOJINHA: LIVRARIA DIGITAL (e-book) ── */
  getLivrariaPastas() { return this._fetch('/api/admin/livraria-pastas'); },
  vincularLivroDigital(produtoId, slug, totalPaginas) {
    return this._fetch('/api/admin/livros-digitais', 'POST', { produto_id: produtoId, slug, total_paginas: totalPaginas });
  },

  // Envia um PDF direto pro produto: o servidor converte em páginas-imagem e
  // já vincula como e-book automaticamente (sem precisar escolher pasta depois).
  async enviarPdfEbook(produtoId, file) {
    const formData = new FormData();
    formData.append('produto_id', produtoId);
    formData.append('pdf', file);
    const res = await fetch(this.base + '/api/admin/livros-digitais/upload', {
      method: 'POST',
      // Sem Content-Type manual — o navegador define o boundary do multipart sozinho.
      headers: { 'x-admin-key': this.key() || '' },
      body: formData,
    });
    const data = await res.json().catch(() => ({}));
    if (res.status === 403) {
      localStorage.removeItem('biffi_admin_key');
      location.href = 'login.html?expirado=1';
      throw new Error('Sessão expirada.');
    }
    if (!res.ok) throw new Error(data.error || 'Erro ao enviar o PDF.');
    return data;
  },

  /* ── LOJINHA: PEDIDOS ── */
  getPedidos(status) { return this._fetch('/api/admin/pedidos' + (status ? `?status=${status}` : '')); },
  atualizarStatusPedido(id, status) { return this._fetch(`/api/admin/pedidos/${id}`, 'PUT', { status }); },
};
