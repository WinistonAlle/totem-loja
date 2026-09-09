// src/utils/lazyRoute.ts
import { lazy, type ComponentType } from "react";
import { isChunkLoadError, recoverFromStaleBuild } from "@/utils/appRecovery";

type Loader<T extends ComponentType<any>> = () => Promise<{ default: T }>;

/**
 * React.lazy com uma segunda chance. Se o chunk da rota não vier (aba velha
 * pedindo um hash que não existe mais no dist), limpa service worker/caches e
 * recarrega em vez de estourar direto no AppErrorBoundary. Só cai na tela de
 * erro se a recuperação já tiver sido tentada há pouco — aí o problema é outro.
 */
export function lazyRoute<T extends ComponentType<any>>(loader: Loader<T>) {
  return lazy(async () => {
    try {
      return await loader();
    } catch (error) {
      if (!isChunkLoadError(error)) throw error;

      const recovering = await recoverFromStaleBuild();
      if (recovering) {
        // recoverFromStaleBuild não resolve: a página recarrega antes disso.
        return await loader();
      }

      throw error;
    }
  });
}
