/**
 * Recursively readonly view used by the application state store.
 * Functions remain callable and collection containers expose readonly APIs.
 */
export type DeepImmutable<Value> =
  Value extends (...args: never[]) => unknown
    ? Value
    : Value extends ReadonlyMap<infer Key, infer Item>
      ? ReadonlyMap<DeepImmutable<Key>, DeepImmutable<Item>>
      : Value extends ReadonlySet<infer Item>
        ? ReadonlySet<DeepImmutable<Item>>
        : Value extends readonly (infer Item)[]
          ? readonly DeepImmutable<Item>[]
          : Value extends object
            ? { readonly [Key in keyof Value]: DeepImmutable<Value[Key]> }
            : Value

type Permutation<Union, Candidate = Union> = [Union] extends [never]
  ? []
  : Candidate extends Candidate
    ? [Candidate, ...Permutation<Exclude<Union, Candidate>>]
    : never

/** Tuple union containing every member of a finite union exactly once. */
export type Permutations<Union> = Permutation<Union>
