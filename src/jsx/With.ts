import Fragment from "./Fragment.js"
import { Binding } from "../state.js"

interface WithProps<T> {
    value: Binding<T>
    children: (value: T) => JSX.Element | "" | false | null | undefined
    cleanup?: (element: JSX.Element) => void
}

export default function With<T>({
    value,
    children: mkChild,
    cleanup,
}: WithProps<T>): Fragment<JSX.Element> {
    const fragment = new Fragment<JSX.Element>()

    function callback(v: T) {
        for (const child of fragment.children) {
            fragment.removeChild(child)

            if (typeof cleanup === "function") {
                cleanup(child)
            } else if (typeof cleanup === "string") {
                const ch = child as any
                if (typeof ch[cleanup] === "function") {
                    ch[cleanup]()
                } else {
                    console.warn(`cleanup "${cleanup}" function is undefined on ${child}`)
                }
            }
        }

        const ch = mkChild(v)
        if (ch !== "" && ch !== false && ch !== null && ch !== undefined) {
            fragment.addChild(ch)
        }
    }

    value.subscribe(fragment, callback)
    callback(value.get())

    return fragment
}
