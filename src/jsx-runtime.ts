import Gtk from "gi://Gtk"
import GObject from "gi://GObject"

const dummyBuilder = new Gtk.Builder()
const typeAttr = Symbol("type attribute")

type SignalHandler<Self> = {
    [Key in `on-${string}`]: (self: Self, ...args: unknown[]) => unknown
}

type Setup<Self> = {
    $$(self: Self): void
    $type: string | null
    // $id: string
}

type Element = GObject.Object & { [typeAttr]?: string }

type JsxProps = {
    children: Array<Element> | Element
}

function isGObject<T extends GObject.Object>(ctor: any): ctor is { new(props: any): T } {
    return ctor.prototype instanceof GObject.Object
}

export function jsx<T extends GObject.Object>(
    ctor: (new (props: any) => T) | ((props: any) => T),
    { $$, $type = null, children = [], ...props }: Partial<JsxProps> & SignalHandler<T> & Partial<Setup<T>> & Record<string, unknown>,
): T {
    children = Array.isArray(children) ? children : [children]

    const signals: Array<[string, (...props: unknown[]) => unknown]> = []

    for (const [key, handler] of Object.entries(props)) {
        if (key.startsWith("on-")) {
            signals.push([key.slice(3), handler as () => unknown])
            delete props[key]
        }
    }

    let object: T

    if (isGObject<T>(ctor)) {
        object = Object.assign(new ctor(props), { [typeAttr]: $type ?? null })

        for (const child of children.flat(Infinity)) {
            if ("addChild" in object && typeof object.addChild === "function") {
                object.addChild(child, child[typeAttr])
            } else if (object instanceof Gtk.Buildable) {
                object.vfunc_add_child(dummyBuilder, child, child[typeAttr])
            }
        }
    } else {
        if (children.length === 1) {
            props.child = children
        } else {
            props.children = children
        }

        object = Object.assign(ctor(props), { [typeAttr]: $type ?? null })
    }

    $$?.(object)
    return object
}

export function Fragment({ children = [], child }: {
    child?: GObject.Object
    children?: Array<GObject.Object>
}) {
    if (child) children.push(child)
    return children.flat(Infinity)
}

declare global {
    // eslint-disable-next-line @typescript-eslint/no-namespace
    namespace JSX {
        type ElementType =
            | ((props: any) => Element)
            | (new (props: any) => ElementClass)

        type Element = GObject.Object
        type ElementClass = GObject.Object

        type LibraryManagedAttributes<C extends typeof GObject.Object, P> =
            P & SignalHandler<InstanceType<C>> & Partial<Setup<InstanceType<C>>>
    }
}

export const jsxs = jsx

export function cast<T extends Gtk.Widget>(object: GObject.Object): T {
    return object as T
}
