import GObject from "gi://GObject"

export { GObject as default }
export { GObj as Object }

type GObj = GObject.Object
const GObj = GObject.Object
const meta = Symbol("meta")
const priv = Symbol("priv")

const { ParamSpec, ParamFlags } = GObject

function kebabify(str: string) {
    return str
        .replace(/([a-z])([A-Z])/g, "$1-$2")
        .replaceAll("_", "-")
        .toLowerCase()
}

type SignalDeclaration = {
    flags?: GObject.SignalFlags
    accumulator?: GObject.AccumulatorType
    return_type?: GObject.GType
    param_types?: Array<GObject.GType>
}

type PropertyDeclaration =
    | ((name: string, flags: GObject.ParamFlags) => GObject.ParamSpec)
    | InstanceType<typeof GObject.ParamSpec>
    | { $gtype: GObject.GType }

type GObjectConstructor = {
    [meta]?: {
        Properties?: { [key: string]: GObject.ParamSpec }
        Signals?: { [key: string]: GObject.SignalDefinition }
    }
    new (...args: any[]): any
}

type MetaInfo = GObject.MetaInfo<never, Array<{ $gtype: GObject.GType }>, never>

export function register(options: MetaInfo = {}) {
    return function (cls: GObjectConstructor) {
        const t = options.Template
        if (typeof t === "string" && !t.startsWith("resource://") && !t.startsWith("file://")) {
            options.Template = new TextEncoder().encode(t)
        }

        GObject.registerClass(
            {
                Signals: { ...cls[meta]?.Signals },
                Properties: { ...cls[meta]?.Properties },
                ...options,
            },
            cls,
        )

        delete cls[meta]
    }
}

export function property(declaration: PropertyDeclaration = Object) {
    return function (target: any, prop: any, desc?: PropertyDescriptor) {
        target.constructor[meta] ??= {}
        target.constructor[meta].Properties ??= {}

        const name = kebabify(prop)

        if (!desc) {
            const spec = pspec(name, ParamFlags.READWRITE, declaration)
            target.constructor[meta].Properties[name] = spec

            Object.defineProperty(target, `set_${name.replace("-", "_")}`, {
                value(v: any) {
                    this[prop] = v
                },
            })

            Object.defineProperty(target, `get_${name.replace("-", "_")}`, {
                value() {
                    return this[prop]
                },
            })

            const desc: PropertyDescriptor & ThisType<any> = {
                get() {
                    return this[priv]?.[prop] ?? spec.get_default_value()
                },
                set(v) {
                    if (v !== this[prop]) {
                        this[priv] ??= {}
                        this[priv][prop] = v
                        this.notify(name)
                    }
                },
            }

            return desc as any
        } else {
            let flags = 0
            if (desc.get) flags |= ParamFlags.READABLE
            if (desc.set) flags |= ParamFlags.WRITABLE

            const spec = pspec(name, flags, declaration)
            target.constructor[meta].Properties[name] = spec
        }
    }
}

export function signal(
    ...params: Array<{ $gtype: GObject.GType } | GObject.GType>
): (target: any, signal: any, desc?: PropertyDescriptor) => void

export function signal(
    declaration?: SignalDeclaration,
): (target: any, signal: any, desc?: PropertyDescriptor) => void

export function signal(
    declaration?: SignalDeclaration | { $gtype: GObject.GType } | GObject.GType,
    ...params: Array<{ $gtype: GObject.GType } | GObject.GType>
) {
    return function (target: any, signal: any, desc?: PropertyDescriptor) {
        target.constructor[meta] ??= {}
        target.constructor[meta].Signals ??= {}

        const name = kebabify(signal)

        const isDeclaration =
            declaration &&
            ("return_type" in declaration ||
                "param_types" in declaration ||
                "accumulator" in declaration ||
                "flags" in declaration)

        if (isDeclaration) {
            target.constructor[meta].Signals[name] = declaration
        } else {
            target.constructor[meta].Signals[name] = {
                param_types: declaration ? [declaration, ...params] : [],
            }
        }

        if (!desc) {
            const desc: PropertyDescriptor & ThisType<GObject.Object> = {
                value: function (...args: any[]) {
                    return this.emit(name, ...args)
                },
            }
            return desc as any
        } else {
            const og: (...args: unknown[]) => unknown = desc.value
            desc.value = function (...args: unknown[]) {
                const ret = og.apply(this, args)
                // @ts-expect-error not typed
                this.emit(name, ...args)
                return ret
            }
        }
    }
}

function pspec(name: string, flags: GObject.ParamFlags, declaration: PropertyDeclaration) {
    if (declaration instanceof ParamSpec) return declaration

    if (declaration === Object || declaration === Function || declaration === Array) {
        return ParamSpec.jsobject(name, "", "", flags)
    }

    if (declaration === String) {
        return ParamSpec.string(name, "", "", flags, "")
    }

    if (declaration === Number) {
        return ParamSpec.double(name, "", "", flags, -Number.MAX_VALUE, Number.MAX_VALUE, 0)
    }

    if (declaration === Boolean) {
        return ParamSpec.boolean(name, "", "", flags, false)
    }

    if ("$gtype" in declaration) {
        return ParamSpec.object(name, "", "", flags as any, declaration.$gtype)
    }

    if (typeof declaration === "function") {
        return declaration(name, flags)
    }

    throw Error("invalid PropertyDeclaration")
}

declare global {
    interface FunctionConstructor {
        $gtype: GObject.GType<object>
    }

    interface ArrayConstructor {
        $gtype: GObject.GType<object>
    }
}

Function.$gtype = Object.$gtype
Array.$gtype = Object.$gtype
