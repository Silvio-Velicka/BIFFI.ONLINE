/* ═══════════════════════════════════════════════════════════
   MELHOR ENVIO — Gerenciamento automático do token OAuth2
   Portado do projeto Zav3dPrint.com.br (mesmo dono), adaptado de
   Postgres/Express pra SQLite (node:sqlite) + servidor Node puro.

     access_token  → validade de 30 dias
     refresh_token → validade de 45 dias (renovado a cada refresh)

   Enquanto o servidor renovar o token pelo menos uma vez a cada ~27 dias
   (o que acontece sozinho, sempre que alguém calcula um frete), a
   integração nunca mais pede pra trocar o token manualmente.

   client_id/client_secret ficam fixos nas variáveis de ambiente do Railway
   (MELHOR_ENVIO_CLIENT_ID / MELHOR_ENVIO_CLIENT_SECRET) — esses NUNCA
   expiram. access_token/refresh_token ficam salvos no banco (tabela
   melhorenvio_auth, criada em server.js), pois precisam sobreviver a
   reinícios do servidor (Railway recria o container a cada deploy).
   ═══════════════════════════════════════════════════════════ */

const ME_OAUTH_URL     = 'https://melhorenvio.com.br/oauth/token';
const ME_AUTHORIZE_URL = 'https://melhorenvio.com.br/oauth/authorize';
const USER_AGENT       = 'Aplicativo BIFFI.ONLINE silviovelicka@gmail.com';

const SCOPES = [
  'cart-read', 'cart-write',
  'shipping-calculate', 'shipping-cancel', 'shipping-checkout',
  'shipping-companies', 'shipping-generate', 'shipping-preview',
  'shipping-print', 'shipping-tracking',
].join(' ');

// Renova com folga de 3 dias antes do vencimento real do access_token (30 dias).
// O refresh_token dura 45 dias, então há margem de sobra mesmo se o site
// ficar alguns dias sem receber nenhuma requisição de frete.
const BUFFER_MS = 3 * 24 * 60 * 60 * 1000;

module.exports = function criarMelhorEnvioService(db) {
  function getRow() {
    return db.prepare('SELECT * FROM melhorenvio_auth WHERE id = 1').get();
  }

  function saveTokens({ access_token, refresh_token, expires_in }) {
    const expiresAt = new Date(Date.now() + expires_in * 1000);
    db.prepare(`
      UPDATE melhorenvio_auth
      SET access_token = ?, refresh_token = ?, expires_at = ?, atualizado_em = datetime('now')
      WHERE id = 1
    `).run(access_token, refresh_token, expiresAt.toISOString());
    return expiresAt;
  }

  function getClientCreds() {
    const clientId = process.env.MELHOR_ENVIO_CLIENT_ID;
    const clientSecret = process.env.MELHOR_ENVIO_CLIENT_SECRET;
    if (!clientId || !clientSecret) {
      throw new Error('MELHOR_ENVIO_CLIENT_ID / MELHOR_ENVIO_CLIENT_SECRET não configurados nas variáveis do Railway.');
    }
    return { clientId, clientSecret };
  }

  /** Troca o refresh_token atual por um access_token novo (e um refresh_token novo). */
  async function refresh(row) {
    const { clientId, clientSecret } = getClientCreds();
    if (!row || !row.refresh_token) {
      throw new Error('Sem refresh_token salvo — é necessário autorizar o aplicativo em GET /api/frete/oauth/iniciar.');
    }

    const res = await fetch(ME_OAUTH_URL, {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json', 'User-Agent': USER_AGENT },
      body: JSON.stringify({
        grant_type: 'refresh_token',
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: row.refresh_token,
      }),
    });

    const text = await res.text();
    if (!res.ok) {
      console.error('[MelhorEnvio] Falha ao renovar token:', res.status, text.slice(0, 300));
      throw new Error(`Falha ao renovar token do Melhor Envio (HTTP ${res.status}). Pode ser necessário reautorizar em GET /api/frete/oauth/iniciar.`);
    }

    const data = JSON.parse(text);
    const expiresAt = saveTokens(data);
    console.log('[MelhorEnvio] Token renovado automaticamente. Novo vencimento:', expiresAt.toISOString());
    return data.access_token;
  }

  /** Retorna um access_token válido, renovando automaticamente quando necessário. */
  async function getAccessToken() {
    const row = getRow();

    if (!row || !row.access_token) {
      // Fallback de compatibilidade: token estático antigo (não se renova sozinho).
      if (process.env.MELHOR_ENVIO_TOKEN) return process.env.MELHOR_ENVIO_TOKEN;
      throw new Error('Melhor Envio ainda não autorizado. Acesse GET /api/frete/oauth/iniciar para conectar.');
    }

    const expiresAt = row.expires_at ? new Date(row.expires_at).getTime() : 0;
    if (Date.now() > expiresAt - BUFFER_MS) {
      return await refresh(row);
    }
    return row.access_token;
  }

  /** Força uma renovação imediata — usado quando uma chamada à API leva 401 inesperado. */
  async function forceRefresh() {
    const row = getRow();
    return await refresh(row);
  }

  /** Monta a URL para a qual o navegador deve ser redirecionado para autorizar o app. */
  function buildAuthorizeUrl(redirectUri, state) {
    const { clientId } = getClientCreds();
    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      state: state || 'biffionline',
      scope: SCOPES,
    });
    return `${ME_AUTHORIZE_URL}?${params.toString()}`;
  }

  /** Troca o "code" recebido no callback pelo primeiro par access_token/refresh_token. */
  async function exchangeCode(code, redirectUri) {
    const { clientId, clientSecret } = getClientCreds();

    const res = await fetch(ME_OAUTH_URL, {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json', 'User-Agent': USER_AGENT },
      body: JSON.stringify({
        grant_type: 'authorization_code',
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        code,
      }),
    });

    const text = await res.text();
    if (!res.ok) {
      throw new Error(`Falha ao trocar code por token (HTTP ${res.status}): ${text.slice(0, 300)}`);
    }

    const data = JSON.parse(text);
    const expiresAt = saveTokens(data);
    console.log('[MelhorEnvio] Autorização concluída. Token válido até', expiresAt.toISOString());
    return data;
  }

  /** true se já existe token salvo OU token estático de compatibilidade — usado
      pra decidir se tenta calcular frete real ou cai direto no fallback fixo. */
  function estaConfigurado() {
    if (process.env.MELHOR_ENVIO_TOKEN) return true;
    if (!process.env.MELHOR_ENVIO_CLIENT_ID || !process.env.MELHOR_ENVIO_CLIENT_SECRET) return false;
    const row = getRow();
    return !!(row && row.refresh_token);
  }

  return { getAccessToken, forceRefresh, buildAuthorizeUrl, exchangeCode, estaConfigurado };
};
