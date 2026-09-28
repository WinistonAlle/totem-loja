/**
 * Vigia do totem. O checkout ficou recusando todo pedido de 23/09 a 28/09 e
 * ninguém soube: as falhas iam para app_events e ninguém olhava. Aqui as
 * mesmas fontes viram alerta, gravado como evento de erro (aparece em
 * /diagnostico) e, se ALERTA_EMAIL_PARA estiver configurado, por e-mail.
 *
 * Só avisa quando o conjunto de alertas muda ou a cada hora enquanto durar,
 * para não virar ruído que ninguém lê.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

export type SituacaoDoTotem = {
  falhasDeCheckoutUltimaHora: number;
  pedidosComErroDeEnvio: string[];
  pedidosEsperandoCaixa: Array<{ numero: string; cliente: string; minutos: number }>;
  minutosDesdeEstoqueOk: number | null;
};

export const LIMITE_ESPERA_CAIXA_MIN = 30;
export const LIMITE_ESTOQUE_PARADO_MIN = 20;

export function montarAlertas(s: SituacaoDoTotem): string[] {
  const alertas: string[] = [];
  if (s.falhasDeCheckoutUltimaHora > 0) {
    alertas.push(
      `${s.falhasDeCheckoutUltimaHora} tentativa(s) de pedido recusada(s) no checkout na última hora. Ver /diagnostico (eventos order_failure).`
    );
  }
  if (s.pedidosComErroDeEnvio.length > 0) {
    alertas.push(
      `${s.pedidosComErroDeEnvio.length} pedido(s) não chegaram ao PDV e continuam sendo reenviados: ${s.pedidosComErroDeEnvio.join(", ")}.`
    );
  }
  const esperando = s.pedidosEsperandoCaixa.filter((p) => p.minutos >= LIMITE_ESPERA_CAIXA_MIN);
  if (esperando.length > 0) {
    alertas.push(
      `${esperando.length} pedido(s) do totem esperando o caixa há mais de ${LIMITE_ESPERA_CAIXA_MIN} min: ` +
        esperando.map((p) => `${p.cliente} (${p.minutos} min)`).join(", ") +
        ". Ver a aba Totem no PDV."
    );
  }
  if (s.minutosDesdeEstoqueOk !== null && s.minutosDesdeEstoqueOk >= LIMITE_ESTOQUE_PARADO_MIN) {
    alertas.push(`Estoque e preço do CIGAM sem atualizar há ${s.minutosDesdeEstoqueOk} min no totem.`);
  }
  return alertas;
}

export async function levantarSituacao(
  totem: SupabaseClient,
  pdv: SupabaseClient,
  ultimoEstoqueOk: Date | null,
  agora = new Date()
): Promise<SituacaoDoTotem> {
  const umaHoraAtras = new Date(agora.getTime() - 60 * 60_000).toISOString();
  const { count: falhas } = await totem
    .from("app_events")
    .select("id", { count: "exact", head: true })
    .eq("event_name", "order_failure")
    .gte("created_at", umaHoraAtras);

  const { data: comErro } = await totem
    .from("orders")
    .select("order_number")
    .eq("pdv_sync_status", "ERROR")
    .is("paid_at", null)
    .limit(20);

  const { data: fila } = await pdv
    .from("pedidos_totem")
    .select("totem_order_number, customer_name, created_at")
    .order("created_at", { ascending: true })
    .limit(20);

  return {
    falhasDeCheckoutUltimaHora: falhas ?? 0,
    pedidosComErroDeEnvio: (comErro ?? []).map((o: any) => o.order_number),
    pedidosEsperandoCaixa: (fila ?? []).map((p: any) => ({
      numero: p.totem_order_number,
      cliente: p.customer_name,
      minutos: Math.floor((agora.getTime() - new Date(p.created_at).getTime()) / 60_000),
    })),
    minutosDesdeEstoqueOk: ultimoEstoqueOk ? Math.floor((agora.getTime() - ultimoEstoqueOk.getTime()) / 60_000) : null,
  };
}

async function enviarEmail(alertas: string[]): Promise<void> {
  const para = process.env.ALERTA_EMAIL_PARA;
  const apiKey = process.env.RESEND_API_KEY;
  if (!para || !apiKey) return;
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: process.env.ALERTA_EMAIL_DE ?? "Totem Gostinho Mineiro <onboarding@resend.dev>",
      to: para.split(",").map((e) => e.trim()).filter(Boolean),
      subject: `Totem: ${alertas.length} alerta(s)`,
      text: alertas.map((a) => `- ${a}`).join("\n"),
    }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) console.error(`[vigia] e-mail de alerta recusado: HTTP ${res.status}`);
}

let ultimoAviso = "";
let ultimoAvisoEm = 0;

export async function rodarVigia(totem: SupabaseClient, pdv: SupabaseClient, ultimoEstoqueOk: Date | null): Promise<void> {
  const alertas = montarAlertas(await levantarSituacao(totem, pdv, ultimoEstoqueOk));
  const chave = alertas.join("\n");
  const agora = Date.now();
  if (!alertas.length) {
    if (ultimoAviso) console.log("💚 [vigia] totem sem alertas.");
    ultimoAviso = "";
    return;
  }
  if (chave === ultimoAviso && agora - ultimoAvisoEm < 60 * 60_000) return;
  ultimoAviso = chave;
  ultimoAvisoEm = agora;

  console.error(`🚨 [vigia] ${alertas.length} alerta(s):\n   • ${alertas.join("\n   • ")}`);
  await totem.from("app_events").insert({
    event_name: "health_alert",
    severity: "error",
    message: alertas.join(" | ").slice(0, 1000),
    payload: { alertas },
  });
  await enviarEmail(alertas).catch((err) => console.error("[vigia] falha ao mandar e-mail:", err instanceof Error ? err.message : err));
}
