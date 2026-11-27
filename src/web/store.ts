// A small store for the web panel: one state object, replaced on each change, and listeners.
// Kept free of the DOM and of Preact, so the panel's logic (src/web/app.ts) runs in Node tests.

export type Listener = () => void

export class Store<T extends object> {
  #state: T
  #listeners = new Set<Listener>()

  constructor(initial: T) {
    this.#state = initial
  }

  get state(): T {
    return this.#state
  }

  /** Merges `part` (or what `fn` returns) into the state and tells every listener once. */
  set(part: Partial<T> | ((state: T) => Partial<T>)): void {
    const next = typeof part === 'function' ? part(this.#state) : part
    this.#state = { ...this.#state, ...next }
    for (const listener of [...this.#listeners]) listener()
  }

  subscribe(listener: Listener): () => void {
    this.#listeners.add(listener)
    return () => this.#listeners.delete(listener)
  }
}
