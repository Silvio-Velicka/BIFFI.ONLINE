/* ═══════════════════════════════════════════════════════════
   NECTARMINE — Servidor (Node.js + SQLite)
   Zero dependências externas. Requer Node.js 22 ou superior.
   Rodar:  node server/server.js
   Site:   http://localhost:3000
   ═══════════════════════════════════════════════════════════ */

const http = require('node:http');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFile } = require('node:child_process');
const { DatabaseSync } = require('node:sqlite');

const PORT = process.env.PORT || 3000;
const ROOT = path.join(__dirname, '..');            // pasta do site (HTML)
const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'nectarmine.db'); // usar DB_PATH em produção (ex: volume do Railway)
const SESSION_DAYS = 30;

/* ── BANCO DE DADOS ── */
const db = new DatabaseSync(DB_PATH);
db.exec(`
  PRAGMA journal_mode = WAL;

  CREATE TABLE IF NOT EXISTS users (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    username   TEXT NOT NULL UNIQUE COLLATE NOCASE,
    email      TEXT NOT NULL UNIQUE COLLATE NOCASE,
    pass_hash  TEXT NOT NULL,
    salt       TEXT NOT NULL,
    avatar     TEXT NOT NULL DEFAULT '🐝',
    level      INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS sessions (
    token      TEXT PRIMARY KEY,
    user_id    INTEGER NOT NULL REFERENCES users(id),
    expires_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS game_state (
    user_id        INTEGER PRIMARY KEY REFERENCES users(id),
    nct            REAL    NOT NULL DEFAULT 1000,
    mel            REAL    NOT NULL DEFAULT 0,
    flores         INTEGER NOT NULL DEFAULT 100,
    potes          INTEGER NOT NULL DEFAULT 0,
    total_potes    INTEGER NOT NULL DEFAULT 0,
    total_entregas INTEGER NOT NULL DEFAULT 0,
    data           TEXT    NOT NULL DEFAULT '{}',
    updated_at     TEXT    NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS event_log (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id    INTEGER NOT NULL REFERENCES users(id),
    tipo       TEXT NOT NULL,               -- 'producao' | 'entrega'
    amount     INTEGER NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_event ON event_log (tipo, created_at);

  -- Modal comunicativo da tela de login (editável futuramente por um painel admin)
  CREATE TABLE IF NOT EXISTS site_config (
    id                INTEGER PRIMARY KEY CHECK (id = 1),
    anuncio_ativo     INTEGER NOT NULL DEFAULT 1,
    anuncio_titulo    TEXT    NOT NULL DEFAULT '🍯 Bem-vindo ao NectarMine!',
    anuncio_texto     TEXT    NOT NULL DEFAULT 'Produza mel, negocie no mercado e construa sua colmeia digital.',
    anuncio_subtitulo TEXT    NOT NULL DEFAULT 'Aviso importante',
    anuncio_texto2    TEXT    NOT NULL DEFAULT 'Este é um jogo de simulação. Nenhum valor possui garantia de retorno real.',
    updated_at        TEXT    NOT NULL DEFAULT (datetime('now'))
  );
  INSERT OR IGNORE INTO site_config (id) VALUES (1);

  /* ═══ LOJINHA (E-COMMERCE) ═══
     Reaproveita o mesmo banco/tabela users do jogo (mesmo login), mas o
     checkout precisa de mais dados do que o jogo (CPF, telefone, endereço). */

  CREATE TABLE IF NOT EXISTS enderecos (
    id                 INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id            INTEGER NOT NULL REFERENCES users(id),
    nome_destinatario  TEXT    NOT NULL,
    cep                TEXT    NOT NULL,
    rua                TEXT    NOT NULL,
    numero             TEXT    NOT NULL,
    complemento        TEXT    NOT NULL DEFAULT '',
    bairro             TEXT    NOT NULL,
    cidade             TEXT    NOT NULL,
    estado             TEXT    NOT NULL,
    padrao             INTEGER NOT NULL DEFAULT 0,
    created_at         TEXT    NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_enderecos_user ON enderecos (user_id);

  CREATE TABLE IF NOT EXISTS produtos (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    nome          TEXT    NOT NULL,
    descricao     TEXT    NOT NULL DEFAULT '',
    preco_cents   INTEGER NOT NULL,
    imagem        TEXT    NOT NULL DEFAULT '🛍️',
    categoria     TEXT    NOT NULL DEFAULT '',
    estoque       INTEGER NOT NULL DEFAULT 0,
    ilimitado     INTEGER NOT NULL DEFAULT 1,
    destaque      INTEGER NOT NULL DEFAULT 0,
    ativo         INTEGER NOT NULL DEFAULT 1,
    ordem         INTEGER NOT NULL DEFAULT 0,
    created_at    TEXT    NOT NULL DEFAULT (datetime('now')),
    updated_at    TEXT    NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS pedidos (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id             INTEGER NOT NULL REFERENCES users(id),
    status              TEXT    NOT NULL DEFAULT 'aguardando_pagamento',
    metodo_pagamento    TEXT    NOT NULL DEFAULT 'manual',
    pagamento_ref       TEXT    NOT NULL DEFAULT '',
    pagamento_url       TEXT    NOT NULL DEFAULT '',
    subtotal_cents      INTEGER NOT NULL DEFAULT 0,
    frete_cents         INTEGER NOT NULL DEFAULT 0,
    total_cents         INTEGER NOT NULL DEFAULT 0,
    nome_destinatario   TEXT    NOT NULL DEFAULT '',
    cpf                 TEXT    NOT NULL DEFAULT '',
    telefone            TEXT    NOT NULL DEFAULT '',
    email               TEXT    NOT NULL DEFAULT '',
    cep                 TEXT    NOT NULL DEFAULT '',
    rua                 TEXT    NOT NULL DEFAULT '',
    numero              TEXT    NOT NULL DEFAULT '',
    complemento         TEXT    NOT NULL DEFAULT '',
    bairro              TEXT    NOT NULL DEFAULT '',
    cidade              TEXT    NOT NULL DEFAULT '',
    estado              TEXT    NOT NULL DEFAULT '',
    created_at          TEXT    NOT NULL DEFAULT (datetime('now')),
    updated_at          TEXT    NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_pedidos_user ON pedidos (user_id, created_at);

  CREATE TABLE IF NOT EXISTS pedido_itens (
    id                   INTEGER PRIMARY KEY AUTOINCREMENT,
    pedido_id            INTEGER NOT NULL REFERENCES pedidos(id),
    produto_id           INTEGER REFERENCES produtos(id),
    nome_snapshot        TEXT    NOT NULL,
    preco_cents_snapshot INTEGER NOT NULL,
    quantidade           INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_itens_pedido ON pedido_itens (pedido_id);

  /* ═══ LIVRARIA DIGITAL (e-book protegido) ═══
     Um produto da loja pode ser um e-book: em vez de ser enviado pelo correio,
     o cliente lê pelo navegador, página por página, direto pelo servidor —
     o arquivo original (PDF) nunca é exposto, só imagens de cada página,
     geradas com marca d'água do comprador na hora da leitura. */
  CREATE TABLE IF NOT EXISTS livros_digitais (
    produto_id     INTEGER PRIMARY KEY REFERENCES produtos(id),
    slug           TEXT    NOT NULL UNIQUE,
    total_paginas  INTEGER NOT NULL,
    created_at     TEXT    NOT NULL DEFAULT (datetime('now'))
  );
`);

/* ── MIGRAÇÃO LEVE: novas colunas em users para dados de compra ──
   (ALTER TABLE ADD COLUMN quebra se a coluna já existir, então checamos antes) */
{
  const cols = db.prepare(`PRAGMA table_info(users)`).all().map(c => c.name);
  const addCol = (name, def) => { if (!cols.includes(name)) db.exec(`ALTER TABLE users ADD COLUMN ${name} ${def}`); };
  addCol('nome_completo', `TEXT NOT NULL DEFAULT ''`);
  addCol('cpf', `TEXT NOT NULL DEFAULT ''`);
  addCol('telefone', `TEXT NOT NULL DEFAULT ''`);
}

/* ── SEED: produtos iniciais da loja (só roda se a tabela estiver vazia) ── */
{
  const { n } = db.prepare('SELECT COUNT(*) AS n FROM produtos').get();
  if (n === 0) {
    const seed = db.prepare(`
      INSERT INTO produtos (nome, descricao, preco_cents, imagem, categoria, estoque, ilimitado, destaque, ativo, ordem)
      VALUES (@nome, @descricao, @preco_cents, @imagem, @categoria, @estoque, @ilimitado, @destaque, 1, @ordem)
    `);
    const produtosIniciais = [
      { nome: 'Livro BIFFI', descricao: 'Uma leitura transformadora que convida você a mergulhar no autoconhecimento, a reconhecer seu valor e a escrever uma história que é verdadeiramente sua.', preco_cents: 4990, imagem: 'Capa BIFFI .jpeg', categoria: 'livros', estoque: 0, ilimitado: 1, destaque: 1, ordem: 0 },
      { nome: 'Diário de Gratidão', descricao: '', preco_cents: 3490, imagem: '📓', categoria: 'papelaria', estoque: 0, ilimitado: 1, destaque: 0, ordem: 1 },
      { nome: 'Kit Meditação', descricao: '', preco_cents: 7990, imagem: '🕯️', categoria: 'bem-estar', estoque: 0, ilimitado: 1, destaque: 0, ordem: 2 },
      { nome: 'Pulseira Intenção', descricao: '', preco_cents: 2990, imagem: '📿', categoria: 'acessorios', estoque: 0, ilimitado: 1, destaque: 0, ordem: 3 },
      { nome: 'Chá da Calma', descricao: '', preco_cents: 2490, imagem: '🫖', categoria: 'bem-estar', estoque: 0, ilimitado: 1, destaque: 0, ordem: 4 },
    ];
    for (const p of produtosIniciais) seed.run(p);
  }
}

/* ── HELPERS ── */
function hashPassword(password, salt) {
  return crypto.scryptSync(password, salt, 64).toString('hex');
}

function createSession(userId) {
  const token = crypto.randomBytes(32).toString('hex');
  const expires = new Date(Date.now() + SESSION_DAYS * 864e5).toISOString();
  db.prepare('INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)').run(token, userId, expires);
  return token;
}

function getUserByToken(req) {
  const auth = req.headers['authorization'] || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  if (!token) return null;
  const row = db.prepare(`
    SELECT u.id, u.username, u.email, u.avatar, u.level, u.created_at
    FROM sessions s JOIN users u ON u.id = s.user_id
    WHERE s.token = ? AND s.expires_at > datetime('now')
  `).get(token);
  return row || null;
}

function json(res, status, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', c => { data += c; if (data.length > 1e6) req.destroy(); });
    req.on('end', () => { try { resolve(data ? JSON.parse(data) : {}); } catch { reject(new Error('JSON inválido')); } });
    req.on('error', reject);
  });
}

const PERIODOS = {
  diario:  "datetime('now','start of day')",
  semanal: "datetime('now','-7 days')",
  mensal:  "datetime('now','start of month')",
};

/* ── LOJINHA: HELPERS ── */
function isAdmin(req) {
  const key = req.headers['x-admin-key'] || '';
  return !!(process.env.ADMIN_KEY && key === process.env.ADMIN_KEY);
}

function produtoPublico(p) {
  const ebook = !!db.prepare('SELECT 1 FROM livros_digitais WHERE produto_id = ?').get(p.id);
  return {
    id: p.id, nome: p.nome, descricao: p.descricao, preco_cents: p.preco_cents,
    imagem: p.imagem, categoria: p.categoria, destaque: !!p.destaque,
    disponivel: !!p.ilimitado || p.estoque > 0,
    ebook,
  };
}

// Frete simples: grátis acima de R$150, senão R$15 fixo. Ajustável depois (ex: por CEP/transportadora).
function calcularFrete(subtotalCents) {
  return subtotalCents >= 15000 ? 0 : 1500;
}

// Verifica se o usuário comprou (com pagamento confirmado) um determinado produto —
// usado para liberar acesso à leitura do e-book.
function usuarioComprouProduto(userId, produtoId) {
  const row = db.prepare(`
    SELECT 1 FROM pedidos p
    JOIN pedido_itens i ON i.pedido_id = p.id
    WHERE p.user_id = ? AND i.produto_id = ? AND p.status IN ('pago', 'enviado', 'entregue')
    LIMIT 1
  `).get(userId, produtoId);
  return !!row;
}

/* ── LIVRARIA DIGITAL: leitura protegida de e-book ──
   As páginas (PNG) ficam em NectarMine/server/biblioteca-privada/<slug>/,
   uma pasta dentro de "server" — já bloqueada para acesso estático direto
   pelo serveStatic (ver mais abaixo). Cada página só é servida depois de
   confirmar login + compra, e sempre com marca d'água aplicada na hora
   (nunca existe uma cópia "limpa" acessível pela internet). */
const LIVRARIA_DIR = path.join(__dirname, 'biblioteca-privada');

/* ── AUTO-VÍNCULO produto ↔ e-book ──
   Evita precisar chamar a API manualmente depois de cada deploy: se a pasta
   de páginas já existir com imagens, e o produto correspondente ainda não
   estiver marcado como e-book, o próprio servidor faz o vínculo ao subir.
   Idempotente — roda toda vez que o servidor inicia, mas só insere uma vez. */
{
  const vinculosAutomaticos = [
    { produtoNome: 'Livro BIFFI', slug: 'mulheres-na-teologia' },
  ];
  for (const { produtoNome, slug } of vinculosAutomaticos) {
    const pasta = path.join(LIVRARIA_DIR, slug);
    if (!fs.existsSync(pasta)) continue;
    const totalPaginas = fs.readdirSync(pasta).filter(f => /^pagina-\d+\.png$/.test(f)).length;
    if (totalPaginas === 0) continue;
    const produto = db.prepare('SELECT id FROM produtos WHERE nome = ?').get(produtoNome);
    if (!produto) continue;
    const jaVinculado = db.prepare('SELECT 1 FROM livros_digitais WHERE produto_id = ?').get(produto.id);
    if (jaVinculado) continue;
    db.prepare('INSERT INTO livros_digitais (produto_id, slug, total_paginas) VALUES (?, ?, ?)').run(produto.id, slug, totalPaginas);
    console.log(`📖 E-book vinculado automaticamente: "${produtoNome}" → ${slug} (${totalPaginas} páginas)`);
  }
}

// Limite simples de requisições por usuário, pra dificultar raspagem em massa das páginas
const leituraRate = new Map(); // userId -> { count, resetAt }
const RATE_LIMITE_JANELA_MS = 60_000;
const RATE_LIMITE_MAX = 90;
function checarRateLimiteLeitura(userId) {
  const agora = Date.now();
  let r = leituraRate.get(userId);
  if (!r || agora > r.resetAt) { r = { count: 0, resetAt: agora + RATE_LIMITE_JANELA_MS }; leituraRate.set(userId, r); }
  r.count++;
  return r.count <= RATE_LIMITE_MAX;
}

let _fontRodape = null, _fontDiagonal = null;
async function fontesMarcaDagua() {
  if (!_fontRodape) {
    const { loadFont } = require('jimp');
    const { SANS_16_WHITE, SANS_16_BLACK } = require('jimp/fonts');
    _fontRodape = await loadFont(SANS_16_WHITE);
    _fontDiagonal = await loadFont(SANS_16_BLACK);
  }
  return { fontRodape: _fontRodape, fontDiagonal: _fontDiagonal };
}

// Aplica marca d'água diagonal (tênue, repetida) + rodapé legível com dados de
// quem está lendo — se a imagem vazar, dá pra saber de qual conta ela saiu.
async function gerarPaginaComMarcaDagua(caminhoArquivo, linhaRodape, textoDiagonal) {
  const { Jimp, JimpMime } = require('jimp');
  const { fontRodape, fontDiagonal } = await fontesMarcaDagua();

  const img = await Jimp.read(caminhoArquivo);

  const tile = new Jimp({ width: 320, height: 50, color: 0x00000000 });
  tile.print({ font: fontDiagonal, x: 0, y: 0, text: textoDiagonal });
  tile.opacity(0.10);
  tile.rotate(-28, false);
  for (let y = -80; y < img.height + 80; y += 190) {
    for (let x = -80; x < img.width + 80; x += 300) {
      img.composite(tile, x, y);
    }
  }

  const faixa = new Jimp({ width: img.width, height: 26, color: 0x00000099 });
  img.composite(faixa, 0, img.height - 26);
  img.print({ font: fontRodape, x: 10, y: img.height - 22, text: linhaRodape });

  return img.getBuffer(JimpMime.png);
}

// Gera um nome de pasta seguro a partir do nome do produto (sem acentos/espaços)
const DIACRITICOS_RE = new RegExp('[̀-ͯ]', 'g');
function slugify(texto) {
  return String(texto)
    .normalize('NFD').replace(DIACRITICOS_RE, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'livro';
}

// Converte um PDF em páginas PNG (via pdftoppm, do pacote poppler-utils —
// ver NectarMine/nixpacks.toml) e renomeia pro padrão pagina-0001.png que o
// leitor espera. Roda uma vez, no upload feito pelo admin; nunca em tempo real.
function converterPdfEmPaginas(pdfPath, destDir) {
  return new Promise((resolve, reject) => {
    execFile('pdftoppm', ['-png', '-r', '150', pdfPath, path.join(destDir, 'pagina')],
      { maxBuffer: 1024 * 1024 * 20 },
      (err) => {
        if (err) return reject(err);
        try {
          const arquivos = fs.readdirSync(destDir)
            .filter(f => /^pagina-?\d+\.png$/.test(f))
            .sort((a, b) => Number(a.match(/(\d+)/)[1]) - Number(b.match(/(\d+)/)[1]));
          arquivos.forEach((f, i) => {
            const novoNome = `pagina-${String(i + 1).padStart(4, '0')}.png`;
            if (f !== novoNome) fs.renameSync(path.join(destDir, f), path.join(destDir, novoNome));
          });
          resolve(arquivos.length);
        } catch (e) { reject(e); }
      });
  });
}

/* ── LOJINHA: INTEGRAÇÃO DE PAGAMENTO (Mercado Pago / PayPal) ──
   As chaves ainda não foram configuradas. Enquanto MP_ACCESS_TOKEN /
   PAYPAL_CLIENT_ID+SECRET não existirem nas variáveis de ambiente (Railway),
   o checkout cai automaticamente no modo "manual" (pedido registrado,
   combinamos o pagamento por fora). Assim que as chaves existirem, essas
   funções passam a devolver um link real de pagamento — nenhuma outra
   mudança de código é necessária. */

async function criarPagamentoMercadoPago(pedido, itens) {
  if (!process.env.MP_ACCESS_TOKEN) return null; // TODO: configurar MP_ACCESS_TOKEN no Railway
  try {
    const resp = await fetch('https://api.mercadopago.com/checkout/preferences', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.MP_ACCESS_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        items: itens.map(i => ({
          title: i.nome_snapshot,
          quantity: i.quantidade,
          unit_price: i.preco_cents_snapshot / 100,
          currency_id: 'BRL',
        })),
        external_reference: String(pedido.id),
        back_urls: {
          success: 'https://biffi.online/meus-pedidos.html',
          pending: 'https://biffi.online/meus-pedidos.html',
          failure: 'https://biffi.online/checkout.html',
        },
        notification_url: 'https://biffionline-production.up.railway.app/api/payments/mercadopago/webhook',
      }),
    });
    const data = await resp.json();
    if (!resp.ok) { console.error('Mercado Pago:', data); return null; }
    return { ref: data.id, url: data.init_point };
  } catch (e) {
    console.error('Erro Mercado Pago:', e);
    return null;
  }
}

async function criarPagamentoPaypal(pedido, itens, totalCents) {
  if (!process.env.PAYPAL_CLIENT_ID || !process.env.PAYPAL_CLIENT_SECRET) return null; // TODO: configurar no Railway
  const base = process.env.PAYPAL_MODE === 'live' ? 'https://api-m.paypal.com' : 'https://api-m.sandbox.paypal.com';
  try {
    const authResp = await fetch(`${base}/v1/oauth2/token`, {
      method: 'POST',
      headers: {
        'Authorization': 'Basic ' + Buffer.from(`${process.env.PAYPAL_CLIENT_ID}:${process.env.PAYPAL_CLIENT_SECRET}`).toString('base64'),
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: 'grant_type=client_credentials',
    });
    const authData = await authResp.json();
    if (!authResp.ok) { console.error('PayPal auth:', authData); return null; }

    const orderResp = await fetch(`${base}/v2/checkout/orders`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${authData.access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        intent: 'CAPTURE',
        purchase_units: [{
          reference_id: String(pedido.id),
          amount: { currency_code: 'USD', value: (totalCents / 100).toFixed(2) },
        }],
        application_context: {
          return_url: 'https://biffi.online/meus-pedidos.html',
          cancel_url: 'https://biffi.online/checkout.html',
        },
      }),
    });
    const orderData = await orderResp.json();
    if (!orderResp.ok) { console.error('PayPal order:', orderData); return null; }
    const approve = (orderData.links || []).find(l => l.rel === 'approve');
    return { ref: orderData.id, url: approve ? approve.href : null };
  } catch (e) {
    console.error('Erro PayPal:', e);
    return null;
  }
}

/* ── ROTAS DA API ── */
const routes = {

  'POST /api/register': async (req, res) => {
    const { username, email, password } = await readBody(req);
    if (!username || username.trim().length < 3) return json(res, 400, { error: 'Nome de usuário precisa de pelo menos 3 caracteres.' });
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json(res, 400, { error: 'E-mail inválido.' });
    if (!password || password.length < 6) return json(res, 400, { error: 'Senha precisa de pelo menos 6 caracteres.' });

    const exists = db.prepare('SELECT id FROM users WHERE username = ? OR email = ?').get(username.trim(), email.trim());
    if (exists) return json(res, 409, { error: 'Usuário ou e-mail já cadastrado.' });

    const salt = crypto.randomBytes(16).toString('hex');
    const hash = hashPassword(password, salt);
    const info = db.prepare('INSERT INTO users (username, email, pass_hash, salt) VALUES (?, ?, ?, ?)')
                   .run(username.trim(), email.trim().toLowerCase(), hash, salt);
    const userId = Number(info.lastInsertRowid);
    db.prepare('INSERT INTO game_state (user_id) VALUES (?)').run(userId);

    const token = createSession(userId);
    json(res, 201, { token, user: { id: userId, username: username.trim(), avatar: '🐝', level: 1 } });
  },

  'POST /api/login': async (req, res) => {
    const { login, password } = await readBody(req);
    if (!login || !password) return json(res, 400, { error: 'Informe usuário/e-mail e senha.' });
    const user = db.prepare('SELECT * FROM users WHERE username = ? OR email = ?').get(login.trim(), login.trim().toLowerCase());
    if (!user || hashPassword(password, user.salt) !== user.pass_hash) {
      return json(res, 401, { error: 'Usuário ou senha incorretos.' });
    }
    const token = createSession(user.id);
    json(res, 200, { token, user: { id: user.id, username: user.username, avatar: user.avatar, level: user.level } });
  },

  'POST /api/logout': async (req, res) => {
    const auth = req.headers['authorization'] || '';
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
    if (token) db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
    json(res, 200, { ok: true });
  },

  'GET /api/me': async (req, res) => {
    const user = getUserByToken(req);
    if (!user) return json(res, 401, { error: 'Não autenticado.' });
    const state = db.prepare('SELECT * FROM game_state WHERE user_id = ?').get(user.id);
    json(res, 200, { user, state: { ...state, data: JSON.parse(state.data || '{}') } });
  },

  'PUT /api/state': async (req, res) => {
    const user = getUserByToken(req);
    if (!user) return json(res, 401, { error: 'Não autenticado.' });
    const b = await readBody(req);
    const cur = db.prepare('SELECT * FROM game_state WHERE user_id = ?').get(user.id);
    const num = (v, old) => (typeof v === 'number' && isFinite(v) && v >= 0) ? v : old;

    db.prepare(`
      UPDATE game_state SET nct=?, mel=?, flores=?, potes=?, data=?, updated_at=datetime('now')
      WHERE user_id=?
    `).run(
      num(b.nct, cur.nct), num(b.mel, cur.mel),
      Math.floor(num(b.flores, cur.flores)), Math.floor(num(b.potes, cur.potes)),
      JSON.stringify(b.data ?? JSON.parse(cur.data || '{}')),
      user.id
    );
    if (typeof b.level === 'number' && b.level >= 1) {
      db.prepare('UPDATE users SET level=? WHERE id=?').run(Math.floor(b.level), user.id);
    }
    json(res, 200, { ok: true });
  },

  // Registra produção/entrega (alimenta rankings e totais)
  'POST /api/event': async (req, res) => {
    const user = getUserByToken(req);
    if (!user) return json(res, 401, { error: 'Não autenticado.' });
    const { tipo, amount } = await readBody(req);
    const qtd = Math.floor(Number(amount));
    if (!['producao', 'entrega'].includes(tipo) || !isFinite(qtd) || qtd <= 0 || qtd > 1e6) {
      return json(res, 400, { error: 'Evento inválido.' });
    }
    db.prepare('INSERT INTO event_log (user_id, tipo, amount) VALUES (?, ?, ?)').run(user.id, tipo, qtd);
    const col = tipo === 'producao' ? 'total_potes' : 'total_entregas';
    db.prepare(`UPDATE game_state SET ${col} = ${col} + ? WHERE user_id = ?`).run(qtd, user.id);
    json(res, 200, { ok: true });
  },

  'GET /api/ranking': async (req, res, url) => {
    const tipo = url.searchParams.get('tipo') === 'entregas' ? 'entrega' : 'producao';
    const periodo = url.searchParams.get('periodo') || 'diario';
    const user = getUserByToken(req); // opcional: marca "você" na lista

    let rows;
    if (periodo === 'alltime') {
      const col = tipo === 'producao' ? 'total_potes' : 'total_entregas';
      rows = db.prepare(`
        SELECT u.id, u.username, u.avatar, u.level, g.nct, g.${col} AS score
        FROM game_state g JOIN users u ON u.id = g.user_id
        WHERE g.${col} > 0
        ORDER BY score DESC, u.id ASC LIMIT 50
      `).all();
    } else {
      const desde = PERIODOS[periodo] || PERIODOS.diario;
      rows = db.prepare(`
        SELECT u.id, u.username, u.avatar, u.level, g.nct, SUM(e.amount) AS score
        FROM event_log e
        JOIN users u ON u.id = e.user_id
        JOIN game_state g ON g.user_id = u.id
        WHERE e.tipo = ? AND e.created_at >= ${desde}
        GROUP BY e.user_id
        ORDER BY score DESC, u.id ASC LIMIT 50
      `).all(tipo);
    }

    const ranking = rows.map((r, i) => ({
      pos: i + 1, id: r.id, username: r.username, avatar: r.avatar,
      level: r.level, nct: r.nct, score: Number(r.score), me: user ? r.id === user.id : false
    }));
    json(res, 200, { tipo, periodo, ranking });
  },

  // Modal comunicativo da tela de login — público, sem autenticação
  'GET /api/announcement': async (req, res) => {
    const row = db.prepare(`
      SELECT anuncio_ativo, anuncio_titulo, anuncio_texto, anuncio_subtitulo, anuncio_texto2
      FROM site_config WHERE id = 1
    `).get();
    json(res, 200, {
      ativo: !!(row && row.anuncio_ativo),
      titulo: row ? row.anuncio_titulo : '',
      texto: row ? row.anuncio_texto : '',
      subtitulo: row ? row.anuncio_subtitulo : '',
      texto2: row ? row.anuncio_texto2 : '',
    });
  },

  // Login do painel admin (senha única, comparada com a variável de ambiente ADMIN_KEY)
  'POST /api/admin/login': async (req, res) => {
    const { senha } = await readBody(req);
    if (!process.env.ADMIN_KEY || !senha || senha !== process.env.ADMIN_KEY) {
      return json(res, 403, { error: 'Senha incorreta.' });
    }
    json(res, 200, { ok: true });
  },

  // Atualiza o modal comunicativo — reservado para o futuro painel admin.
  // Protegido por chave simples (header x-admin-key) até existir login de admin de verdade.
  'PUT /api/announcement': async (req, res) => {
    const key = req.headers['x-admin-key'] || '';
    if (!process.env.ADMIN_KEY || key !== process.env.ADMIN_KEY) {
      return json(res, 403, { error: 'Não autorizado.' });
    }
    const b = await readBody(req);
    db.prepare(`
      UPDATE site_config SET
        anuncio_ativo = ?, anuncio_titulo = ?, anuncio_texto = ?,
        anuncio_subtitulo = ?, anuncio_texto2 = ?, updated_at = datetime('now')
      WHERE id = 1
    `).run(
      b.ativo ? 1 : 0,
      String(b.titulo ?? ''),
      String(b.texto ?? ''),
      String(b.subtitulo ?? ''),
      String(b.texto2 ?? '')
    );
    json(res, 200, { ok: true });
  },

  /* ═══ LOJINHA — ROTAS PÚBLICAS/CLIENTE ═══ */

  // Lista produtos ativos (vitrine da loja) — público
  'GET /api/shop/products': async (req, res) => {
    const rows = db.prepare('SELECT * FROM produtos WHERE ativo = 1 ORDER BY destaque DESC, ordem ASC, id ASC').all();
    json(res, 200, { produtos: rows.map(produtoPublico) });
  },

  // Perfil do usuário logado (nome/CPF/telefone) + endereços salvos
  'GET /api/me/perfil': async (req, res) => {
    const user = getUserByToken(req);
    if (!user) return json(res, 401, { error: 'Não autenticado.' });
    const perfil = db.prepare('SELECT username, email, nome_completo, cpf, telefone FROM users WHERE id = ?').get(user.id);
    const enderecos = db.prepare('SELECT * FROM enderecos WHERE user_id = ? ORDER BY padrao DESC, id DESC').all(user.id);
    json(res, 200, { perfil, enderecos });
  },

  'PUT /api/me/perfil': async (req, res) => {
    const user = getUserByToken(req);
    if (!user) return json(res, 401, { error: 'Não autenticado.' });
    const b = await readBody(req);
    db.prepare('UPDATE users SET nome_completo=?, cpf=?, telefone=? WHERE id=?')
      .run(String(b.nome_completo ?? ''), String(b.cpf ?? ''), String(b.telefone ?? ''), user.id);
    json(res, 200, { ok: true });
  },

  // Salva um novo endereço de entrega para o usuário logado
  'POST /api/me/enderecos': async (req, res) => {
    const user = getUserByToken(req);
    if (!user) return json(res, 401, { error: 'Não autenticado.' });
    const b = await readBody(req);
    const campos = ['nome_destinatario', 'cep', 'rua', 'numero', 'bairro', 'cidade', 'estado'];
    for (const c of campos) if (!b[c] || !String(b[c]).trim()) return json(res, 400, { error: `Campo obrigatório faltando: ${c}` });

    if (b.padrao) db.prepare('UPDATE enderecos SET padrao = 0 WHERE user_id = ?').run(user.id);
    const info = db.prepare(`
      INSERT INTO enderecos (user_id, nome_destinatario, cep, rua, numero, complemento, bairro, cidade, estado, padrao)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(user.id, b.nome_destinatario.trim(), b.cep.trim(), b.rua.trim(), String(b.numero).trim(),
           String(b.complemento ?? '').trim(), b.bairro.trim(), b.cidade.trim(), b.estado.trim(), b.padrao ? 1 : 0);
    json(res, 201, { id: Number(info.lastInsertRowid) });
  },

  // Cria um pedido a partir do carrinho + endereço + método de pagamento escolhido
  'POST /api/checkout': async (req, res) => {
    const user = getUserByToken(req);
    if (!user) return json(res, 401, { error: 'Não autenticado.' });
    const b = await readBody(req);

    const itensCarrinho = Array.isArray(b.itens) ? b.itens : [];
    if (itensCarrinho.length === 0) return json(res, 400, { error: 'Carrinho vazio.' });

    const end = b.endereco || {};
    const camposEndereco = ['nome_destinatario', 'cep', 'rua', 'numero', 'bairro', 'cidade', 'estado'];
    for (const c of camposEndereco) if (!end[c] || !String(end[c]).trim()) return json(res, 400, { error: `Endereço incompleto: ${c}` });
    if (!end.cpf || !String(end.cpf).trim()) return json(res, 400, { error: 'CPF é obrigatório para finalizar a compra.' });
    if (!end.telefone || !String(end.telefone).trim()) return json(res, 400, { error: 'Telefone é obrigatório para finalizar a compra.' });

    const metodo = ['manual', 'mercadopago', 'paypal'].includes(b.metodo_pagamento) ? b.metodo_pagamento : 'manual';

    // Monta itens validando produto/estoque/preço a partir do banco (nunca confia em preço vindo do cliente)
    const itensValidados = [];
    let subtotalCents = 0;
    for (const item of itensCarrinho) {
      const prod = db.prepare('SELECT * FROM produtos WHERE id = ? AND ativo = 1').get(Number(item.produto_id));
      if (!prod) return json(res, 400, { error: `Produto ${item.produto_id} não encontrado ou indisponível.` });
      const qtd = Math.max(1, Math.floor(Number(item.quantidade) || 1));
      if (!prod.ilimitado && prod.estoque < qtd) return json(res, 400, { error: `Estoque insuficiente para "${prod.nome}".` });
      subtotalCents += prod.preco_cents * qtd;
      itensValidados.push({ produto: prod, quantidade: qtd });
    }
    const freteCents = calcularFrete(subtotalCents);
    const totalCents = subtotalCents + freteCents;

    const infoPedido = db.prepare(`
      INSERT INTO pedidos (
        user_id, status, metodo_pagamento, subtotal_cents, frete_cents, total_cents,
        nome_destinatario, cpf, telefone, email, cep, rua, numero, complemento, bairro, cidade, estado
      ) VALUES (?, 'aguardando_pagamento', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      user.id, metodo, subtotalCents, freteCents, totalCents,
      String(end.nome_destinatario).trim(), String(end.cpf).trim(), String(end.telefone).trim(), user.email || '',
      String(end.cep).trim(), String(end.rua).trim(), String(end.numero).trim(), String(end.complemento ?? '').trim(),
      String(end.bairro).trim(), String(end.cidade).trim(), String(end.estado).trim()
    );
    const pedidoId = Number(infoPedido.lastInsertRowid);

    const insertItem = db.prepare(`
      INSERT INTO pedido_itens (pedido_id, produto_id, nome_snapshot, preco_cents_snapshot, quantidade)
      VALUES (?, ?, ?, ?, ?)
    `);
    for (const { produto, quantidade } of itensValidados) {
      insertItem.run(pedidoId, produto.id, produto.nome, produto.preco_cents, quantidade);
      if (!produto.ilimitado) db.prepare('UPDATE produtos SET estoque = estoque - ? WHERE id = ?').run(quantidade, produto.id);
    }

    // Também salva/atualiza os dados de perfil do usuário (CPF/telefone) para próximas compras
    db.prepare('UPDATE users SET cpf=?, telefone=? WHERE id=? AND (cpf = \'\' OR telefone = \'\')')
      .run(String(end.cpf).trim(), String(end.telefone).trim(), user.id);

    const pedido = { id: pedidoId };
    const itensParaGateway = itensValidados.map(i => ({ nome_snapshot: i.produto.nome, preco_cents_snapshot: i.produto.preco_cents, quantidade: i.quantidade }));

    let pagamento = null;
    if (metodo === 'mercadopago') pagamento = await criarPagamentoMercadoPago(pedido, itensParaGateway);
    else if (metodo === 'paypal') pagamento = await criarPagamentoPaypal(pedido, itensParaGateway, totalCents);

    if (pagamento) {
      db.prepare('UPDATE pedidos SET pagamento_ref=?, pagamento_url=? WHERE id=?').run(pagamento.ref, pagamento.url || '', pedidoId);
    }

    json(res, 201, {
      pedido_id: pedidoId,
      total_cents: totalCents,
      metodo_pagamento: metodo,
      pagamento_url: pagamento ? pagamento.url : null,
      aviso: pagamento ? null : 'Pedido registrado! O pagamento por gateway ainda não foi configurado — entraremos em contato para combinar o pagamento (PIX/transferência).',
    });
  },

  // Lista os e-books que o usuário logado já comprou (pra mostrar botão "Ler agora")
  'GET /api/me/livros': async (req, res) => {
    const user = getUserByToken(req);
    if (!user) return json(res, 401, { error: 'Não autenticado.' });
    const rows = db.prepare(`
      SELECT DISTINCT p.id AS produto_id, p.nome, l.total_paginas
      FROM produtos p
      JOIN livros_digitais l ON l.produto_id = p.id
      JOIN pedido_itens i ON i.produto_id = p.id
      JOIN pedidos ped ON ped.id = i.pedido_id
      WHERE ped.user_id = ? AND ped.status IN ('pago', 'enviado', 'entregue')
    `).all(user.id);
    json(res, 200, { livros: rows });
  },

  // Histórico de pedidos do usuário logado
  'GET /api/shop/pedidos': async (req, res) => {
    const user = getUserByToken(req);
    if (!user) return json(res, 401, { error: 'Não autenticado.' });
    const pedidos = db.prepare('SELECT * FROM pedidos WHERE user_id = ? ORDER BY id DESC').all(user.id);
    json(res, 200, { pedidos });
  },

  /* ═══ LOJINHA — PAINEL ADMIN (protegido por x-admin-key) ═══ */

  // Lista todos os produtos (inclusive inativos) para gerenciar no admin
  'GET /api/admin/products': async (req, res) => {
    if (!isAdmin(req)) return json(res, 403, { error: 'Não autorizado.' });
    const rows = db.prepare(`
      SELECT p.*, l.slug AS ebook_slug, l.total_paginas AS ebook_total_paginas
      FROM produtos p
      LEFT JOIN livros_digitais l ON l.produto_id = p.id
      ORDER BY p.ordem ASC, p.id ASC
    `).all();
    json(res, 200, { produtos: rows });
  },

  // Lista as pastas de e-book já processadas em biblioteca-privada/ (pra popular
  // o seletor "vincular e-book" no admin, sem precisar digitar slug/total manualmente)
  'GET /api/admin/livraria-pastas': async (req, res) => {
    if (!isAdmin(req)) return json(res, 403, { error: 'Não autorizado.' });
    if (!fs.existsSync(LIVRARIA_DIR)) return json(res, 200, { pastas: [] });
    const pastas = fs.readdirSync(LIVRARIA_DIR, { withFileTypes: true })
      .filter(d => d.isDirectory())
      .map(d => {
        const totalPaginas = fs.readdirSync(path.join(LIVRARIA_DIR, d.name)).filter(f => /^pagina-\d+\.png$/.test(f)).length;
        return { slug: d.name, total_paginas: totalPaginas };
      })
      .filter(p => p.total_paginas > 0);
    json(res, 200, { pastas });
  },

  'POST /api/admin/products': async (req, res) => {
    if (!isAdmin(req)) return json(res, 403, { error: 'Não autorizado.' });
    const b = await readBody(req);
    if (!b.nome || !String(b.nome).trim()) return json(res, 400, { error: 'Nome é obrigatório.' });
    const preco = Math.round(Number(b.preco_cents ?? (Number(b.preco) || 0) * 100));
    if (!isFinite(preco) || preco <= 0) return json(res, 400, { error: 'Preço inválido.' });
    const info = db.prepare(`
      INSERT INTO produtos (nome, descricao, preco_cents, imagem, categoria, estoque, ilimitado, destaque, ativo, ordem)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      String(b.nome).trim(), String(b.descricao ?? ''), preco, String(b.imagem ?? '🛍️'),
      String(b.categoria ?? ''), Math.floor(Number(b.estoque) || 0), b.ilimitado === false ? 0 : 1,
      b.destaque ? 1 : 0, b.ativo === false ? 0 : 1, Math.floor(Number(b.ordem) || 0)
    );
    json(res, 201, { id: Number(info.lastInsertRowid) });
  },

  // Vincula um produto a um e-book já processado (pasta de páginas em biblioteca-privada/<slug>)
  'POST /api/admin/livros-digitais': async (req, res) => {
    if (!isAdmin(req)) return json(res, 403, { error: 'Não autorizado.' });
    const b = await readBody(req);
    const produtoId = Number(b.produto_id);
    const slug = String(b.slug ?? '').trim();
    const totalPaginas = Math.floor(Number(b.total_paginas));
    if (!produtoId || !slug || !totalPaginas) return json(res, 400, { error: 'produto_id, slug e total_paginas são obrigatórios.' });
    const produto = db.prepare('SELECT id FROM produtos WHERE id = ?').get(produtoId);
    if (!produto) return json(res, 404, { error: 'Produto não encontrado.' });
    // Libera esse slug de qualquer outro produto (pode ter ficado "órfão" se o
    // produto anterior foi excluído), antes de vinculá-lo ao produto atual.
    db.prepare('DELETE FROM livros_digitais WHERE slug = ? AND produto_id != ?').run(slug, produtoId);
    db.prepare(`
      INSERT INTO livros_digitais (produto_id, slug, total_paginas) VALUES (?, ?, ?)
      ON CONFLICT(produto_id) DO UPDATE SET slug = excluded.slug, total_paginas = excluded.total_paginas
    `).run(produtoId, slug, totalPaginas);
    json(res, 200, { ok: true });
  },

  // Upload de PDF: converte em páginas-imagem e já vincula ao produto como e-book.
  // O PDF nunca é salvo em disco de forma permanente — só um arquivo temporário
  // durante a conversão, apagado logo em seguida.
  'POST /api/admin/livros-digitais/upload': async (req, res) => {
    if (!isAdmin(req)) return json(res, 403, { error: 'Não autorizado.' });

    const busboy = require('busboy');
    let bb;
    try {
      bb = busboy({ headers: req.headers, limits: { fileSize: 100 * 1024 * 1024 } }); // até 100MB
    } catch (e) {
      return json(res, 400, { error: 'Requisição de upload inválida.' });
    }

    let produtoId = null;
    let tmpPath = null;
    let fileTooBig = false;
    let recebeuArquivo = false;

    const aguardaUpload = new Promise((resolve, reject) => {
      bb.on('field', (name, val) => { if (name === 'produto_id') produtoId = Number(val); });
      bb.on('file', (name, stream, info) => {
        if (name !== 'pdf') { stream.resume(); return; }
        recebeuArquivo = true;
        tmpPath = path.join(os.tmpdir(), `upload-${Date.now()}-${crypto.randomBytes(6).toString('hex')}.pdf`);
        const out = fs.createWriteStream(tmpPath);
        stream.on('limit', () => { fileTooBig = true; });
        stream.pipe(out);
        out.on('error', reject);
      });
      bb.on('close', () => resolve());
      bb.on('error', reject);
    });

    try {
      req.pipe(bb);
      await aguardaUpload;
    } catch (e) {
      if (tmpPath) fs.unlink(tmpPath, () => {});
      return json(res, 400, { error: 'Erro ao receber o arquivo enviado.' });
    }

    if (fileTooBig) { if (tmpPath) fs.unlink(tmpPath, () => {}); return json(res, 400, { error: 'PDF muito grande (máximo 100MB).' }); }
    if (!produtoId) { if (tmpPath) fs.unlink(tmpPath, () => {}); return json(res, 400, { error: 'produto_id é obrigatório.' }); }
    if (!recebeuArquivo || !tmpPath || !fs.existsSync(tmpPath)) return json(res, 400, { error: 'Nenhum PDF foi enviado (campo "pdf").' });

    const produto = db.prepare('SELECT * FROM produtos WHERE id = ?').get(produtoId);
    if (!produto) { fs.unlink(tmpPath, () => {}); return json(res, 404, { error: 'Produto não encontrado.' }); }

    const slug = `${slugify(produto.nome)}-${produto.id}`;
    const pastaDestino = path.join(LIVRARIA_DIR, slug);
    fs.mkdirSync(pastaDestino, { recursive: true });

    let totalPaginas;
    try {
      totalPaginas = await converterPdfEmPaginas(tmpPath, pastaDestino);
    } catch (e) {
      console.error('Erro ao converter PDF:', e);
      fs.unlink(tmpPath, () => {});
      return json(res, 500, { error: 'Não foi possível converter o PDF. Verifique se o arquivo não está corrompido.' });
    }
    fs.unlink(tmpPath, () => {}); // o PDF original nunca fica salvo

    if (!totalPaginas) return json(res, 500, { error: 'O PDF não gerou nenhuma página.' });

    db.prepare('DELETE FROM livros_digitais WHERE slug = ? AND produto_id != ?').run(slug, produtoId);
    db.prepare(`
      INSERT INTO livros_digitais (produto_id, slug, total_paginas) VALUES (?, ?, ?)
      ON CONFLICT(produto_id) DO UPDATE SET slug = excluded.slug, total_paginas = excluded.total_paginas
    `).run(produtoId, slug, totalPaginas);

    json(res, 200, { ok: true, slug, total_paginas: totalPaginas });
  },

  // Lista/atualiza status dos pedidos
  'GET /api/admin/pedidos': async (req, res, url) => {
    if (!isAdmin(req)) return json(res, 403, { error: 'Não autorizado.' });
    const status = url.searchParams.get('status');
    const rows = status
      ? db.prepare('SELECT p.*, u.username FROM pedidos p JOIN users u ON u.id = p.user_id WHERE p.status = ? ORDER BY p.id DESC').all(status)
      : db.prepare('SELECT p.*, u.username FROM pedidos p JOIN users u ON u.id = p.user_id ORDER BY p.id DESC').all();
    json(res, 200, { pedidos: rows });
  },

  /* ═══ WEBHOOKS DE PAGAMENTO (stub) ═══
     TODO: quando as chaves reais forem configuradas, validar a assinatura/
     notificação do provedor antes de marcar o pedido como pago. Por ora,
     estas rotas existem para já ter a URL pronta a cadastrar no painel do
     Mercado Pago / PayPal quando chegar a hora. */
  'POST /api/payments/mercadopago/webhook': async (req, res) => {
    await readBody(req).catch(() => ({}));
    // TODO: consultar a API do Mercado Pago com o id recebido e, se aprovado,
    // rodar: UPDATE pedidos SET status='pago' WHERE pagamento_ref = ?
    json(res, 200, { ok: true });
  },

  'POST /api/payments/paypal/webhook': async (req, res) => {
    await readBody(req).catch(() => ({}));
    // TODO: verificar o evento do PayPal e, se CHECKOUT.ORDER.APPROVED/CAPTURE.COMPLETED,
    // rodar: UPDATE pedidos SET status='pago' WHERE pagamento_ref = ?
    json(res, 200, { ok: true });
  },
};

/* ── ROTAS COM PARÂMETRO NA URL (ex: /api/shop/products/12) ──
   O roteador principal é por correspondência exata "MÉTODO caminho"; estas
   rotas têm um segmento variável (id), então usam regex à parte. */
const paramRoutes = [
  {
    method: 'GET', re: /^\/api\/shop\/products\/(\d+)$/,
    handler: async (req, res, url, m) => {
      const prod = db.prepare('SELECT * FROM produtos WHERE id = ? AND ativo = 1').get(Number(m[1]));
      if (!prod) return json(res, 404, { error: 'Produto não encontrado.' });
      json(res, 200, produtoPublico(prod));
    },
  },
  {
    method: 'GET', re: /^\/api\/shop\/pedidos\/(\d+)$/,
    handler: async (req, res, url, m) => {
      const user = getUserByToken(req);
      if (!user) return json(res, 401, { error: 'Não autenticado.' });
      const pedido = db.prepare('SELECT * FROM pedidos WHERE id = ? AND user_id = ?').get(Number(m[1]), user.id);
      if (!pedido) return json(res, 404, { error: 'Pedido não encontrado.' });
      const itens = db.prepare('SELECT * FROM pedido_itens WHERE pedido_id = ?').all(pedido.id);
      json(res, 200, { pedido, itens });
    },
  },
  {
    method: 'PUT', re: /^\/api\/admin\/products\/(\d+)$/,
    handler: async (req, res, url, m) => {
      if (!isAdmin(req)) return json(res, 403, { error: 'Não autorizado.' });
      const id = Number(m[1]);
      const atual = db.prepare('SELECT * FROM produtos WHERE id = ?').get(id);
      if (!atual) return json(res, 404, { error: 'Produto não encontrado.' });
      const b = await readBody(req);
      const preco = b.preco_cents !== undefined ? Math.round(Number(b.preco_cents)) : atual.preco_cents;
      db.prepare(`
        UPDATE produtos SET nome=?, descricao=?, preco_cents=?, imagem=?, categoria=?,
          estoque=?, ilimitado=?, destaque=?, ativo=?, ordem=?, updated_at=datetime('now')
        WHERE id=?
      `).run(
        String(b.nome ?? atual.nome), String(b.descricao ?? atual.descricao), preco,
        String(b.imagem ?? atual.imagem), String(b.categoria ?? atual.categoria),
        b.estoque !== undefined ? Math.floor(Number(b.estoque)) : atual.estoque,
        b.ilimitado !== undefined ? (b.ilimitado ? 1 : 0) : atual.ilimitado,
        b.destaque !== undefined ? (b.destaque ? 1 : 0) : atual.destaque,
        b.ativo !== undefined ? (b.ativo ? 1 : 0) : atual.ativo,
        b.ordem !== undefined ? Math.floor(Number(b.ordem)) : atual.ordem,
        id
      );
      json(res, 200, { ok: true });
    },
  },
  {
    method: 'DELETE', re: /^\/api\/admin\/products\/(\d+)$/,
    handler: async (req, res, url, m) => {
      if (!isAdmin(req)) return json(res, 403, { error: 'Não autorizado.' });
      const id = Number(m[1]);
      // Produto com pedidos associados não pode ser excluído (quebraria o
      // histórico de compras) — nesse caso, oriente a desativar em vez de excluir.
      const emUso = db.prepare('SELECT 1 FROM pedido_itens WHERE produto_id = ? LIMIT 1').get(id);
      if (emUso) {
        return json(res, 409, { error: 'Este produto já tem pedidos associados e não pode ser excluído. Desmarque "Ativo" para escondê-lo da loja em vez de excluir.' });
      }
      db.prepare('DELETE FROM livros_digitais WHERE produto_id = ?').run(id); // remove vínculo de e-book, se houver
      db.prepare('DELETE FROM produtos WHERE id = ?').run(id);
      json(res, 200, { ok: true });
    },
  },
  // Info do e-book (título + total de páginas) — só pra quem comprou
  {
    method: 'GET', re: /^\/api\/livraria\/(\d+)\/info$/,
    handler: async (req, res, url, m) => {
      const user = getUserByToken(req);
      if (!user) return json(res, 401, { error: 'Não autenticado.' });
      const produtoId = Number(m[1]);
      if (!usuarioComprouProduto(user.id, produtoId)) return json(res, 403, { error: 'Você ainda não comprou este e-book.' });
      const livro = db.prepare('SELECT * FROM livros_digitais WHERE produto_id = ?').get(produtoId);
      if (!livro) return json(res, 404, { error: 'E-book não encontrado.' });
      const produto = db.prepare('SELECT nome FROM produtos WHERE id = ?').get(produtoId);
      json(res, 200, { titulo: produto ? produto.nome : '', total_paginas: livro.total_paginas });
    },
  },
  // Página individual do e-book, renderizada com marca d'água do leitor logado
  {
    method: 'GET', re: /^\/api\/livraria\/(\d+)\/pagina\/(\d+)$/,
    handler: async (req, res, url, m) => {
      const user = getUserByToken(req);
      if (!user) return json(res, 401, { error: 'Não autenticado.' });
      const produtoId = Number(m[1]);
      const pagina = Number(m[2]);
      if (!usuarioComprouProduto(user.id, produtoId)) return json(res, 403, { error: 'Acesso negado.' });
      if (!checarRateLimiteLeitura(user.id)) return json(res, 429, { error: 'Muitas requisições — aguarde um instante.' });

      const livro = db.prepare('SELECT * FROM livros_digitais WHERE produto_id = ?').get(produtoId);
      if (!livro || pagina < 1 || pagina > livro.total_paginas) return json(res, 404, { error: 'Página não encontrada.' });

      const arquivo = path.join(LIVRARIA_DIR, livro.slug, `pagina-${String(pagina).padStart(4, '0')}.png`);
      if (!fs.existsSync(arquivo)) return json(res, 404, { error: 'Página não encontrada.' });

      try {
        const linha = `${user.username} · ${user.email || ''} · ${new Date().toLocaleString('pt-BR')}`;
        const buffer = await gerarPaginaComMarcaDagua(arquivo, linha, user.email || user.username);
        res.writeHead(200, {
          'Content-Type': 'image/png',
          'Cache-Control': 'no-store, no-cache, must-revalidate, private',
          'Pragma': 'no-cache',
        });
        res.end(buffer);
      } catch (e) {
        console.error('Erro ao gerar página do e-book:', e);
        json(res, 500, { error: 'Erro ao carregar a página.' });
      }
    },
  },
  {
    method: 'PUT', re: /^\/api\/admin\/pedidos\/(\d+)$/,
    handler: async (req, res, url, m) => {
      if (!isAdmin(req)) return json(res, 403, { error: 'Não autorizado.' });
      const id = Number(m[1]);
      const b = await readBody(req);
      const statusValidos = ['aguardando_pagamento', 'pago', 'enviado', 'entregue', 'cancelado'];
      if (!statusValidos.includes(b.status)) return json(res, 400, { error: 'Status inválido.' });
      const info = db.prepare(`UPDATE pedidos SET status=?, updated_at=datetime('now') WHERE id=?`).run(b.status, id);
      if (info.changes === 0) return json(res, 404, { error: 'Pedido não encontrado.' });
      json(res, 200, { ok: true });
    },
  },
];

/* ── ARQUIVOS ESTÁTICOS ── */
const MIME = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript',
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.json': 'application/json',
};

function serveStatic(req, res, url) {
  let file = decodeURIComponent(url.pathname);
  if (file === '/' || file === '') file = '/index.html';
  const full = path.normalize(path.join(ROOT, file));
  if (!full.startsWith(ROOT) || full.startsWith(path.join(ROOT, 'server'))) {
    res.writeHead(403); return res.end('Acesso negado');
  }
  fs.readFile(full, (err, data) => {
    if (err) { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); return res.end('404 — não encontrado'); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(full).toLowerCase()] || 'application/octet-stream' });
    res.end(data);
  });
}

/* ── SERVIDOR ── */
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const key = `${req.method} ${url.pathname}`;

  // CORS — permite que a cópia estática (ex: GitHub Pages) chame esta API.
  // Não usamos cookies/credenciais (token via header Authorization), então
  // liberar qualquer origem é seguro aqui.
  if (url.pathname.startsWith('/api/')) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-admin-key');
    if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }
  }

  if (url.pathname.startsWith('/api/')) {
    const handler = routes[key];
    if (handler) {
      try { await handler(req, res, url); }
      catch (e) { console.error(e); json(res, 500, { error: 'Erro interno do servidor.' }); }
      return;
    }
    const pr = paramRoutes.find(r => r.method === req.method && r.re.test(url.pathname));
    if (pr) {
      const m = url.pathname.match(pr.re);
      try { await pr.handler(req, res, url, m); }
      catch (e) { console.error(e); json(res, 500, { error: 'Erro interno do servidor.' }); }
      return;
    }
    return json(res, 404, { error: 'Rota não encontrada.' });
  }
  serveStatic(req, res, url);
});

server.listen(PORT, () => {
  console.log('═══════════════════════════════════════');
  console.log('  🍯 NectarMine rodando!');
  console.log(`  Site:  http://localhost:${PORT}`);
  console.log(`  Banco: ${DB_PATH}`);
  console.log('═══════════════════════════════════════');
});
