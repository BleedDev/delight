/**
 * The blog's cover art, bundled into Evi for the release notes' pictures: no network, nothing for
 * Discord's content policy to block. Copies of the website's covers live in ./covers; add one there
 * when a release first uses it.
 */
import v031 from "./covers/0.3.1.svg" with { type: "text" };
import v032 from "./covers/0.3.2.svg" with { type: "text" };
import v040 from "./covers/0.4.0.svg" with { type: "text" };
import v100 from "./covers/1.0.0.svg" with { type: "text" };
import hello from "./covers/hello.svg" with { type: "text" };
import store from "./covers/store.svg" with { type: "text" };

export const COVERS: Record<string, string> = { hello, store, "0.3.1": v031, "0.3.2": v032, "0.4.0": v040, "1.0.0": v100 };

/** A cover as an image URL, or undefined for a name Evi doesn't bundle */
export function coverUrl(name: string | undefined) {
    const svg = name && COVERS[name];
    return svg ? `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}` : undefined;
}
