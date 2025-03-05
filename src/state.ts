import GObject from "gi://GObject"
import Gio from "gi://Gio"

const _value = Symbol("state value")
const _transformFn = Symbol("binding transformFn")
const _emitter = Symbol("binding emitter")
const _prop = Symbol("binding prop")

const kebabify = (str: string) => str
    .replace(/([a-z])([A-Z])/g, "$1-$2")
    .replaceAll("_", "-")
    .toLowerCase()

class StateObject<T extends object> extends GObject.Object {
    static {
        GObject.registerClass({
            Properties: {
                value: GObject.ParamSpec.jsobject("value", "", "", GObject.ParamFlags.READWRITE),
            },
        }, this)
    }

    declare value: T

    constructor(value: T) {
        super()
        this.value = value
    }
}

// TODO: consider Proxying objects to make them deeply reactive

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class State<T> extends Function {
    private [_value]: StateObject<{ $: T }>

    constructor(init: T) {
        super()
        this[_value] = new StateObject({ $: init })
        return new Proxy(this, {
            apply: (target, _, args) => target._call(args[0]),
        })
    }

    private _call(): Binding<T>

    private _call<R = T>(transform: (value: T) => R): Binding<R>

    private _call(transform?: (value: T) => unknown) {
        const b = Binding.bind(this[_value], "value")
        return transform ? b.as(({ $ }) => transform($)) : b.as(({ $ }) => $)
    }

    /**
     * @returns The current value.
     */
    get() { return this.value }

    /**
     * Set the current value.
     * *NOTE*: value is checked by reference.
     * @returns The current value.
     */
    set(value: T) { return this.value = value }

    /**
     * The current value.
     */
    get value(): T {
        return this[_value].value.$
    }

    set value(v: T) {
        if (v !== this[_value].value.$) {
            this[_value].value = { $: v }
        }
    }

    /**
     * Subscribe for value changes.
     * @param callback The function to run when the current value changes.
     * @returns Unsubscribe function.
     */
    subscribe(callback: (value: T) => void): () => void

    /**
     * Subscribe for value changes.
     * @param object An object to limit the lifetime of the subscription to.
     * @param callback The function to run when the current value changes.
     * @returns Unsubscribe function.
     */
    subscribe(object: GObject.Object, callback: (value: T) => void): () => void

    subscribe(
        objOrCallback: GObject.Object | ((value: T) => void),
        callback?: (value: T) => void,
    ) {
        if (typeof objOrCallback === "function") {
            const id = this[_value].connect("notify::value", ({ value }) => objOrCallback(value.$))
            return () => this[_value].disconnect(id)
        }

        if (objOrCallback instanceof GObject.Object && typeof callback === "function") {
            return hook(
                objOrCallback,
                this[_value],
                "notify::value",
                ({ value }: StateObject<{ $: T }>) => callback(value.$),
            )
        }
    }

    toString(): string {
        return `State<${typeof this.get()}>`
    }

    [Symbol.toPrimitive]() {
        console.warn("State implicitly converted to a primitive value.")
        return this.toString()
    }
}

export interface State<T> {
    <R>(transform: (value: T) => R): Binding<R>
    (): Binding<T>
}

export class Binding<T> {
    private [_transformFn] = (v: any) => v
    private [_emitter]: GObject.Object
    private [_prop]: string

    private constructor(emitter: GObject.Object, prop: string) {
        this[_emitter] = emitter
        this[_prop] = kebabify(prop)
    }

    /**
     * Create a `Binding` on a `State`.
     * @param object The `State` to create the `Binding` on.
     */
    static bind<T>(object: State<T>): Binding<T>

    /**
     * Create a `Binding` on a `GObject.Object`'s `property`.
     * @param object The `GObject.Object` to create the `Binding` on.
     */
    static bind<
        T extends GObject.Object,
        P extends keyof T,
    >(object: T, property: Extract<P, string>): Binding<T[P]>

    /**
     * Create a `Binding` on a `Gio.Settings`'s `key`.
     * @param object The `Gio.Settings` to create the `Binding` on.
     */
    static bind<T>(object: Gio.Settings, key: string): Binding<T>

    static bind<T>(object: GObject.Object | State<T>, property?: string): Binding<T> {
        return object instanceof State ? object() : new Binding(object, property!)
    }

    /**
     * Create a new `Binding` that applies a transformation on its value.
     * @param transform The transformation to apply. Should be a pure function.
     */
    as<U>(transform: (v: T) => U): Binding<U> {
        const bind = new Binding(this[_emitter], this[_prop])
        bind[_transformFn] = (v: T) => transform(this[_transformFn](v))
        return bind as unknown as Binding<U>
    }

    /**
     * @returns The current value.
     */
    get(): T {
        const fn = this[_transformFn]
        const obj = this[_emitter]
        const prop = this[_prop] as keyof typeof obj

        if (obj instanceof Gio.Settings) {
            return fn(obj.get_value(prop).deepUnpack())
        }

        const getter = `get_${prop.replaceAll("-", "_")}` as keyof typeof obj

        if (Object.hasOwn(obj, getter) && typeof obj[getter] === "function") {
            return fn((obj[getter] as () => unknown)())
        }

        return fn(obj[prop])
    }

    /**
     * Subscribe for value changes.
     * @param callback The function to run when the current value changes.
     * @returns Unsubscribe function.
     */
    subscribe(callback: (value: T) => void): () => void

    /**
     * Subscribe for value changes.
     * @param object An object to limit the lifetime of the subscription to.
     * @param callback The function to run when the current value changes.
     * @returns Unsubscribe function.
     */
    subscribe(object: GObject.Object, callback: (value: T) => void): () => void

    subscribe(
        objOrCallback: GObject.Object | ((value: T) => void),
        callback?: (value: T) => void,
    ) {
        const emitter = this[_emitter]

        const sig = emitter instanceof Gio.Settings ? "changed" : "notify"

        if (typeof objOrCallback === "function") {
            const id = this[_emitter].connect(
                `${sig}::${kebabify(this[_prop])}`,
                () => objOrCallback(this.get()),
            )
            return () => this[_emitter].disconnect(id)
        }

        if (objOrCallback instanceof GObject.Object && typeof callback === "function") {
            return hook(
                objOrCallback,
                this[_emitter],
                `${sig}::${kebabify(this[_prop])}`,
                () => callback(this.get()),
            )
        }
    }

    toString(): string {
        return `Binding<${typeof this.get()}>`
    }

    [Symbol.toPrimitive]() {
        console.warn("Binding implicitly converted to a primitive value.")
        return this.toString()
    }
}

export const { bind } = Binding

function set(obj: object, prop: string, value: any) {
    const setter = `set_${prop}` as keyof typeof obj
    if (setter in obj && typeof obj[setter] === "function") {
        (obj[setter] as (v: any) => void)(value)
    } else {
        Object.assign(obj, { [prop]: value })
    }
}

/**
 * Create a synchronization between a `GObject.Object` and a `Binding`.
 * This is equivalent to `GObject.Object.bind_property_full`.
 * @param object Target object.
 * @param property - Target property.
 * @param binding - The Binding the object will subscribe to.
 * @returns The disconnect function.
 */
export function sync<
    O extends GObject.Object,
    P extends keyof O,
>(
    object: O,
    property: Extract<P, string>,
    binding: Binding<O[P]>,
): () => void {
    set(object, kebabify(property), binding.get())
    return binding.subscribe(object, value => set(object, kebabify(property), value))
}

/**
 * Create a derived `State` from a list of `Binding`s.
 * @param deps List of `Bindings`.
 * @param transform An optional transform function.
 * @returns The derived `State`.
 */
export function derive<
    const Deps extends Array<Binding<any>>,
    Args extends {
        [K in keyof Deps]: Deps[K] extends Binding<infer T> ? T : never
    },
    V = Args,
>(deps: Deps, transform: (...args: Args) => V = (...args) => args as unknown as V) {
    const get = () => transform(...deps.map(d => d.get()) as Args)
    const state = new State(get())

    for (const dep of deps) {
        sync(state[_value], "value", dep.as(() => ({ $: get() })))
    }

    return state
}

/**
 * Create a `State` which observes a list of `GObject.Object` signals.
 * @param init The initial value of the `State`
 * @param signals A list of `GObject.Object`, signal name and callback pairs to observe.
 * @returns The observing `State`.
 */
export function observe<T>(
    init: T,
    ...signals: Array<[GObject.Object, string, /** Parameters are coming from the signal. @returns new value */ (...args: Array<any>) => T]>
) {
    const state = new State(init)
    for (const [obj, sig, callback] of signals) {
        hook(
            state[_value],
            obj,
            sig,
            (_, ...args) => state.set(callback(...args)),
        )
    }
    return state
}


/**
 * Connect to a signal and limit the connections lifetime to an object.
 * @param lifetime The object to limit the lifetime of the connection to.
 * @param object Object to connect to.
 * @param signal Signal name.
 * @param callback The callback to execute on the signal.
 * @returns The disconnect function.
 */
export function hook<T extends GObject.Object>(
    lifetime: GObject.Object,
    object: T,
    signal: string,
    callback: (emitter: T, ...args: unknown[]) => unknown,
): () => void {
    // @ts-expect-error missing types
    const id: number = object.connect_object(
        signal,
        callback,
        lifetime,
        GObject.ConnectFlags.DEFAULT,
    )

    return () => object.disconnect(id)
}
