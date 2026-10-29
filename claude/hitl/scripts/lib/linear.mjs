// Back-compat entry point (pre-v4): the tickets mirror is provider-neutral now (tickets.mjs + providers.mjs).
// Linear stays the default provider, so every old import keeps its meaning.
export * from "./tickets.mjs";
