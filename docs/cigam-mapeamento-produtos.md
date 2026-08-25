# Mapeamento de produtos do totem -> CIGAM

Estado em 25/08/2026: **170 de 178 produtos mapeados**, 8 pendentes.

## Como o mapeamento funciona

`automation/cigam/match-product-codes.ts` casa `products.name` do totem com os
produtos ja cadastrados no catalogo de funcionarios, por nome exato. Ele so
escreve em produtos com `cigam_code IS NULL` (ver o `.is("cigam_code", null)` na
busca), entao **mapeamento manual nao e desfeito por um re-run**.

## Os 8 aplicados a mao em 25/08

O matcher automatico nao pegou estes porque o nome no totem tem sufixo de
embalagem que o catalogo nao tem (`- 1kg`, `- 50 und`). Conferidos um a um,
nome e embalagem batendo:

| produto no totem | cigam_code | unidade |
|---|---|---|
| Biscoito 4 Queijo Comprido - 1kg | 002004000014 | KG |
| Churros de Chocolate - 50 und | 002003000024 | PCT |
| Churros de Doce de Leite - 50 und | 002003000014 | PCT |
| Pao de Queijo Recheado com Carne - 1kg | 002005000032 | KG |
| Pao de Queijo Recheado com Frango - 1kg | 002005000024 | KG |
| Pao de Queijo Recheado com Goiabada - 1kg | 002005000039 | KG |
| Pao de Queijo Recheado com Linguica Apimentada -1kg | 002005000033 | KG |
| Romeu e Julieta assado G - 10 Unidades | 002002000008 | PCT |

Cuidado no ultimo: existe tambem `002002000007`, que e o **Mini** Romeu e
Julieta, pacote com 50 unidades. O do totem e o "G" com 10 unidades.

## ARMADILHA: nao confiar em matching por similaridade

Uma tentativa de casar os 16 faltantes por sobreposicao de tokens colocou
**tres alhos de sabores diferentes no mesmo codigo** (`002001000016`). No CIGAM
cada sabor e cada embalagem e um material distinto. Todo mapeamento novo tem
que ser conferido item a item, com sabor E tamanho de pacote batendo.

## Os 8 que ainda faltam (precisam de consulta no CIGAM)

Nenhum tem equivalente no catalogo de funcionarios:

- **7 alhos em creme OMG.** O catalogo tem um unico alho, o *Pimenta Calabresa
  Bisnaga 1,01kg* (`002001000016`, CX). O totem tem Cebola, Ervas Finas,
  Tradicional e Pimenta Calabresa, em Bisnaga e/ou **Pote 200g**. Nem o de
  mesmo sabor serve: Pote 200g e Bisnaga 1,01kg sao materiais diferentes.
- **Pao de Queijo Gourmet - Pacote 1kg.** O catalogo so tem a versao **400g**
  (`002005000046`).

### Por que isso e urgente

Os 8 estao **ativos e em estoque**, entao podem cair num carrinho. E
`buildItens` estoura no primeiro produto sem codigo, derrubando **o pedido
inteiro** — um carrinho que misture mapeado e nao-mapeado nao sincroniza nada.
Verificado em simulacao:

```
===== GM-20260825-001114 -> ERROR
   erro: Produto sem codigo CIGAM: Alho Em Creme com Cebola OMG Bisnaga
```

A falha acontece **antes** de qualquer chamada ao CIGAM, entao nao fica pedido
pela metade no ERP. O pedido fica em `erp_status=ERROR` esperando correcao.

Enquanto os codigos nao existirem, a alternativa e desativar esses 8 produtos
no totem — decisao de negocio, nao foi tomada.
