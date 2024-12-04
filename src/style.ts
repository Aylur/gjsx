import Gtk from "gi://Gtk?version=4.0"
import Gdk from "gi://Gdk?version=4.0"

const stylesheets: string[] = []

export function apply() {
    const provider = new Gtk.CssProvider()

    try {
        provider.load_from_string(stylesheets.join(" "))
    } catch (err) {
        logError(err)
    }

    const display = Gdk.Display.get_default()
    if (!display) {
        throw Error("Could not get default Gdk.Display")
    }

    Gtk.StyleContext.add_provider_for_display(
        display, provider, Gtk.STYLE_PROVIDER_PRIORITY_USER)

    return () => {
        Gtk.StyleContext.remove_provider_for_display(display, provider)
    }
}

export function css(css: TemplateStringsArray, ...values: any[]): void
export function css(css: string): void
export function css(css: TemplateStringsArray | string, ...values: any[]) {
    const style = typeof css === "string"
        ? css
        : css
            .flatMap((str, i) => str + `${values[i] ?? ""}`)
            .join("")

    stylesheets.push(style)
}
