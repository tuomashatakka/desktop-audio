/**
 * Types for `disposable-events`.
 *
 * The package ships a `types.d.ts` that declares ambient modules under bare
 * names (`declare module "Disposable"`), so TypeScript resolves the package
 * to a file that is not a module. This declares the real surface instead —
 * mirroring `src/index.ts` in the published package.
 */
declare module 'disposable-events' {

  /** A resource plus the action that releases it. Disposal runs at most once. */
  export class Disposable {
    disposed:       boolean
    disposalAction: CallableFunction | null

    constructor (disposalAction: CallableFunction)

    static isDisposable (object: unknown): boolean

    dispose (): void
  }

  /** Group several disposables so one `dispose()` releases all of them. */
  export class DisposableCollection {
    disposables: Disposable[]
    disposed:    boolean

    constructor (...disposables: Disposable[])

    add (...disposables: Disposable[]): void

    remove (...disposables: Disposable[]): void

    /** Empties the collection *without* firing the disposal actions. */
    clear (): void

    dispose (): void
  }

  interface DisposableEventOptions {
    type:    string
    handler: EventListener
    target?: EventTarget | null
  }

  /**
   * Binds a DOM listener on construction and removes it on disposal, so a
   * subscription and its teardown are declared in one place.
   */
  export class DisposableEvent extends Disposable {
    handler: EventListener | null
    target:  EventTarget | null
    type:    string

    constructor (options: DisposableEventOptions)
  }

  export function isDisposable (object: unknown): boolean
}
