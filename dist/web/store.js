// A small store for the web panel: one state object, replaced on each change, and listeners.
// Kept free of the DOM and of Preact, so the panel's logic (src/web/app.ts) runs in Node tests.
export class Store {
    #state;
    #listeners = new Set();
    constructor(initial) {
        this.#state = initial;
    }
    get state() {
        return this.#state;
    }
    /** Merges `part` (or what `fn` returns) into the state and tells every listener once. */
    set(part) {
        const next = typeof part === 'function' ? part(this.#state) : part;
        this.#state = { ...this.#state, ...next };
        for (const listener of [...this.#listeners])
            listener();
    }
    subscribe(listener) {
        this.#listeners.add(listener);
        return () => this.#listeners.delete(listener);
    }
}
