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
// Pasta persistente entre deploys — usada pra arquivos criados via upload no admin
// (fotos de produto e novos e-books). Em produção, configurar DATA_DIR=/data no
// Railway (mesmo volume já usado pelo banco) pra esses arquivos não se perderem
// a cada novo deploy. Sem essa variável, cai de volta na pasta do próprio código
// (funciona, mas some no próximo deploy — ok pra testar localmente).
const DATA_DIR = process.env.DATA_DIR || __dirname;
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

  /* ═══ ECONOMIA DO JOGO — Apiários, Metas, Indicações, Mercado ═══
     Mesma lógica do Martian Gold Rush (projeto irmão): apiários produzem mel
     (reservatório limitado por capacidade), o jogador "envasa" o mel em potes
     (evento de produção, alimenta ranking), e potes podem ser vendidos no
     mercado por NCT. Tudo calculado e validado no servidor — o cliente nunca
     manda um valor final, só a intenção da ação. */

  CREATE TABLE IF NOT EXISTS apiarios (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id    INTEGER NOT NULL REFERENCES users(id),
    tipo       TEXT    NOT NULL,               -- 'iniciante' | 'regular' | 'adeptos'
    created_at TEXT    NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_apiarios_user ON apiarios (user_id);

  CREATE TABLE IF NOT EXISTS metas_diarias (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id    INTEGER NOT NULL REFERENCES users(id),
    data_meta  TEXT    NOT NULL,               -- 'YYYY-MM-DD' (UTC)
    chave      TEXT    NOT NULL,
    progresso  REAL    NOT NULL DEFAULT 0,
    resgatada  INTEGER NOT NULL DEFAULT 0,
    UNIQUE (user_id, data_meta, chave)
  );

  CREATE TABLE IF NOT EXISTS indicacoes (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    indicador_id    INTEGER NOT NULL REFERENCES users(id),
    indicado_id     INTEGER NOT NULL UNIQUE REFERENCES users(id),
    validado        INTEGER NOT NULL DEFAULT 0,
    bonus_creditado INTEGER NOT NULL DEFAULT 0,
    created_at      TEXT    NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_indicacoes_indicador ON indicacoes (indicador_id);

  CREATE TABLE IF NOT EXISTS mercado_transacoes (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id    INTEGER NOT NULL REFERENCES users(id),
    tipo       TEXT    NOT NULL,               -- 'compra' | 'venda'
    quantidade INTEGER NOT NULL,
    preco_unit REAL    NOT NULL,
    total_nct  REAL    NOT NULL,
    created_at TEXT    NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_mercado_user ON mercado_transacoes (user_id, created_at);

  CREATE TABLE IF NOT EXISTS mercado_estado (
    id         INTEGER PRIMARY KEY CHECK (id = 1),
    preco_pote REAL NOT NULL DEFAULT 24.57,
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  INSERT OR IGNORE INTO mercado_estado (id) VALUES (1);

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
  addCol('indicado_por', 'INTEGER'); // id de quem indicou este usuário (referral)
}

/* ── MIGRAÇÃO LEVE: novas colunas em game_state para a economia real ── */
{
  const cols = db.prepare(`PRAGMA table_info(game_state)`).all().map(c => c.name);
  const addCol = (name, def) => { if (!cols.includes(name)) db.exec(`ALTER TABLE game_state ADD COLUMN ${name} ${def}`); };
  addCol('mel_cap_compras', 'INTEGER NOT NULL DEFAULT 0');       // compras de capacidade do reservatório (máx 5)
  addCol('relogio_compras', 'INTEGER NOT NULL DEFAULT 0');       // compras de "Flores" / relógio de energia (máx 5)
  addCol('last_producao_em', 'TEXT');                            // último tick de produção aplicado
  addCol('bonus_potes_pendente', 'INTEGER NOT NULL DEFAULT 0');  // comissões de referral aguardando resgate
  addCol('bonus_potes_total', 'INTEGER NOT NULL DEFAULT 0');     // total já resgatado (histórico, só cresce)
  // Backfill: linhas existentes (criadas antes desta coluna existir) começam
  // a contar produção a partir de agora, não desde sempre.
  db.exec(`UPDATE game_state SET last_producao_em = datetime('now') WHERE last_producao_em IS NULL`);
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
const LIVRARIA_DIR = path.join(DATA_DIR, 'biblioteca-privada');

// Fotos de produto enviadas pelo admin (capa do livro físico, etc.) — ficam
// aqui e são servidas publicamente por GET /api/imagens/produtos/:arquivo,
// já que a loja (GitHub Pages) precisa conseguir exibi-las por fora.
const IMAGENS_DIR = path.join(DATA_DIR, 'imagens-produtos');
fs.mkdirSync(IMAGENS_DIR, { recursive: true });

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

// Move um arquivo temporário para o destino final. Usa rename (rápido) quando
// possível, mas cai pra copiar+apagar se origem e destino estiverem em
// dispositivos/volumes diferentes (ex: /tmp do sistema vs. volume /data do
// Railway) — nesse caso um simples renameSync falha com erro EXDEV.
function moverArquivoSeguro(origem, destino) {
  try {
    fs.renameSync(origem, destino);
  } catch (e) {
    if (e.code !== 'EXDEV') throw e;
    fs.copyFileSync(origem, destino);
    fs.unlinkSync(origem);
  }
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

/* ═══════════════════════════════════════════════════════════
   ECONOMIA DO JOGO — apiários, produção, metas, indicações, mercado
   Mesmo raciocínio do Martian Gold Rush (projeto irmão): tudo
   server-authoritative. O cliente só manda a intenção da ação
   (comprar, envasar, vender...); preço, produção e saldo são
   sempre calculados e validados aqui dentro.

   Nota de concorrência: node:sqlite (DatabaseSync) é 100% síncrono.
   Cada rota só tem UM ponto de await (readBody, no início, antes de
   qualquer leitura do banco). Depois disso tudo roda síncrono até o
   fim da resposta — então não existe brecha para duas requisições
   paralelas intercalarem leitura/escrita do mesmo saldo (dispensa o
   FOR UPDATE / transação explícita que o Gold Rush precisa no Postgres).
   ═══════════════════════════════════════════════════════════ */

const APIARIOS = {
  iniciante: { producao: 5,  energia: 2, preco: 500,  nome: 'Apiário Iniciante', imagem: 'favo1.png' },
  regular:   { producao: 10, energia: 4, preco: 1200, nome: 'Apiário Regular',   imagem: 'favo2.png' },
  adeptos:   { producao: 20, energia: 8, preco: 2500, nome: 'Apiário Adeptos',   imagem: 'favo3.png' },
};
const APIARIO_STEP_PRECO = 1000;    // cada apiário do mesmo tipo já possuído soma +1000 NCT no preço do próximo
const APIARIO_MAX_POR_TIPO = 10;    // trava anti-acúmulo infinito (mesmo padrão do Gold Rush)

const CAP_BASE = 100;                // capacidade inicial do reservatório de mel
const CAP_INCREMENTO = 100;          // +100 de capacidade por compra
const CAP_PRECO_BASE = 800;
const CAP_PRECO_STEP = 400;
const CAP_MAX_COMPRAS = 5;

const RELOGIO_FLORES_POR_COMPRA = 50; // flores (energia) creditadas instantaneamente por compra
const RELOGIO_PRECO_BASE = 600;
const RELOGIO_PRECO_STEP = 300;
const RELOGIO_MAX_COMPRAS = 5;

const BONUS_REFERRAL_UNICO = 50;     // potes, uma única vez, quando o indicado produz pela 1ª vez (validação)
const COMISSAO_REFERRAL_PCT = 0.10;  // 10% contínuo sobre cada envase do indicado

const METAS = [
  { chave: 'login_diario',        titulo: 'Login Diário',       descricao: 'Entre no jogo uma vez por dia.',                target: 1,    reward_nct: 300,  reward_flores: 10 },
  { chave: 'extrair_potes',       titulo: 'Extrair Potes',      descricao: 'Transfira o mel do reservatório para seus potes.', target: 100,  reward_nct: 500,  reward_flores: 0  },
  { chave: 'recarregar_energia',  titulo: 'Recarregar Energia', descricao: 'Recarregue a energia das suas máquinas extratoras.', target: 1,  reward_nct: 150,  reward_flores: 25 },
  { chave: 'comprar_mercado',     titulo: 'Comprar no Mercado', descricao: 'Compre potes no mercado global.',                target: 5,    reward_nct: 750,  reward_flores: 0  },
  { chave: 'vender_mercado',      titulo: 'Vender no Mercado',  descricao: 'Venda potes no mercado global.',                 target: 5,    reward_nct: 750,  reward_flores: 0  },
  { chave: 'producao_industrial', titulo: 'Produção Industrial',descricao: 'Produza mel usando suas máquinas.',              target: 1000, reward_nct: 2000, reward_flores: 0  },
];

function hojeStr() { return new Date().toISOString().slice(0, 10); } // 'YYYY-MM-DD' em UTC

function precoMelAtual() {
  const row = db.prepare('SELECT preco_pote FROM mercado_estado WHERE id = 1').get();
  return row ? row.preco_pote : 24.57;
}

function capacidadeReservatorio(state) {
  return CAP_BASE + (state.mel_cap_compras || 0) * CAP_INCREMENTO;
}
function precoProximaCapacidade(state) {
  const c = state.mel_cap_compras || 0;
  return c >= CAP_MAX_COMPRAS ? null : CAP_PRECO_BASE + c * CAP_PRECO_STEP;
}
function precoProximoRelogio(state) {
  const c = state.relogio_compras || 0;
  return c >= RELOGIO_MAX_COMPRAS ? null : RELOGIO_PRECO_BASE + c * RELOGIO_PRECO_STEP;
}
function precoProximoApiario(tipo, jaComprados) {
  return APIARIOS[tipo].preco + jaComprados * APIARIO_STEP_PRECO;
}

function getApiarios(userId) {
  return db.prepare('SELECT * FROM apiarios WHERE user_id = ? ORDER BY id ASC').all(userId);
}

function producaoTotais(apiariosDoUsuario) {
  let producaoHora = 0, energiaHora = 0;
  for (const a of apiariosDoUsuario) {
    const spec = APIARIOS[a.tipo];
    if (!spec) continue;
    producaoHora += spec.producao;
    energiaHora += spec.energia;
  }
  return { producaoHora, energiaHora };
}

// Converte o texto 'YYYY-MM-DD HH:MM:SS' que o SQLite grava (sempre UTC, via
// datetime('now')) num timestamp confiável. Sem o replace+'Z', o Node
// interpretaria a string como horário LOCAL do servidor, o que quebraria o
// cálculo de produção dependendo do fuso configurado no Railway.
function parseSqliteUTC(texto) {
  return new Date(texto.replace(' ', 'T') + 'Z').getTime();
}

// Aplica, de forma síncrona e idempotente, toda a produção acumulada desde o
// último tick. O mel cresce conforme a produção combinada dos apiários,
// consumindo flores (energia) proporcionalmente — se as flores acabarem no
// meio do intervalo, a produção para nesse ponto exato (sem gerar mel de
// graça). O mel nunca ultrapassa a capacidade do reservatório (excedente é
// simplesmente não produzido, igual ao Gold Rush pausar quando o estoque
// enche). Deve ser chamada no início de toda rota que lê ou altera nct/mel/
// flores, para o estado nunca ficar desatualizado.
function aplicarProducao(userId) {
  const state = db.prepare('SELECT * FROM game_state WHERE user_id = ?').get(userId);
  const { producaoHora, energiaHora } = producaoTotais(getApiarios(userId));

  const agora = Date.now();
  const ultima = state.last_producao_em ? parseSqliteUTC(state.last_producao_em) : agora;
  // Trava de segurança: nunca processa mais que 72h de uma vez (evita
  // acúmulo absurdo se o servidor ficar off-line por dias — mesma lógica
  // do catch-up do motor de mineração do USMARS).
  const horasPassadas = Math.min(Math.max(0, (agora - ultima) / 3_600_000), 72);

  let novoMel = state.mel;
  let novasFlores = state.flores;

  if (horasPassadas > 0 && producaoHora > 0) {
    const cap = capacidadeReservatorio(state);
    let horasEfetivas = horasPassadas;
    if (energiaHora > 0) {
      const energiaNecessaria = energiaHora * horasPassadas;
      if (energiaNecessaria > novasFlores) horasEfetivas = novasFlores / energiaHora;
    }
    novoMel = Math.min(cap, novoMel + producaoHora * horasEfetivas);
    novasFlores = Math.max(0, novasFlores - energiaHora * horasEfetivas);
  }

  db.prepare(`UPDATE game_state SET mel = ?, flores = ?, last_producao_em = datetime('now') WHERE user_id = ?`)
    .run(novoMel, novasFlores, userId);

  return db.prepare('SELECT * FROM game_state WHERE user_id = ?').get(userId);
}

// Meta cumulativa (soma progresso a cada chamada) — usada por ações que podem
// acontecer várias vezes ao dia (envasar, comprar/vender no mercado...).
function incrementarMeta(userId, chave, quantidade) {
  db.prepare(`
    INSERT INTO metas_diarias (user_id, data_meta, chave, progresso) VALUES (?, ?, ?, ?)
    ON CONFLICT(user_id, data_meta, chave) DO UPDATE SET progresso = progresso + excluded.progresso
  `).run(userId, hojeStr(), chave, quantidade);
}

// Meta "uma vez por dia" (login) — grava progresso=1 na primeira chamada do
// dia e ignora todas as seguintes (ON CONFLICT DO NOTHING), pra não inflar
// com cada poll de status.
function marcarLoginDiario(userId) {
  db.prepare(`
    INSERT INTO metas_diarias (user_id, data_meta, chave, progresso) VALUES (?, ?, 'login_diario', 1)
    ON CONFLICT(user_id, data_meta, chave) DO NOTHING
  `).run(userId, hojeStr());
}

// Credita comissão de referral (10% contínuo) + bônus único de validação (50
// potes, na primeira produção do indicado) ao indicador — chamado sempre que
// o indicado envasa mel. O bônus fica pendente em bonus_potes_pendente até o
// indicador resgatar manualmente em /api/amigos/resgatar.
function creditarReferralPorProducao(userId, quantidadeProduzida) {
  const u = db.prepare('SELECT indicado_por FROM users WHERE id = ?').get(userId);
  if (!u || !u.indicado_por) return;
  const indicacao = db.prepare('SELECT * FROM indicacoes WHERE indicado_id = ?').get(userId);
  if (!indicacao) return;

  let bonusUnico = 0;
  if (!indicacao.validado) {
    bonusUnico = BONUS_REFERRAL_UNICO;
    db.prepare('UPDATE indicacoes SET validado = 1, bonus_creditado = 1 WHERE id = ?').run(indicacao.id);
  }
  const comissao = Math.floor(quantidadeProduzida * COMISSAO_REFERRAL_PCT);
  const total = comissao + bonusUnico;
  if (total > 0) {
    db.prepare('UPDATE game_state SET bonus_potes_pendente = bonus_potes_pendente + ? WHERE user_id = ?')
      .run(total, indicacao.indicador_id);
  }
}

/* ── ROTAS DA API ── */
const routes = {

  'POST /api/register': async (req, res) => {
    const { username, email, password, ref } = await readBody(req);
    if (!username || username.trim().length < 3) return json(res, 400, { error: 'Nome de usuário precisa de pelo menos 3 caracteres.' });
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json(res, 400, { error: 'E-mail inválido.' });
    if (!password || password.length < 6) return json(res, 400, { error: 'Senha precisa de pelo menos 6 caracteres.' });

    const exists = db.prepare('SELECT id FROM users WHERE username = ? OR email = ?').get(username.trim(), email.trim());
    if (exists) return json(res, 409, { error: 'Usuário ou e-mail já cadastrado.' });

    // Referral: 'ref' é o username de quem indicou (vem de ?ref= no link de convite).
    // Auto-indicação e códigos inválidos são simplesmente ignorados (cadastro segue normal).
    let indicadorId = null;
    if (ref && typeof ref === 'string' && ref.trim()) {
      const indicador = db.prepare('SELECT id FROM users WHERE username = ?').get(ref.trim());
      if (indicador && indicador.id) indicadorId = indicador.id;
    }

    const salt = crypto.randomBytes(16).toString('hex');
    const hash = hashPassword(password, salt);
    const info = db.prepare('INSERT INTO users (username, email, pass_hash, salt, indicado_por) VALUES (?, ?, ?, ?, ?)')
                   .run(username.trim(), email.trim().toLowerCase(), hash, salt, indicadorId);
    const userId = Number(info.lastInsertRowid);
    db.prepare(`INSERT INTO game_state (user_id, last_producao_em) VALUES (?, datetime('now'))`).run(userId);
    if (indicadorId) {
      db.prepare('INSERT INTO indicacoes (indicador_id, indicado_id) VALUES (?, ?)').run(indicadorId, userId);
    }

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
    const state = aplicarProducao(user.id);
    json(res, 200, { user, state: { ...state, data: JSON.parse(state.data || '{}') } });
  },

  // Só persiste o blob livre de preferências de UI (`data`) e o nível.
  // nct/mel/flores/potes NÃO são mais aceitos aqui — desde que a economia
  // ficou server-authoritative (apiários, envasar, mercado, metas...), essas
  // colunas só podem mudar através das rotas dedicadas, nunca por um valor
  // que o cliente decidiu mandar direto.
  'PUT /api/state': async (req, res) => {
    const user = getUserByToken(req);
    if (!user) return json(res, 401, { error: 'Não autenticado.' });
    const b = await readBody(req);
    const cur = db.prepare('SELECT * FROM game_state WHERE user_id = ?').get(user.id);

    db.prepare(`UPDATE game_state SET data = ?, updated_at = datetime('now') WHERE user_id = ?`)
      .run(JSON.stringify(b.data ?? JSON.parse(cur.data || '{}')), user.id);
    if (typeof b.level === 'number' && b.level >= 1) {
      db.prepare('UPDATE users SET level=? WHERE id=?').run(Math.floor(b.level), user.id);
    }
    json(res, 200, { ok: true });
  },

  // Registra entrega (encomendas físicas da lojinha — não tem relação com a
  // economia do jogo). 'producao' foi removido daqui: produção real agora só
  // acontece via POST /api/jogo/envasar, que já cuida de ranking + metas +
  // comissão de referral em conjunto — um relato solto aqui não teria como
  // manter essas três coisas consistentes.
  'POST /api/event': async (req, res) => {
    const user = getUserByToken(req);
    if (!user) return json(res, 401, { error: 'Não autenticado.' });
    const { tipo, amount } = await readBody(req);
    const qtd = Math.floor(Number(amount));
    if (tipo !== 'entrega' || !isFinite(qtd) || qtd <= 0 || qtd > 1e6) {
      return json(res, 400, { error: 'Evento inválido.' });
    }
    db.prepare('INSERT INTO event_log (user_id, tipo, amount) VALUES (?, ?, ?)').run(user.id, tipo, qtd);
    db.prepare(`UPDATE game_state SET total_entregas = total_entregas + ? WHERE user_id = ?`).run(qtd, user.id);
    json(res, 200, { ok: true });
  },

  /* ═══ JOGO — status combinado, produção, envasar ═══ */

  'GET /api/jogo/status': async (req, res) => {
    const user = getUserByToken(req);
    if (!user) return json(res, 401, { error: 'Não autenticado.' });
    marcarLoginDiario(user.id);
    const state = aplicarProducao(user.id);
    const apiariosDoUsuario = getApiarios(user.id);
    const { producaoHora, energiaHora } = producaoTotais(apiariosDoUsuario);
    const cap = capacidadeReservatorio(state);

    const contagem = { iniciante: 0, regular: 0, adeptos: 0 };
    for (const a of apiariosDoUsuario) if (contagem[a.tipo] !== undefined) contagem[a.tipo]++;

    const hoje = hojeStr();
    const loginRow = db.prepare(`SELECT progresso FROM metas_diarias WHERE user_id=? AND data_meta=? AND chave='login_diario'`).get(user.id, hoje);

    json(res, 200, {
      nct: state.nct, mel: state.mel, flores: state.flores, potes: state.potes,
      total_potes: state.total_potes, total_entregas: state.total_entregas,
      reservatorio: { atual: state.mel, capacidade: cap, cheio: state.mel >= cap },
      producao_hora: producaoHora, energia_hora: energiaHora,
      apiarios: apiariosDoUsuario.map(a => ({ id: a.id, tipo: a.tipo, ...APIARIOS[a.tipo], criado_em: a.created_at })),
      loja: {
        apiarios: Object.fromEntries(Object.keys(APIARIOS).map(tipo => [tipo, {
          ...APIARIOS[tipo], tipo, possui: contagem[tipo],
          preco_atual: precoProximoApiario(tipo, contagem[tipo]),
          max: APIARIO_MAX_POR_TIPO, bloqueado: contagem[tipo] >= APIARIO_MAX_POR_TIPO,
        }])),
        capacidade: { atual: cap, compras: state.mel_cap_compras, proximo_preco: precoProximaCapacidade(state), incremento: CAP_INCREMENTO, max_compras: CAP_MAX_COMPRAS },
        relogio: { compras: state.relogio_compras, proximo_preco: precoProximoRelogio(state), flores_por_compra: RELOGIO_FLORES_POR_COMPRA, max_compras: RELOGIO_MAX_COMPRAS },
      },
      mercado: { preco_pote: precoMelAtual() },
      bonus_referral_pendente: state.bonus_potes_pendente || 0,
      checkin_hoje: !!(loginRow && loginRow.progresso >= 1),
    });
  },

  'POST /api/jogo/envasar': async (req, res) => {
    const user = getUserByToken(req);
    if (!user) return json(res, 401, { error: 'Não autenticado.' });
    const state = aplicarProducao(user.id);
    const quantidade = Math.floor(state.mel);
    if (quantidade <= 0) return json(res, 400, { error: 'Não há mel suficiente para envasar.' });

    db.prepare('UPDATE game_state SET mel = mel - ?, potes = potes + ?, total_potes = total_potes + ? WHERE user_id = ?')
      .run(quantidade, quantidade, quantidade, user.id);
    db.prepare('INSERT INTO event_log (user_id, tipo, amount) VALUES (?, ?, ?)').run(user.id, 'producao', quantidade);
    incrementarMeta(user.id, 'extrair_potes', quantidade);
    incrementarMeta(user.id, 'producao_industrial', quantidade);
    creditarReferralPorProducao(user.id, quantidade);

    json(res, 200, { ok: true, potes_ganhos: quantidade });
  },

  /* ═══ LOJA — apiários, capacidade do reservatório, relógio (flores) ═══ */

  'POST /api/loja/apiario': async (req, res) => {
    const user = getUserByToken(req);
    if (!user) return json(res, 401, { error: 'Não autenticado.' });
    const { tipo } = await readBody(req);
    if (!APIARIOS[tipo]) return json(res, 400, { error: 'Tipo de apiário inválido.' });

    const state = aplicarProducao(user.id);
    const { n } = db.prepare('SELECT COUNT(*) AS n FROM apiarios WHERE user_id=? AND tipo=?').get(user.id, tipo);
    if (n >= APIARIO_MAX_POR_TIPO) return json(res, 400, { error: `Limite de ${APIARIO_MAX_POR_TIPO} apiários do tipo ${tipo} atingido.` });

    const preco = precoProximoApiario(tipo, n);
    if (state.nct < preco) return json(res, 400, { error: `Néctar insuficiente. Necessário: ${preco} NCT.` });

    db.prepare('UPDATE game_state SET nct = nct - ? WHERE user_id = ?').run(preco, user.id);
    db.prepare('INSERT INTO apiarios (user_id, tipo) VALUES (?, ?)').run(user.id, tipo);

    json(res, 200, { ok: true, tipo, preco_pago: preco });
  },

  'POST /api/loja/capacidade': async (req, res) => {
    const user = getUserByToken(req);
    if (!user) return json(res, 401, { error: 'Não autenticado.' });
    const state = aplicarProducao(user.id);
    if ((state.mel_cap_compras || 0) >= CAP_MAX_COMPRAS) return json(res, 400, { error: 'Capacidade máxima já comprada.' });
    const preco = precoProximaCapacidade(state);
    if (state.nct < preco) return json(res, 400, { error: `Néctar insuficiente. Necessário: ${preco} NCT.` });

    db.prepare('UPDATE game_state SET nct = nct - ?, mel_cap_compras = mel_cap_compras + 1 WHERE user_id = ?').run(preco, user.id);
    json(res, 200, { ok: true, preco_pago: preco, nova_capacidade: CAP_BASE + (state.mel_cap_compras + 1) * CAP_INCREMENTO });
  },

  'POST /api/loja/relogio': async (req, res) => {
    const user = getUserByToken(req);
    if (!user) return json(res, 401, { error: 'Não autenticado.' });
    const state = aplicarProducao(user.id);
    if ((state.relogio_compras || 0) >= RELOGIO_MAX_COMPRAS) return json(res, 400, { error: 'Limite de compras do relógio atingido.' });
    const preco = precoProximoRelogio(state);
    if (state.nct < preco) return json(res, 400, { error: `Néctar insuficiente. Necessário: ${preco} NCT.` });

    db.prepare('UPDATE game_state SET nct = nct - ?, relogio_compras = relogio_compras + 1, flores = flores + ? WHERE user_id = ?')
      .run(preco, RELOGIO_FLORES_POR_COMPRA, user.id);
    incrementarMeta(user.id, 'recarregar_energia', 1);
    json(res, 200, { ok: true, preco_pago: preco, flores_ganhas: RELOGIO_FLORES_POR_COMPRA });
  },

  /* ═══ METAS (DESAFIOS) ═══ */

  'GET /api/desafios': async (req, res) => {
    const user = getUserByToken(req);
    if (!user) return json(res, 401, { error: 'Não autenticado.' });
    marcarLoginDiario(user.id);
    const hoje = hojeStr();
    const linhas = db.prepare('SELECT chave, progresso, resgatada FROM metas_diarias WHERE user_id=? AND data_meta=?').all(user.id, hoje);
    const porChave = Object.fromEntries(linhas.map(l => [l.chave, l]));
    const metas = METAS.map(m => {
      const l = porChave[m.chave] || { progresso: 0, resgatada: 0 };
      return {
        chave: m.chave, titulo: m.titulo, descricao: m.descricao, target: m.target,
        reward_nct: m.reward_nct, reward_flores: m.reward_flores,
        progresso: Math.min(l.progresso, m.target),
        completa: l.progresso >= m.target,
        resgatada: !!l.resgatada,
      };
    });
    json(res, 200, { metas });
  },

  'POST /api/desafios/resgatar': async (req, res) => {
    const user = getUserByToken(req);
    if (!user) return json(res, 401, { error: 'Não autenticado.' });
    const { chave } = await readBody(req);
    const meta = METAS.find(m => m.chave === chave);
    if (!meta) return json(res, 400, { error: 'Meta inválida.' });
    const hoje = hojeStr();

    // Update condicional atômico: só marca resgatada=1 se ainda não estava
    // E o progresso já bate o alvo — se changes===0, alguém já resgatou (ou
    // não tinha completado), então nunca paga duas vezes.
    const info = db.prepare(`
      UPDATE metas_diarias SET resgatada = 1
      WHERE user_id=? AND data_meta=? AND chave=? AND resgatada=0 AND progresso >= ?
    `).run(user.id, hoje, chave, meta.target);
    if (info.changes === 0) return json(res, 400, { error: 'Meta ainda não concluída ou já resgatada.' });

    db.prepare('UPDATE game_state SET nct = nct + ?, flores = flores + ? WHERE user_id = ?')
      .run(meta.reward_nct, meta.reward_flores, user.id);

    json(res, 200, { ok: true, reward_nct: meta.reward_nct, reward_flores: meta.reward_flores });
  },

  /* ═══ AMIGOS (REFERRAL) ═══ */

  'GET /api/amigos': async (req, res) => {
    const user = getUserByToken(req);
    if (!user) return json(res, 401, { error: 'Não autenticado.' });
    const state = db.prepare('SELECT bonus_potes_pendente, bonus_potes_total FROM game_state WHERE user_id=?').get(user.id);
    const indicados = db.prepare(`
      SELECT u.username, u.created_at, i.validado, i.created_at AS indicado_em
      FROM indicacoes i JOIN users u ON u.id = i.indicado_id
      WHERE i.indicador_id = ?
      ORDER BY i.id DESC
    `).all(user.id);
    json(res, 200, {
      codigo: user.username,
      link: `https://biffi.online/NectarMine/login.html?ref=${encodeURIComponent(user.username)}`,
      total_indicados: indicados.length,
      validados: indicados.filter(i => i.validado).length,
      bonus_pendente: state.bonus_potes_pendente || 0,
      bonus_total: state.bonus_potes_total || 0,
      indicados: indicados.map(i => ({ username: i.username, validado: !!i.validado, indicado_em: i.indicado_em })),
    });
  },

  'POST /api/amigos/resgatar': async (req, res) => {
    const user = getUserByToken(req);
    if (!user) return json(res, 401, { error: 'Não autenticado.' });
    const state = db.prepare('SELECT bonus_potes_pendente FROM game_state WHERE user_id=?').get(user.id);
    const pendente = state.bonus_potes_pendente || 0;
    if (pendente <= 0) return json(res, 400, { error: 'Nenhum bônus disponível para resgatar.' });

    db.prepare(`
      UPDATE game_state
      SET potes = potes + ?, bonus_potes_pendente = 0, bonus_potes_total = bonus_potes_total + ?
      WHERE user_id = ?
    `).run(pendente, pendente, user.id);

    json(res, 200, { ok: true, potes_resgatados: pendente });
  },

  /* ═══ MERCADO — comprar/vender potes por NCT ═══ */

  'GET /api/mercado': async (req, res) => {
    const user = getUserByToken(req);
    if (!user) return json(res, 401, { error: 'Não autenticado.' });
    const historico = db.prepare('SELECT tipo, quantidade, preco_unit, total_nct, created_at FROM mercado_transacoes WHERE user_id=? ORDER BY id DESC LIMIT 30').all(user.id);
    json(res, 200, { preco_pote: precoMelAtual(), historico });
  },

  'POST /api/mercado/vender': async (req, res) => {
    const user = getUserByToken(req);
    if (!user) return json(res, 401, { error: 'Não autenticado.' });
    const { quantidade } = await readBody(req);
    const qtd = Math.floor(Number(quantidade));
    if (!isFinite(qtd) || qtd <= 0) return json(res, 400, { error: 'Quantidade inválida.' });

    const state = db.prepare('SELECT * FROM game_state WHERE user_id=?').get(user.id);
    if (state.potes < qtd) return json(res, 400, { error: 'Você não tem potes suficientes.' });

    const preco = precoMelAtual();
    const total = qtd * preco;
    db.prepare('UPDATE game_state SET potes = potes - ?, nct = nct + ? WHERE user_id=?').run(qtd, total, user.id);
    db.prepare(`INSERT INTO mercado_transacoes (user_id, tipo, quantidade, preco_unit, total_nct) VALUES (?, 'venda', ?, ?, ?)`).run(user.id, qtd, preco, total);
    incrementarMeta(user.id, 'vender_mercado', qtd);

    json(res, 200, { ok: true, quantidade: qtd, preco_unit: preco, total_recebido: total });
  },

  'POST /api/mercado/comprar': async (req, res) => {
    const user = getUserByToken(req);
    if (!user) return json(res, 401, { error: 'Não autenticado.' });
    const { quantidade } = await readBody(req);
    const qtd = Math.floor(Number(quantidade));
    if (!isFinite(qtd) || qtd <= 0) return json(res, 400, { error: 'Quantidade inválida.' });

    const preco = precoMelAtual();
    const total = qtd * preco;
    const state = db.prepare('SELECT * FROM game_state WHERE user_id=?').get(user.id);
    if (state.nct < total) return json(res, 400, { error: 'Néctar insuficiente.' });

    db.prepare('UPDATE game_state SET nct = nct - ?, potes = potes + ? WHERE user_id=?').run(total, qtd, user.id);
    db.prepare(`INSERT INTO mercado_transacoes (user_id, tipo, quantidade, preco_unit, total_nct) VALUES (?, 'compra', ?, ?, ?)`).run(user.id, qtd, preco, total);
    incrementarMeta(user.id, 'comprar_mercado', qtd);

    json(res, 200, { ok: true, quantidade: qtd, preco_unit: preco, total_pago: total });
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
    // Promise separada que só resolve quando o arquivo terminou de ser gravado
    // em disco (evento 'finish' do write stream) — o 'close' do busboy só
    // significa que ele terminou de LER o corpo da requisição, não que a
    // escrita em disco já foi concluída. Sem isso, o código seguia em frente
    // e tentava usar um arquivo ainda incompleto (ou até vazio).
    let escritaConcluida = Promise.resolve();

    const aguardaUpload = new Promise((resolve, reject) => {
      bb.on('field', (name, val) => { if (name === 'produto_id') produtoId = Number(val); });
      bb.on('file', (name, stream, info) => {
        if (name !== 'pdf') { stream.resume(); return; }
        recebeuArquivo = true;
        tmpPath = path.join(os.tmpdir(), `upload-${Date.now()}-${crypto.randomBytes(6).toString('hex')}.pdf`);
        const out = fs.createWriteStream(tmpPath);
        escritaConcluida = new Promise((res2, rej2) => {
          out.on('finish', res2);
          out.on('error', rej2);
        });
        stream.on('limit', () => { fileTooBig = true; });
        stream.pipe(out);
      });
      bb.on('close', () => resolve());
      bb.on('error', reject);
    });

    try {
      req.pipe(bb);
      await aguardaUpload;
      await escritaConcluida;
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
  // Upload da foto/capa de um produto. A imagem fica salva no servidor (pasta
  // IMAGENS_DIR) e é servida publicamente por GET /api/imagens/produtos/:arquivo
  // — necessário porque a loja roda no GitHub Pages e precisa de uma URL
  // pública pra exibir a foto, diferente do PDF do e-book (que nunca é público).
  {
    method: 'POST', re: /^\/api\/admin\/products\/(\d+)\/imagem$/,
    handler: async (req, res, url, m) => {
      if (!isAdmin(req)) return json(res, 403, { error: 'Não autorizado.' });
      const produtoId = Number(m[1]);
      const produto = db.prepare('SELECT * FROM produtos WHERE id = ?').get(produtoId);
      if (!produto) return json(res, 404, { error: 'Produto não encontrado.' });

      const busboy = require('busboy');
      let bb;
      try {
        bb = busboy({ headers: req.headers, limits: { fileSize: 8 * 1024 * 1024 } }); // até 8MB
      } catch (e) {
        return json(res, 400, { error: 'Requisição de upload inválida.' });
      }

      const EXT_PERMITIDAS = { '.jpg': true, '.jpeg': true, '.png': true, '.webp': true, '.gif': true };
      let tmpPath = null;
      let extensao = null;
      let fileTooBig = false;
      let recebeuArquivo = false;
      let tipoInvalido = false;
      // Ver comentário equivalente na rota de upload de PDF: o 'close' do busboy
      // não garante que a escrita em disco terminou — precisa esperar o 'finish'
      // do write stream, senão o arquivo movido/lido em seguida pode vir vazio.
      let escritaConcluida = Promise.resolve();

      const aguardaUpload = new Promise((resolve, reject) => {
        bb.on('file', (name, stream, info) => {
          if (name !== 'imagem') { stream.resume(); return; }
          const ext = path.extname(info.filename || '').toLowerCase();
          if (!EXT_PERMITIDAS[ext] || !/^image\//.test(info.mimeType || '')) {
            tipoInvalido = true;
            stream.resume();
            return;
          }
          recebeuArquivo = true;
          extensao = ext;
          tmpPath = path.join(os.tmpdir(), `img-${Date.now()}-${crypto.randomBytes(6).toString('hex')}${ext}`);
          const out = fs.createWriteStream(tmpPath);
          escritaConcluida = new Promise((res2, rej2) => {
            out.on('finish', res2);
            out.on('error', rej2);
          });
          stream.on('limit', () => { fileTooBig = true; });
          stream.pipe(out);
        });
        bb.on('close', () => resolve());
        bb.on('error', reject);
      });

      try {
        req.pipe(bb);
        await aguardaUpload;
        await escritaConcluida;
      } catch (e) {
        if (tmpPath) fs.unlink(tmpPath, () => {});
        return json(res, 400, { error: 'Erro ao receber a imagem enviada.' });
      }

      if (tipoInvalido) { if (tmpPath) fs.unlink(tmpPath, () => {}); return json(res, 400, { error: 'Formato inválido. Envie uma imagem JPG, PNG, WEBP ou GIF.' }); }
      if (fileTooBig) { if (tmpPath) fs.unlink(tmpPath, () => {}); return json(res, 400, { error: 'Imagem muito grande (máximo 8MB).' }); }
      if (!recebeuArquivo || !tmpPath || !fs.existsSync(tmpPath)) return json(res, 400, { error: 'Nenhuma imagem foi enviada (campo "imagem").' });

      const nomeArquivo = `produto-${produtoId}-${Date.now()}${extensao}`;
      moverArquivoSeguro(tmpPath, path.join(IMAGENS_DIR, nomeArquivo));

      // Apaga a imagem antiga enviada anteriormente pra este produto (se houver), pra não acumular lixo
      if (produto.imagem && produto.imagem.startsWith('api/imagens/produtos/')) {
        fs.unlink(path.join(IMAGENS_DIR, path.basename(produto.imagem)), () => {});
      }

      const caminho = `api/imagens/produtos/${nomeArquivo}`;
      db.prepare(`UPDATE produtos SET imagem = ?, updated_at = datetime('now') WHERE id = ?`).run(caminho, produtoId);

      json(res, 200, { ok: true, imagem: caminho });
    },
  },
  // Serve publicamente as fotos de produto enviadas pelo admin (sem autenticação —
  // são imagens de vitrine, precisam aparecer pra qualquer visitante da loja)
  {
    method: 'GET', re: /^\/api\/imagens\/produtos\/([a-zA-Z0-9_.-]+)$/,
    handler: async (req, res, url, m) => {
      const arquivo = path.join(IMAGENS_DIR, m[1]);
      if (!arquivo.startsWith(IMAGENS_DIR) || !fs.existsSync(arquivo)) return json(res, 404, { error: 'Imagem não encontrada.' });
      const mime = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.gif': 'image/gif' }[path.extname(arquivo).toLowerCase()] || 'application/octet-stream';
      fs.readFile(arquivo, (err, data) => {
        if (err) return json(res, 404, { error: 'Imagem não encontrada.' });
        res.writeHead(200, { 'Content-Type': mime, 'Cache-Control': 'public, max-age=31536000, immutable' });
        res.end(data);
      });
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
