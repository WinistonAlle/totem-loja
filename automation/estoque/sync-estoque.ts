/**
 * Estoque do CIGAM no catálogo do totem — mesma régua do PDV
 * (indisponivelParaVenda em pdv-gm/server/src/cigam/catalogCache.ts):
 *
 * - vale o FÍSICO da empresa de estoque (001), não o físico menos a carteira;
 * - produto sem leitura nunca feita, ou com físico <= 0, some do catálogo;
 * - leitura que falha (o CIGAM devolve EstoqueGeral vazio de forma
 *   intermitente sob carga) NÃO apaga o último valor bom. Sem isso o produto
 *   sumiria e voltaria da tela sozinho enquanto o cliente escolhe.
 *
 * Grava em products.estoque_cigam, e não em in_stock: in_stock continua sendo
 * o "esgotado" manual do admin, que vale por cima do CIGAM.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { CigamClient } from "../cigam/client";

export type ProdutoComEstoque = {
  id: string;
  cigam_code: string | null;
  estoque_cigam: number | string | null;
};

export type AtualizacaoDeEstoque = { id: string; estoque_cigam: number };

/**
 * Decide o que gravar. `lidos` traz o físico por código CIGAM; código ausente
 * ou `null` é leitura que falhou e mantém o valor atual. Só devolve quem mudou,
 * para não reescrever 177 linhas a cada ciclo.
 */
export function calcularAtualizacoesDeEstoque(
  produtos: ProdutoComEstoque[],
  lidos: Map<string, number | null>
): AtualizacaoDeEstoque[] {
  const atualizacoes: AtualizacaoDeEstoque[] = [];
  for (const produto of produtos) {
    const codigo = produto.cigam_code?.trim();
    if (!codigo) continue;
    const lido = lidos.get(codigo);
    if (lido === undefined || lido === null || !Number.isFinite(lido)) continue;
    const atual = produto.estoque_cigam === null ? null : Number(produto.estoque_cigam);
    if (atual !== null && Math.abs(atual - lido) < 0.0005) continue;
    atualizacoes.push({ id: produto.id, estoque_cigam: lido });
  }
  return atualizacoes;
}

export async function sincronizarEstoque(
  supabase: SupabaseClient,
  cigam: CigamClient,
  empresaEstoque = process.env.CIGAM_ESTOQUE_UNIDADE_NEGOCIO ?? "001"
): Promise<{ lidos: number; falhas: number; atualizados: number; semEstoque: number }> {
  const { data, error } = await supabase
    .from("products")
    .select("id, cigam_code, estoque_cigam")
    .eq("active", true)
    .not("cigam_code", "is", null);
  if (error) throw new Error(`Falha ao listar produtos para o estoque: ${error.message}`);

  const produtos = (data ?? []) as ProdutoComEstoque[];
  const codigos = Array.from(new Set(produtos.map((p) => p.cigam_code?.trim()).filter(Boolean))) as string[];

  // Um de cada vez, como o PDV (STOCK_SYNC_CONCURRENCY = 1): em paralelo o
  // CIGAM devolve mais leituras vazias, e são dois sistemas lendo o mesmo ERP.
  const lidos = new Map<string, number | null>();
  let falhas = 0;
  for (const codigo of codigos) {
    try {
      lidos.set(codigo, await cigam.lerEstoqueFisico(codigo, empresaEstoque));
    } catch (err) {
      lidos.set(codigo, null);
      falhas++;
      if (falhas <= 3) console.error(`[estoque] falha ao ler ${codigo}:`, err instanceof Error ? err.message : err);
    }
  }

  const atualizacoes = calcularAtualizacoesDeEstoque(produtos, lidos);
  const agora = new Date().toISOString();
  for (const a of atualizacoes) {
    const { error: updErr } = await supabase
      .from("products")
      .update({ estoque_cigam: a.estoque_cigam, estoque_cigam_atualizado_em: agora })
      .eq("id", a.id);
    if (updErr) console.error(`[estoque] falha ao gravar o estoque do produto ${a.id}: ${updErr.message}`);
  }

  const semLeitura = [...lidos.values()].filter((v) => v === null).length;
  const semEstoque = [...lidos.values()].filter((v) => v !== null && v <= 0).length;
  return { lidos: codigos.length - semLeitura, falhas: semLeitura, atualizados: atualizacoes.length, semEstoque };
}
