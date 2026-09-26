const SYM_LAZY_GET = Symbol("delight.lazyGet");

/**
 * A stand-in for a value that doesn't exist yet. The getter runs on first use and its result is
 * cached once it succeeds. `knownKeys` lets code that copies properties early (like CommonJS
 * interop helpers) see the keys before the value has resolved.
 */
export function lazy<T>(getter: () => T, knownKeys: readonly string[] = []): T {
    let cached: any;
    const resolve = () => cached ??= getter();

    // An arrow function target: callable, constructable via the trap, and no non-configurable keys
    const target = (() => { }) as any;

    return new Proxy(target, {
        get(_, key) {
            if (key === SYM_LAZY_GET) return resolve;
            const value = resolve();
            return Reflect.get(value, key, value);
        },
        set: (_, key, value) => Reflect.set(resolve(), key, value),
        has: (_, key) => Reflect.has(resolve(), key),
        apply: (_, thisArg, args) => Reflect.apply(resolve(), thisArg, args),
        construct: (_, args, newTarget) => Reflect.construct(resolve(), args, newTarget === target ? resolve() : newTarget),
        ownKeys() {
            try {
                return Reflect.ownKeys(resolve());
            } catch {
                return [...knownKeys];
            }
        },
        getOwnPropertyDescriptor(_, key) {
            let value;
            try {
                value = resolve();
            } catch {
                return knownKeys.includes(key as string)
                    ? { configurable: true, enumerable: true, get: () => Reflect.get(resolve(), key) }
                    : undefined;
            }
            const desc = Reflect.getOwnPropertyDescriptor(value, key);
            // Proxy invariants: a key can't be reported non-configurable unless the target has it that way
            if (desc) desc.configurable = true;
            return desc;
        },
        getPrototypeOf: () => Reflect.getPrototypeOf(resolve()),
    }) as T;
}

/** Forces a lazy value to resolve, returning the real object */
export function unlazy<T>(value: T): T {
    return (value as any)?.[SYM_LAZY_GET]?.() ?? value;
}
