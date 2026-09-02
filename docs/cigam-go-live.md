# Go-live da sincronização CIGAM do totem

Estado em 02/09/2026. O código todo está escrito e no servidor; o que falta é
**executar**, e a execução depende do CIGAM, que só pode ser tocado fora do
horário de pico.

## Por que não dá pra simplesmente subir

1. **Sessão única.** O CIGAM aceita uma sessão por usuário e `winiston.a` é o
   mesmo login usado pelo PDV em produção. Qualquer login novo (inclusive
   `npm run cigam:check`) invalida o token do PDV. O PDV se recupera sozinho
   via `withAuthRetry`, mas foi essa a suspeita não confirmada do incidente de
   vendas de 17/08. Regra herdada do PDV: **só depois das 16:45**.
2. **NF real.** `CIGAM_AUTO_EFETIVAR_PEDIDO=1` no `.env` do servidor. O
   `totem-loja-cigam` emite nota fiscal de verdade (série **CF1**, diferente do
   REC do catálogo de funcionários) para todo pedido `PENDING` assim que sobe.

## Antes de qualquer coisa: preflight

Não fala com o CIGAM, pode rodar a qualquer hora:

```bash
ssh xulio@192.168.100.128 'cd ~/apps/totem-loja && source ~/.nvm/nvm.sh && node scripts/cigam-preflight.mjs'
```

Ele responde as duas perguntas que importam: quantos pedidos a subida do
serviço processaria (= quantas NFs sairiam), e quais produtos vendáveis ainda
não têm `cigam_code`.

**Rodado em 02/09:** fila vazia (tabela `orders` sem nenhuma linha), 170/178
produtos mapeados, **8 vendáveis sem código**.

## Bloqueio que sobrou: os 8 produtos

7 alhos em creme OMG e o Pão de Queijo Gourmet 1kg — ver
`docs/cigam-mapeamento-produtos.md` para o detalhe de cada um e por que o
catálogo de funcionários não serve de fonte. Os códigos precisam ser lidos do
próprio CIGAM.

Um produto sem código faz `buildItens` estourar e derruba o **pedido inteiro**
(`erp_status=ERROR`), não só o item — mas falha **antes** de chamar o CIGAM,
então nunca deixa pedido pela metade no ERP.

Duas saídas, as duas exigem decisão do dono:

- **(A)** buscar os 8 códigos no CIGAM e gravar em `products.cigam_code` /
  `cigam_unit`. Conferir sabor **e** tamanho de embalagem item a item —
  matching por similaridade já juntou três alhos diferentes no mesmo código.
- **(B)** desativar os 8 no totem (`products.active = false`) até os códigos
  existirem. Tira 8 itens da vitrine — decisão de negócio, não técnica.

## Sequência do go-live (depois das 16:45)

```bash
ssh xulio@192.168.100.128
cd ~/apps/totem-loja && source ~/.nvm/nvm.sh

# 1. preflight — confirmar fila e mapeamento
node scripts/cigam-preflight.mjs

# 2. smoke de login (JÁ derruba a sessão do PDV — é o primeiro toque no CIGAM)
npm run cigam:check

# 3. subir o serviço
pm2 start ecosystem.config.cjs --only totem-loja-cigam && pm2 save

# 4. acompanhar o primeiro ciclo
pm2 logs totem-loja-cigam --lines 40
```

Depois do passo 2, conferir no PDV se o caixa continua vendendo antes de seguir
para o 3.

Para desligar: `pm2 delete totem-loja-cigam && pm2 save`.

## Segundo usuário no CIGAM

Um usuário CIGAM separado só para as automações elimina o conflito de sessão de
uma vez — vale para o totem, o PDV e o catálogo de funcionários. Já foi
oferecido ao dono, que até agora não quis. Continua sendo a solução certa.
