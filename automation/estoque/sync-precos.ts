/**
 * Preço do catálogo do totem vindo do CIGAM, a mesma fonte do caixa.
 *
 * Até 28/09/2026 os preços do totem eram digitados no cadastro e ficaram para
 * trás: 168 dos 177 produtos estavam uns 10% abaixo da tabela 002. O cliente
 * via um valor no totem e o CIGAM faturava outro.
 *
 * Varejo = tabela CIGAM_TABELA_PRECO_VAREJO (002), atacado =
 * CIGAM_TABELA_PRECO_ATACADO (003), gravados em price_cpf_varejo e
 * price_cpf_atacado, que são as colunas que o carrinho, a conferência do
 * checkout e a create_order_v1 leem. A unidade é a mesma do CIGAM: R$/kg para
 * material KG (o totem multiplica pelo peso do pacote) e R$ por pacote para
 * PCT/UN/CX. Produto sem linha na tabela fica com o preço que já tinha.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { CigamClient } from "../cigam/client";

export type ProdutoComPreco = {
  id: string;
  cigam_code: string | null;
  price_cpf_varejo: number | string | null;
  price_cpf_atacado: number | string | null;
};

export type AtualizacaoDePreco = { id: string; price_cpf_varejo?: number; price_cpf_atacado?: number };

type LinhaDePreco = { Elemento: string; CodigoTabela: string; PrecoUnitario: number };

export function indexarPrecos(linhas: LinhaDePreco[]): Map<string, number> {
  const mapa = new Map<string, number>();
  for (const l of linhas) {
    const preco = Number(l.PrecoUnitario);
    if (!Number.isFinite(preco) || preco <= 0) continue;
    mapa.set(`${String(l.Elemento).trim()}|${String(l.CodigoTabela).trim()}`, preco);
  }
  return mapa;
}

const mudou = (atual: number | string | null, novo: number) =>
  atual === null || atual === "" || Math.abs(Number(atual) - novo) > 0.0049;

export function calcularAtualizacoesDePreco(
  produtos: ProdutoComPreco[],
  precos: Map<string, number>,
  tabelaVarejo: string,
  tabelaAtacado: string
): AtualizacaoDePreco[] {
  const saida: AtualizacaoDePreco[] = [];
  for (const p of produtos) {
    const codigo = p.cigam_code?.trim();
    if (!codigo) continue;
    const varejo = precos.get(`${codigo}|${tabelaVarejo}`);
    const atacado = precos.get(`${codigo}|${tabelaAtacado}`);
    const a: AtualizacaoDePreco = { id: p.id };
    if (varejo !== undefined && mudou(p.price_cpf_varejo, varejo)) a.price_cpf_varejo = varejo;
    if (atacado !== undefined && mudou(p.price_cpf_atacado, atacado)) a.price_cpf_atacado = atacado;
    if (a.price_cpf_varejo !== undefined || a.price_cpf_atacado !== undefined) saida.push(a);
  }
  return saida;
}

export async function sincronizarPrecos(
  supabase: SupabaseClient,
  cigam: CigamClient,
  tabelaVarejo = process.env.CIGAM_TABELA_PRECO_VAREJO ?? "002",
  tabelaAtacado = process.env.CIGAM_TABELA_PRECO_ATACADO ?? "003"
): Promise<{ atualizados: number; semPrecoVarejo: number }> {
  const precos = indexarPrecos(await cigam.buscarPrecos());
  // Resposta vazia ou quase vazia é falha do CIGAM, não "todo mundo sem
  // preço": não mexe em nada.
  if (precos.size < 50) throw new Error(`PrecosTabela devolveu só ${precos.size} preços válidos; nada foi alterado.`);

  const { data, error } = await supabase
    .from("products")
    .select("id, cigam_code, price_cpf_varejo, price_cpf_atacado")
    .not("cigam_code", "is", null);
  if (error) throw new Error(`Falha ao listar produtos para o preço: ${error.message}`);
  const produtos = (data ?? []) as ProdutoComPreco[];

  const atualizacoes = calcularAtualizacoesDePreco(produtos, precos, tabelaVarejo, tabelaAtacado);
  for (const a of atualizacoes) {
    const { id, ...campos } = a;
    const { error: updErr } = await supabase.from("products").update(campos).eq("id", id);
    if (updErr) console.error(`[preco] falha ao gravar o preço do produto ${id}: ${updErr.message}`);
  }
  const semPrecoVarejo = produtos.filter((p) => !precos.has(`${p.cigam_code?.trim()}|${tabelaVarejo}`)).length;
  return { atualizados: atualizacoes.length, semPrecoVarejo };
}
