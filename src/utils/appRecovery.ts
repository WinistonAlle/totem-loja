// src/utils/appRecovery.ts
//
// O totem fica com a mesma aba aberta por dias. Quando o app é rebuildado, os
// chunks ganham hash novo e os antigos somem do dist — mas o service worker e a
// aba velha continuam apontando pros nomes antigos. Pior: o preview responde
// SPA fallback (index.html, HTTP 200) pra qualquer /assets/* inexistente, então
// o import() dinâmico tenta interpretar HTML como JS e estoura.
//
// Sintoma na loja: tudo funciona até o cliente tocar em "Finalizar" — a rota
// /checkout é lazy e costuma ser a primeira que precisa baixar um chunk que a
// aba ainda não tinha — e a tela cai no AppErrorBoundary ("O totem precisou ser
// reiniciado").
//
// Aqui fica a recuperação: detectar esse tipo de erro, jogar fora service
// worker e caches, e recarregar uma vez pra aba voltar com o build atual.

const LAST_RECOVERY_KEY = "totem:last_chunk_recovery";

/** Janela mínima entre duas recuperações, pra nunca virar loop de reload. */
const RECOVERY_COOLDOWN_MS = 60_000;

export function isChunkLoadError(error: unknown): boolean {
  const message = String((error as any)?.message ?? error ?? "");
  const name = String((error as any)?.name ?? "");

  return (
    name === "ChunkLoadError" ||
    /failed to fetch dynamically imported module/i.test(message) ||
    /error loading dynamically imported module/i.test(message) ||
    /importing a module script failed/i.test(message) ||
    /dynamically imported module/i.test(message) ||
    // HTML servido no lugar do JS (SPA fallback pro chunk que não existe mais)
    /unexpected token/i.test(message)
  );
}

function canRecoverNow(): boolean {
  try {
    const raw = window.sessionStorage.getItem(LAST_RECOVERY_KEY);
    if (!raw) return true;
    const last = Number(raw);
    if (!Number.isFinite(last)) return true;
    return Date.now() - last > RECOVERY_COOLDOWN_MS;
  } catch {
    // Sem sessionStorage não dá pra garantir o anti-loop: melhor não recarregar.
    return false;
  }
}

function markRecovery() {
  try {
    window.sessionStorage.setItem(LAST_RECOVERY_KEY, String(Date.now()));
  } catch {}
}

/** Remove service worker e caches do workbox — o que prende a aba no build velho. */
export async function purgeAppCaches(): Promise<void> {
  try {
    if ("serviceWorker" in navigator) {
      const registrations = await navigator.serviceWorker.getRegistrations();
      await Promise.all(registrations.map((registration) => registration.unregister().catch(() => false)));
    }
  } catch {}

  try {
    if ("caches" in window) {
      const keys = await caches.keys();
      await Promise.all(keys.map((key) => caches.delete(key).catch(() => false)));
    }
  } catch {}
}

/**
 * Limpa tudo e recarrega a rota atual. Não mexe em localStorage: o carrinho e o
 * nome do cliente precisam sobreviver ao reload, senão o cliente perde o pedido
 * montado no meio do caminho.
 */
export async function recoverFromStaleBuild(): Promise<boolean> {
  if (!canRecoverNow()) return false;

  markRecovery();
  await purgeAppCaches();
  window.location.reload();

  // Segura o fluxo até o reload acontecer, pra não renderizar tela de erro à toa.
  await new Promise(() => {});
  return true;
}
