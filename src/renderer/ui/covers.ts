/**
 * The blog's cover art, bundled into Evi for the release notes' pictures: no network, nothing for
 * Discord's content policy to block. Add a cover here when a release first uses it.
 */
import hello from "../../../site/public/blog/covers/hello.svg" with { type: "text" };
import store from "../../../site/public/blog/covers/store.svg" with { type: "text" };

export const COVERS: Record<string, string> = { hello, store };

/** A cover as an image URL, or undefined for a name Evi doesn't bundle */
export function coverUrl(name: string | undefined) {
    const svg = name && COVERS[name];
    return svg ? `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}` : undefined;
}
