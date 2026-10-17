// Junta mensagens em rajada: espera um tempo de silêncio por conversa antes de responder, e
// garante que uma conversa nunca é processada por dois turnos ao mesmo tempo.

export type BatcherOptions<T> = {
  /** Silêncio (ms) sem mensagens novas antes de processar. */
  quietMs: number;
  /** Espera máxima (ms) desde a primeira mensagem do lote, mesmo que o cliente continue escrevendo. */
  maxWaitMs: number;
  onFlush: (key: string, items: T[]) => Promise<void>;
  onError?: (key: string, error: unknown) => void;
};

type Slot<T> = {
  items: T[];
  firstAt: number;
  timer: ReturnType<typeof setTimeout> | null;
  running: boolean;
};

export function createBatcher<T>(options: BatcherOptions<T>) {
  const slots = new Map<string, Slot<T>>();

  const run = async (key: string, slot: Slot<T>) => {
    slot.timer = null;
    if (slot.running || slot.items.length === 0) return;

    const items = slot.items;
    slot.items = [];
    slot.running = true;
    try {
      await options.onFlush(key, items);
    } catch (error) {
      options.onError?.(key, error);
    } finally {
      slot.running = false;
      if (slot.items.length > 0) {
        // Chegou mensagem enquanto respondíamos: novo lote depois de um novo silêncio.
        schedule(key, slot);
      } else {
        slots.delete(key);
      }
    }
  };

  const schedule = (key: string, slot: Slot<T>) => {
    if (slot.timer) clearTimeout(slot.timer);
    const waited = Date.now() - slot.firstAt;
    const delay = Math.max(0, Math.min(options.quietMs, options.maxWaitMs - waited));
    slot.timer = setTimeout(() => void run(key, slot), delay);
  };

  return {
    push(key: string, item: T) {
      let slot = slots.get(key);
      if (!slot) {
        slot = { items: [], firstAt: Date.now(), timer: null, running: false };
        slots.set(key, slot);
      }
      if (slot.items.length === 0) slot.firstAt = Date.now();
      slot.items.push(item);
      if (!slot.running) schedule(key, slot);
    },
    /** Processa tudo que estiver pendente agora (desligamento gracioso). */
    async flushAll() {
      await Promise.all([...slots.entries()].map(([key, slot]) => {
        if (slot.timer) clearTimeout(slot.timer);
        return run(key, slot);
      }));
    },
    pending() {
      return [...slots.values()].reduce((sum, slot) => sum + slot.items.length, 0);
    },
  };
}
