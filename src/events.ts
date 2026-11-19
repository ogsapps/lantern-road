/** Tiny typed event emitter. */
export class Emitter<E extends Record<string, unknown>> {
  private handlers = new Map<keyof E, Set<(payload: never) => void>>();
  /** While true, nothing is emitted (used for offline catch-up). */
  muted = false;

  on<K extends keyof E>(name: K, fn: (payload: E[K]) => void): () => void {
    let set = this.handlers.get(name);
    if (!set) this.handlers.set(name, (set = new Set()));
    set.add(fn as (payload: never) => void);
    return () => set.delete(fn as (payload: never) => void);
  }

  emit<K extends keyof E>(name: K, payload: E[K]): void {
    if (this.muted) return;
    this.handlers.get(name)?.forEach((fn) => (fn as (p: E[K]) => void)(payload));
  }
}
