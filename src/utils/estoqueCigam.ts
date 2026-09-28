/**
 * O produto aparece no catálogo do totem? Mesma régua do PDV
 * (indisponivelParaVenda em pdv-gm/server/src/cigam/catalogCache.ts): físico
 * da empresa 001 maior que zero. Nunca lido esconde igual a zero.
 *
 * Quem mantém products.estoque_cigam é o totem-pdv-sync, de 5 em 5 minutos
 * (automation/estoque/sync-estoque.ts), e ele não apaga o último valor bom
 * quando o CIGAM falha.
 */
export function disponivelNoCigam(row: { estoque_cigam?: number | string | null } | null | undefined): boolean {
  const bruto = row?.estoque_cigam;
  if (bruto === null || bruto === undefined || bruto === "") return false;
  const saldo = Number(bruto);
  return Number.isFinite(saldo) && saldo > 0;
}
