# Pendências — NectarMine / BIFFI.ONLINE

## Aplicar o desconto da Carteira no checkout da lojinha

**Status:** em aberto. Registrado em 2026-08-20.

### O que já existe

- Jogador reserva um valor em R$ da Carteira como desconto (`POST /api/carteira/desconto-loja`,
  em `NectarMine/server/server.js`), que grava uma linha em `carteira_transacoes` com
  `tipo = 'desconto_loja'` e `status = 'disponivel'`.
- O admin já enxerga e gerencia essas reservas no painel (`admin/index.html`, view "💰 Carteira",
  filtro por tipo = "Desconto lojinha"), incluindo trocar o status manualmente.
- O comentário no próprio `server.js` (linhas ~1635–1639, logo acima da rota
  `POST /api/carteira/desconto-loja`) já deixa isso documentado no código.

### O que falta

O valor reservado **não é debitado automaticamente de nenhum pedido**. Hoje, se o jogador quiser
usar o desconto, é preciso combinar manualmente com a loja — não há integração com o fluxo de
compra.

Para fechar isso, falta:

1. Em `checkout.html` (fora da pasta `NectarMine`, ainda não copiado pra esta sessão de trabalho):
   mostrar o saldo de desconto disponível do jogador (via `GET /api/carteira`, campo
   `saldo_reais`, ou uma consulta filtrada por `tipo=desconto_loja e status=disponivel`) e deixar
   escolher quanto do desconto aplicar naquele pedido.
2. Em `POST /api/checkout` (`NectarMine/server/server.js`, por volta da linha onde é calculado
   `const totalCents = subtotalCents + freteCents;`): aceitar um valor de desconto vindo do corpo
   da requisição, validar contra o saldo real do jogador (nunca confiar no valor do cliente,
   seguindo o padrão server-authoritative já usado em todo o resto do jogo), subtrair do
   `totalCents` e marcar a(s) transação(ões) de `desconto_loja` correspondentes como usadas
   (precisa decidir o nome do novo status — hoje os status válidos em `carteira_transacoes` são
   `concluido/disponivel/pendente/pago/cancelado`; provavelmente vale adicionar `usado`).
3. Atualizar a view "Carteira" do admin para refletir esse novo status, se for criado.

### Por que ficou pendente

Todo o resto da reformulação do NectarMine (apiários, reservatório, flores, mercado, desafios,
indicações, carteira) já foi implementado, testado e entregue. Esse item específico depende do
fluxo de checkout da lojinha, que é uma parte separada do site e não estava no escopo da conversa
que gerou esta pendência — fica marcado aqui pra não se perder, e pode ser resolvido "em outro
momento", como combinado com o Silvio.
