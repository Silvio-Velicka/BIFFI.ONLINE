/* ═══════════════════════════════════════════════════════════
   NECTARMINE — Servidor (Node.js + SQLite)
   Zero dependências externas. Requer Node.js 22 ou superior.
   Rodar:  node server/server.js
   Site:   http://localhost:3000
   ═══════════════════════════════════════════════════════════ */

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
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
`);

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
};

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
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }
  }

  if (url.pathname.startsWith('/api/')) {
    const handler = routes[key];
    if (!handler) return json(res, 404, { error: 'Rota não encontrada.' });
    try { await handler(req, res, url); }
    catch (e) { console.error(e); json(res, 500, { error: 'Erro interno do servidor.' }); }
    return;
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
