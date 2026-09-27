/**
 * Main-process side of Inline Translate. Discord's page can't reach translate.googleapis.com:
 * its Content-Security-Policy only allows connections to Discord's own hosts (and Evi doesn't
 * loosen it), so the request is made here with Electron's net module and only the result goes back.
 */
import type { NativePlugin } from "@evi/api/native";
import { net } from "electron";

import { chunkText, normalizeLanguage, parseGoogleResponse, translateUrl } from "./translate";
import type { Translation } from "./translate";

/** Discord's longest message is 4000 characters; anything much longer isn't a message */
const MAX_INPUT = 12_000;
const TIMEOUT = 15_000;

async function request(text: string, target: string): Promise<Translation> {
    const res = await net.fetch(translateUrl(text, target), {
        signal: AbortSignal.timeout(TIMEOUT),
        headers: { Accept: "application/json" },
    });
    // The status goes in the message: the renderer backs off on 429
    if (!res.ok) throw new Error(`Google Translate answered HTTP ${res.status}`);
    return parseGoogleResponse(await res.json());
}

export default {
    /** ctx.native.call("translate", text, target) -> { text, source } */
    async translate(text: unknown, target: unknown): Promise<Translation> {
        if (typeof text !== "string" || !text.trim()) throw new Error("Nothing to translate");
        const tl = typeof target === "string" ? normalizeLanguage(target) : undefined;
        if (!tl) throw new Error(`Not a language code: ${String(target)}`);

        const parts: string[] = [];
        let source = "";
        for (const chunk of chunkText(text.slice(0, MAX_INPUT))) {
            // Google trims a chunk's edges: keep the line breaks between chunks
            const lead = /^\s*/.exec(chunk)![0];
            const trail = /\s*$/.exec(chunk)![0];
            if (!chunk.trim()) {
                parts.push(chunk);
                continue;
            }
            const result = await request(chunk, tl);
            source ||= result.source;
            parts.push(lead + result.text.trim() + trail);
        }
        return { text: parts.join(""), source };
    },
} satisfies NativePlugin;
