/**
 * Laço de sincronização totem↔PDV — roda em loop, chamando
 * pushPendingOrders e reconcilePaidOrders a cada PDV_SYNC_INTERVAL_MS.
 * Pensado para rodar como processo pm2 de longa duração
 * (totem-pdv-sync), substitui automation/cigam-sync-service.ts
 * (totem-loja-cigam): o totem não fala mais direto com o CIGAM, quem
 * faz isso agora é o PDV.
 */
import "dotenv/config";

import { createClient } from "@supabase/supabase-js";
import { pushPendingOrders } from "./push-to-pdv";
import { reconcilePaidOrders } from "./pull-from-pdv";

const INTERVAL_MS = Number(process.env.PDV_SYNC_INTERVAL_MS ?? 60000);

const totemSupabase = createClient(process.env.VITE_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const pdvSupabase = createClient(process.env.PDV_SUPABASE_URL!, process.env.PDV_SUPABASE_SERVICE_ROLE_KEY!);

async function ciclo() {
  try {
    const push = await pushPendingOrders(totemSupabase, pdvSupabase);
    const pull = await reconcilePaidOrders(totemSupabase, pdvSupabase);
    if (push.enviados || push.erros || pull.fechados || pull.erros) {
      console.log(
        `[pdv-sync] enviados=${push.enviados} erros_envio=${push.erros} fechados=${pull.fechados} erros_fechamento=${pull.erros}`
      );
    }
  } catch (err) {
    console.error("[pdv-sync] falha no ciclo:", err);
  }
}

console.log(`🧩 sync totem↔PDV rodando — intervalo de ${INTERVAL_MS}ms`);
ciclo();
setInterval(ciclo, INTERVAL_MS);
