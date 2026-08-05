/**
 * Identifies the runtime path that initiated a model request.
 *
 * Sources include fixed runtime names, plugin-defined names, and namespaced
 * agent identifiers, so the protocol intentionally accepts any non-empty
 * string at runtime. Call sites own validation of user-controlled values.
 */
export type QuerySource = string
