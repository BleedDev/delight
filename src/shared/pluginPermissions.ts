/**
 * What a plugin can touch, in plain words, for its details and its store page.
 *
 * Built from three sources, each as good as it gets:
 *   - the manifest (or registry entry): native code and Chromium switches, which are certain
 *   - a static scan of the plugin's index.js text: every API it mentions, before it ever runs
 *   - what the running plugin actually registered through its context (hooks, Flux, menus...)
 *
 * The scan reads text, it doesn't run anything: a plugin can always hide what it does (building
 * names at runtime, eval). So the list is "what we could see", and dynamic code is itself flagged.
 * Pure: no DOM, no network, no disk, shared by the renderer and the tests.
 */

import { DISCORD_HOST } from "./pluginActivity";

export type Risk = "low" | "medium" | "high";

export type CapabilityId =
    | "native"
    | "network"
    | "links"
    | "dynamicCode"
    | "patches"
    | "hooks"
    | "flux"
    | "discordData"
    | "menus"
    | "commands"
    | "css"
    | "clipboard"
    | "storage"
    | "settings";

export interface Capability {
    id: CapabilityId;
    risk: Risk;
    /** Short, for a badge or a row title: "Rewrites Discord's code" */
    title: string;
    /** One plain sentence on what it means for you */
    description: string;
    /** Specifics, when known: patch targets, domains, event names... */
    details: string[];
}

export interface PermissionsReport {
    /** Highest risk first, then in a stable order */
    capabilities: Capability[];
    /** The highest risk of any capability, "low" when there are none */
    risk: Risk;
    /** Whether a bundle was scanned: without one, only the manifest and runtime were read */
    scanned: boolean;
}

/** What a running plugin registered through its context, see src/renderer/plugins/context.ts */
export interface RuntimeUsage {
    /** Names of hooked functions ("sendMessage") */
    hooks: string[];
    /** Flux action types subscribed to */
    flux: string[];
    /** Menu navIds ("message", "*") */
    menus: string[];
    /** Slash command names */
    commands: string[];
    /** Stylesheets added */
    styles: number;
}

/** What the scan of a bundle's text found */
export interface StaticFindings {
    patchFinds: string[];
    /** `patches: [` appears, even if no find could be read */
    hasPatches: boolean;
    /** How many patches its `patches` arrays hold, when they could be counted */
    patchCount: number;
    hooks: number;
    hookNames: string[];
    flux: string[];
    fluxDispatch: boolean;
    menus: string[];
    menuCalls: number;
    commands: string[];
    commandCalls: number;
    css: boolean;
    network: string[];
    domains: string[];
    discordDomains: string[];
    opensLinks: boolean;
    clipboardRead: boolean;
    clipboardWrite: boolean;
    storage: string[];
    settings: boolean;
    dynamicCode: string[];
    stores: string[];
}

/**
 * A store plugin's files before it's installed, for its store page. Main downloads them and checks
 * them against the registry's hashes, exactly like an install, and writes nothing.
 */
export type StorePreviewResult =
    | { ok: true; code: string; manifest: { native: boolean; chromiumSwitches?: Record<string, string | true>; }; }
    | { ok: false; error: string; };

/** Chromium switches from an untrusted manifest: plain names with string or flag values, or nothing */
export function cleanSwitches(value: unknown): Record<string, string | true> | undefined {
    if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
    const entries = Object.entries(value as Record<string, unknown>)
        .filter((e): e is [string, string | true] => /^[\w-]{1,64}$/.test(e[0]) && (e[1] === true || (typeof e[1] === "string" && e[1].length <= 256)))
        .slice(0, 50);
    return entries.length ? Object.fromEntries(entries) : undefined;
}

export interface PermissionsInput {
    /** index.js text. Missing: nothing to scan (not downloaded yet, or safe mode) */
    code?: string;
    manifest?: { native?: string | boolean; chromiumSwitches?: Record<string, string | true>; };
    /** The registry's "native" flag, for store entries */
    native?: boolean;
    /** Patches of the evaluated plugin, exact where the scan can only guess */
    patches?: readonly { find: string | RegExp; }[];
    /** Setting keys of the evaluated plugin */
    settings?: readonly string[];
    runtime?: RuntimeUsage;
}

const RISK_ORDER: Record<Risk, number> = { high: 0, medium: 1, low: 2 };
const ORDER: CapabilityId[] = [
    "native", "network", "dynamicCode", "clipboard", "patches", "hooks", "flux", "discordData",
    "menus", "commands", "css", "links", "storage", "settings",
];

/** Hosts every bundle mentions without ever contacting them: XML namespaces, React's error pages */
const IGNORED_HOST = /(?:^|\.)(?:w3\.org|reactjs\.org|react\.dev|fb\.me|example\.com|example\.org|localhost)$/;

const MAX_DETAILS = 12;

const unique = (values: Iterable<string>) => [...new Set(values)];

/** Removes whole-line comments, which bundlers keep ("// plugins/foo/index.ts") and which may hold URLs */
function stripLineComments(code: string) {
    return code.replace(/^[ \t]*\/\/.*$/gm, "").replace(/^[ \t]*\/\*[\s\S]*?\*\//gm, "");
}

/** The text of a string literal, or undefined when it isn't one */
function literal(raw: string): string | undefined {
    const quote = raw[0];
    if (quote === '"') {
        try {
            return JSON.parse(raw);
        } catch {
            return raw.slice(1, -1);
        }
    }
    if (quote === "'" || quote === "`") return raw.slice(1, -1).replace(/\\(.)/g, "$1");
    if (quote === "/") return raw;
    return undefined;
}

const STRING = String.raw`"(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'|\x60(?:[^\x60\\]|\\.)*\x60`;
const REGEX_LITERAL = String.raw`\/(?![*/])(?:[^/\\\n\[]|\\.|\[(?:[^\]\\\n]|\\.)*\])+\/[dgimsuvy]*`;

/**
 * The balanced `{…}` or `[…]` that starts at `open` (an index of the bracket), skipping strings.
 * Enough for bundler output; gives up (returns the rest, capped) on anything it can't follow.
 */
function blockAt(code: string, open: number, cap = 20_000) {
    const pairs: Record<string, string> = { "{": "}", "[": "]", "(": ")" };
    const stack: string[] = [];
    const end = Math.min(code.length, open + cap);
    for (let i = open; i < end; i++) {
        const c = code[i];
        if (c === '"' || c === "'" || c === "`") {
            for (i++; i < end && code[i] !== c; i++) if (code[i] === "\\") i++;
            continue;
        }
        if (pairs[c]) stack.push(pairs[c]);
        else if (c === stack[stack.length - 1]) {
            stack.pop();
            if (!stack.length) return code.slice(open, i + 1);
        }
    }
    return code.slice(open, end);
}

/** How many items a `[…]` literal holds, counting only its own commas */
function topLevelItems(block: string) {
    const inner = block.slice(1, -1).trim();
    if (!inner) return 0;
    let depth = 0, items = 1;
    for (let i = 0; i < inner.length; i++) {
        const c = inner[i];
        if (c === '"' || c === "'" || c === "`") {
            for (i++; i < inner.length && inner[i] !== c; i++) if (inner[i] === "\\") i++;
        } else if (c === "{" || c === "[" || c === "(") depth++;
        else if (c === "}" || c === "]" || c === ")") depth--;
        else if (c === "," && depth === 0 && inner.slice(i + 1).trim()) items++;
    }
    return items;
}

function all(code: string, re: RegExp, group = 1) {
    const out: string[] = [];
    for (const m of code.matchAll(re)) if (m[group] !== undefined) out.push(m[group]);
    return out;
}

/** Reads what a bundle's text says it uses. Heuristic, never executes anything. */
export function scanBundle(input: string): StaticFindings {
    const code = stripLineComments(input);

    // Source patches: `patches: [ { find: "…", replace: … } ]`
    const findRe = () => new RegExp(String.raw`\bfind\s*:\s*(${STRING}|${REGEX_LITERAL})`, "g");
    let patchFinds: string[] = [];
    let hasPatches = false;
    let patchElements = 0;
    for (const m of code.matchAll(/\bpatches\s*:\s*\[/g)) {
        hasPatches = true;
        const block = blockAt(code, m.index! + m[0].length - 1);
        patchElements += topLevelItems(block);
        for (const f of block.matchAll(findRe())) {
            const text = literal(f[1]);
            if (text !== undefined) patchFinds.push(text);
        }
    }
    // `patches: [PATCHES.a, PATCHES.b]`: the patches are defined elsewhere, as objects with a find and a replace
    if (hasPatches && !patchFinds.length) {
        for (const f of code.matchAll(findRe())) {
            if (!/\breplace\s*:/.test(code.slice(f.index!, f.index! + f[0].length + 600))) continue;
            const text = literal(f[1]);
            if (text !== undefined) patchFinds.push(text);
        }
    }
    patchFinds = unique(patchFinds);

    // Export hooks: ctx.hook.before(obj, "key"), ctx.hookExport(kind, filter, "method"?, cb), api's hook()
    const hookCalls = code.match(/\.hookExport\s*\(|\.hook\.(?:before|after|instead)\s*\(|\b(?:import_api|api|evi)\.hook\b\)?\s*\(|\bhook\s*\(\s*[\w$.]+\s*,\s*["'][\w$]+["']\s*,\s*["'](?:before|after|instead)["']/g) ?? [];
    const hookNames = [
        ...all(code, /\.hook\.(?:before|after|instead)\s*\(\s*[^,()]+(?:\([^()]*\))?\s*,\s*["']([\w$]+)["']/g),
        ...all(code, /\.hookExport\s*\(\s*["'](?:before|after|instead)["']\s*,\s*[\w$.]+\([^()]*\)\s*,\s*["']([\w$]+)["']/g),
        ...all(code, /\bhook\)?\s*\(\s*[\w$.]+\s*,\s*["']([\w$]+)["']\s*,\s*["'](?:before|after|instead)["']/g),
    ];

    // Flux: ctx.flux.subscribe("TYPE"), Dispatcher.subscribe("TYPE"), and a definition's `flux: { TYPE(…) {} }`
    const flux = all(code, /\b(?:flux|Dispatcher|dispatcher)\.subscribe\s*\(\s*["']([A-Z][A-Z0-9_]+)["']/g);
    for (const m of code.matchAll(/\bflux\s*:\s*\{/g)) {
        const block = blockAt(code, m.index! + m[0].length - 1);
        // Only the object's own keys: depth 1. The lookahead leaves the `(` or `:` for the depth count.
        const keyRe = /["']?([A-Z][A-Z0-9_]{2,})["']?(?=\s*[(:])/y;
        let depth = 0;
        for (let i = 0; i < block.length; i++) {
            const c = block[i];
            if (c === "{" || c === "(" || c === "[") depth++;
            else if (c === "}" || c === ")" || c === "]") depth--;
            else if (depth === 1 && /[{,\s]/.test(block[i - 1])) {
                keyRe.lastIndex = i;
                const key = keyRe.exec(block);
                if (key) {
                    flux.push(key[1]);
                    i += key[0].length - 1;
                }
            }
        }
    }
    const fluxDispatch = /\b(?:flux|Dispatcher|dispatcher)\.dispatch\s*\(/.test(code);

    // Menus: ctx.contextMenu("message", …), addContextMenuPatch(["a", "b"], …)
    const menuMatches = [...code.matchAll(new RegExp(String.raw`(?:\.contextMenu|\baddContextMenuPatch\)?)\s*\(\s*(${STRING}|\[[^\]]*\])?`, "g"))];
    const menus = menuMatches.flatMap(m => m[1] ? all(m[1], new RegExp(`(${STRING})`, "g")).map(s => literal(s)!).filter(Boolean) : []);

    // Slash commands: ctx.command({ name: "roll", … }), registerCommand({ name: … })
    const commandMatches = [...code.matchAll(/(?:\.command|\bregisterCommand\)?)\s*\(\s*\{/g)];
    const commands = commandMatches.flatMap(m => {
        const name = /\bname\s*:\s*["']([\w-]{1,32})["']/.exec(blockAt(code, m.index! + m[0].length - 1));
        return name ? [name[1]] : [];
    });

    const css = /\.addStyle\s*\(|(?:^|[{,\s])css\s*:\s*["'`]|createElement\s*\(\s*["']style["']\s*\)|\badoptedStyleSheets\b|\bnew\s+CSSStyleSheet\b|\bcreateStyle\s*\(/m.test(code);

    const network = unique([
        /(?<![\w$.])fetch\s*\(|\b(?:window|globalThis|self)\.fetch\b/.test(code) && "fetch",
        /\bXMLHttpRequest\b/.test(code) && "XMLHttpRequest",
        /\bWebSocket\b/.test(code) && "WebSocket",
        /\bEventSource\b/.test(code) && "EventSource",
        /\bsendBeacon\s*\(/.test(code) && "sendBeacon",
        /\bRTCPeerConnection\b/.test(code) && "WebRTC",
    ].filter((v): v is string => !!v));

    const hosts = unique(all(code, /\b(?:https?|wss?):\/\/([a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+)(?![a-z0-9-])/gi).map(h => h.toLowerCase()))
        .filter(h => !IGNORED_HOST.test(h))
        .sort();
    const domains = hosts.filter(h => !DISCORD_HOST.test(h));
    const discordDomains = hosts.filter(h => DISCORD_HOST.test(h));
    const opensLinks = /\bwindow\.open\s*\(|\bopenExternal\b|\btarget\s*:\s*["']_blank["']|\btarget=["']_blank/.test(code);

    const clipboardRead = /\bclipboard\.read(?:Text)?\s*\(|execCommand\s*\(\s*["']paste["']/.test(code);
    const clipboardWrite = /\bclipboard\.write(?:Text)?\s*\(|execCommand\s*\(\s*["'](?:copy|cut)["']|\bcopyToClipboard\b|\bcopyText\s*\(/.test(code);

    const storage = unique([
        /\bindexedDB\b/.test(code) && "IndexedDB",
        /\blocalStorage\b/.test(code) && "localStorage",
        /\bsessionStorage\b/.test(code) && "sessionStorage",
        /\bcaches\.open\s*\(/.test(code) && "Cache Storage",
        /\bdocument\.cookie\b/.test(code) && "cookies",
    ].filter((v): v is string => !!v));

    const settings = /(?:^|[{,\s])settings\s*:\s*\{/m.test(code) || /\.settings\.(?:get|set|use|all|onChange)\b/.test(code);

    const dynamicCode = unique([
        /(?<![\w$.])eval\s*\(/.test(code) && "eval",
        /\bnew\s+Function\s*\(/.test(code) && "new Function",
        /\bimport\s*\(\s*(?!["'`]\.)/.test(code) && "import()",
    ].filter((v): v is string => !!v));

    const stores = unique(all(code, /\b(?:findStore|findStoreLazy|getStore)\)?\s*\(\s*["']([A-Z][\w$]+)["']/g)).sort();

    return {
        patchFinds, hasPatches, patchCount: Math.max(patchElements, patchFinds.length), hooks: hookCalls.length, hookNames: unique(hookNames),
        flux: unique(flux), fluxDispatch,
        menus: unique(menus), menuCalls: menuMatches.length,
        commands: unique(commands), commandCalls: commandMatches.length,
        css, network, domains, discordDomains, opensLinks,
        clipboardRead, clipboardWrite, storage, settings, dynamicCode, stores,
    };
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

function cap(details: string[]) {
    return details.length > MAX_DETAILS ? [...details.slice(0, MAX_DETAILS), `and ${details.length - MAX_DETAILS} more`] : details;
}

/** A patch's find, short enough for one line */
export function describeFind(find: string | RegExp) {
    const text = typeof find === "string" ? JSON.stringify(find) : String(find);
    return text.length > 72 ? `${text.slice(0, 71)}…` : text;
}

/** Everything a plugin can touch, from whatever is known about it */
export function analyzePermissions(input: PermissionsInput): PermissionsReport {
    const found = input.code ? scanBundle(input.code) : undefined;
    const runtime = input.runtime;
    const caps: Capability[] = [];
    const add = (id: CapabilityId, risk: Risk, title: string, description: string, details: string[] = []) =>
        caps.push({ id, risk, title, description, details: cap(unique(details)) });

    // Native: certain, from the manifest or the registry
    const switches = Object.entries(input.manifest?.chromiumSwitches ?? {});
    const nativeModule = !!input.manifest?.native || !!input.native;
    if (nativeModule || switches.length) {
        add("native", "high", "Full access to your computer",
            "Runs outside Discord with full access to your computer: it can read and change your files, start programs and use your network like any app you install.",
            [
                ...nativeModule ? ["Runs code in Discord’s main process (native.js)"] : [],
                ...switches.map(([k, v]) => `Chromium switch --${k}${v === true ? "" : `=${v}`}`),
            ]);
    }

    if (found?.network.length) {
        const where = found.domains.length ? found.domains : [];
        add("network", "medium", "Connects to the internet",
            found.domains.length
                ? "Can send and receive data over the network. Addresses written in its code are listed; it could contact others too."
                : "Can send and receive data over the network. No addresses are written in its code, so where it connects isn’t known.",
            [`Uses ${found.network.join(", ")}`, ...where, ...found.discordDomains.length ? [`Discord: ${found.discordDomains.join(", ")}`] : []]);
    } else if (found?.domains.length) {
        add("links", "low", "Links to websites",
            found.opensLinks
                ? "Mentions web addresses and can open them in your browser. No code that connects to them was found."
                : "Mentions web addresses, for example as links or images. No code that connects to them was found.",
            found.domains);
    }

    if (found?.dynamicCode.length) {
        add("dynamicCode", "medium", "Runs code it builds while running",
            "Part of what it does is decided while it runs, so it can’t be checked from its files.",
            found.dynamicCode);
    }

    if (found?.clipboardRead) {
        add("clipboard", "medium", "Reads your clipboard", "Can read what you copied, including from other apps.", found.clipboardWrite ? ["Reads and writes"] : ["Reads"]);
    } else if (found?.clipboardWrite) {
        add("clipboard", "low", "Copies to your clipboard", "Can put text on your clipboard, for example when you pick a Copy item.");
    }

    // Source patches: exact from the evaluated plugin, else what the scan read
    const finds = input.patches?.length ? input.patches.map(p => describeFind(p.find)) : found?.patchFinds.map(describeFind) ?? [];
    const patchCount = input.patches?.length ?? found?.patchCount ?? 0;
    if (patchCount || found?.hasPatches) {
        add("patches", "medium", patchCount ? `Rewrites Discord’s code (${plural(patchCount, "patch", "patches")})` : "Rewrites Discord’s code",
            "Changes parts of Discord’s own code before it runs, so it can change anything Discord shows or does.",
            finds.map(f => `Find ${f}`));
    }

    const hookNames = unique([...runtime?.hooks ?? [], ...found?.hookNames ?? []]);
    if (hookNames.length || found?.hooks) {
        add("hooks", "low", "Hooks Discord functions",
            "Runs its own code when Discord calls some of its functions, and can change what they do.",
            hookNames);
    }

    const flux = unique([...runtime?.flux ?? [], ...found?.flux ?? []]);
    if (flux.length || found?.fluxDispatch) {
        add("flux", "low", "Listens to Discord events",
            found?.fluxDispatch
                ? "Sees events inside Discord (messages arriving, channels switching…) and can send its own."
                : "Sees events inside Discord, like messages arriving or channels switching.",
            [...flux, ...found?.fluxDispatch ? ["Sends events"] : []]);
    }

    if (found?.stores.length) {
        add("discordData", "low", "Reads Discord data", "Reads what Discord keeps in memory, like users, channels or messages.", found.stores);
    }

    const menus = unique([...runtime?.menus ?? [], ...found?.menus ?? []]);
    if (menus.length || found?.menuCalls) {
        add("menus", "low", "Adds menu items", "Adds items to Discord’s right-click menus.", menus.map(m => m === "*" ? "Every menu" : m));
    }

    const commands = unique([...runtime?.commands ?? [], ...found?.commands ?? []]);
    if (commands.length || found?.commandCalls) {
        add("commands", "low", "Adds slash commands", "Adds commands you can type in the chat bar. They run on your computer.", commands.map(c => `/${c}`));
    }

    if (runtime?.styles || found?.css) {
        add("css", "low", "Changes how Discord looks", "Adds its own styles to Discord’s page.");
    }

    if (found?.storage.length) {
        const cookies = found.storage.includes("cookies");
        add("storage", cookies ? "medium" : "low", cookies ? "Reads browser storage and cookies" : "Stores data in Discord’s page",
            cookies
                ? "Keeps its own data in Discord’s page and can read its cookies."
                : "Keeps its own data in Discord’s page storage, which stays on your computer.",
            found.storage);
    }

    if (input.settings?.length || found?.settings) {
        add("settings", "low", "Saves its settings", "Keeps its own settings in Evi’s settings file.");
    }

    caps.sort((a, b) => RISK_ORDER[a.risk] - RISK_ORDER[b.risk] || ORDER.indexOf(a.id) - ORDER.indexOf(b.id));
    const risk = caps[0]?.risk ?? "low";
    return { capabilities: caps, risk, scanned: !!input.code };
}

export const RISK_LABELS: Record<Risk, string> = { low: "Low risk", medium: "Medium risk", high: "High risk" };

/** One line on the overall picture, for the top of the list */
export function riskSummary(report: PermissionsReport) {
    if (report.risk === "high") return "Can do anything any app on your computer can.";
    if (!report.capabilities.length) return report.scanned ? "Nothing found beyond running inside Discord’s page." : "Runs inside Discord’s page only.";
    if (report.risk === "medium") return "Runs inside Discord only, with some access worth knowing about.";
    return "Runs inside Discord only. It can’t reach your files.";
}
