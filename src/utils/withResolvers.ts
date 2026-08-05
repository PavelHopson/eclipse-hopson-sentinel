/**
 * Polyfill for Promise.withResolvers() (ES2024, Node 22+).
 * package.json declares Node 20 support, so we cannot use the native one.
 */
export type PromiseResolvers<T> = {
  promise: Promise<T>
  resolve: (value: T | PromiseLike<T>) => void
  reject: (reason?: unknown) => void
}

export function withResolvers<T>(): PromiseResolvers<T> {
  let resolve!: (value: T | PromiseLike<T>) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}
