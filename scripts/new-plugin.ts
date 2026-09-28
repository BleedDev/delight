/**
 * Starts a new plugin: a folder with a manifest, a working index.tsx, its strings (English, ready for
 * other languages), a pure logic file and its test, laid out the way docs/plugins.md describes. It builds, runs and passes its test as it is.
 *
 *   bun run new-plugin my-plugin [--name "My Plugin"] [--author "You"] [--official]
 *
 * Community plugins go in userplugins/ (gitignored), --official ones in plugins/ with their test in
 * tests/. Then `bun run dev`, turn it on in Evi, and edit away: it reloads as you save.
 */
import { existsSync, mkdirSync, readdirSync, writeFileSync } from "fs";
import { join, relative, resolve } from "path";
import { parseArgs } from "util";

import pkg from "../package.json";
import { isPluginId, RETIRED_PLUGINS } from "../src/shared/store";
import { PLACEHOLDER_DESCRIPTION } from "../src/shared/submissionChecks";

const ROOT = resolve(import.meta.dir, "..");

const { values, positionals } = parseArgs({
    args: process.argv.slice(2),
    allowPositionals: true,
    options: {
        name: { type: "string" },
        author: { type: "string" },
        official: { type: "boolean", default: false },
    },
});

function fail(message: string): never {
    console.error(`✗ ${message}`);
    process.exit(1);
}

const id = positionals[0];
if (!id) fail("Say what it's called: bun run new-plugin my-plugin");
if (!isPluginId(id)) fail(`"${id}" can't be a plugin id: lowercase letters, digits and dashes, like my-plugin`);
if (!values.official && (id.startsWith("evi") || RETIRED_PLUGINS.includes(id))) fail(`Ids starting with "evi", and retired ones, are Evi's: pick another`);

const official = new Set(readdirSync(join(ROOT, "plugins")));
const userDir = join(ROOT, "userplugins");
const taken = official.has(id) || (existsSync(userDir) && readdirSync(userDir).includes(id));
if (taken) fail(`There's already a plugin called ${id}`);

/** "my-plugin" -> "My Plugin" */
const titleCase = (s: string) => s.split("-").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
/** "my-plugin" -> "myPlugin" */
const camelCase = (s: string) => s.replace(/-([a-z0-9])/g, (_, c: string) => c.toUpperCase());

const name = values.name?.trim() || titleCase(id);
const author = values.author?.trim() || (values.official ? "Evi" : "You");
const command = id.replace(/-/g, "").slice(0, 32);

const dir = join(ROOT, values.official ? "plugins" : "userplugins", id);
const testFile = values.official ? join(ROOT, "tests", `${camelCase(id)}.test.ts`) : join(dir, "greeting.test.ts");
const logicImport = values.official ? `../plugins/${id}/greeting` : "./greeting";

const manifest = {
    id,
    name,
    description: PLACEHOLDER_DESCRIPTION,
    version: "1.0.0",
    authors: [author],
    tags: ["social"],
    permissions: {},
    changelog: [{ version: "1.0.0", notes: ["First release."] }],
    // Name, description and changelog in other languages, shown when Discord is set to one of them.
    // English stays in the fields above. Add a language per block ("de", "pt-BR"...): docs/plugins.md, "Translations"
    locales: {
        es: {
            name,
            description: "Di qué obtiene alguien con él, en una o dos frases.",
            changelog: { "1.0.0": ["Primera versión."] },
        },
    },
    minEviVersion: pkg.version,
    enabledByDefault: false,
};

const index = `import { definePlugin } from "@evi/api";
import type { PluginContext } from "@evi/api";

import { greet } from "./greeting";
import { t } from "./strings";

/**
 * ${name}: what it does, and how it hooks into Discord. Say which patches and hooks it uses and why,
 * so whoever reads this after a Discord update knows what to look at. See docs/plugins.md.
 */

type Settings = typeof settings;
const settings = {
    // Settings are read when they're drawn, so their text is a getter: it follows Discord's language
    greeting: {
        type: "string",
        get label() { return t("settings.greeting"); },
        get description() { return t("settings.greeting.description"); },
        default: "Hello",
        placeholder: "Hello",
    },
    shortcut: {
        type: "keybind",
        get label() { return t("settings.shortcut"); },
        get description() { return t("settings.shortcut.description"); },
        default: "",
    },
} as const;

/** Set while the plugin runs: patches and components live outside start */
let context: PluginContext<Settings> | undefined;

export default definePlugin({
    settings,

    start(ctx) {
        context = ctx;
        ctx.onDispose(() => void (context = undefined));

        ctx.command({
            name: "${command}",
            description: t("command.description"),
            options: [{ name: "name", description: t("command.nameOption"), type: "string" }],
            execute: args => ({ ephemeral: greet(ctx.settings.get("greeting"), args.name) }),
        });

        ctx.keybind("shortcut", () => ctx.toast(greet(ctx.settings.get("greeting"))));
    },
});
`;

const strings = `import { defineStrings } from "@evi/api";

/**
 * Everything ${name} shows, by Discord language. English is required, it's the source of the keys and
 * the fallback for anything another language leaves out. Add a language as a block of its own
 * ("de", "es", "pt-BR"...); a plural is { one: "{count} thing", other: "{count} things" }.
 * See docs/plugins.md, "Translations". Use it as t("key", { name: "value" }).
 */
export const t = defineStrings({
    en: {
        "settings.greeting": "Greeting",
        "settings.greeting.description": "What /${command} and the shortcut say.",
        "settings.shortcut": "Shortcut",
        "settings.shortcut.description": "Says the greeting as a toast, anywhere in Discord.",
        "command.description": "Say the greeting",
        "command.nameOption": "Who to greet",
    },
    es: {
        "settings.greeting": "Saludo",
        "settings.greeting.description": "Lo que dicen /${command} y el atajo.",
        "settings.shortcut": "Atajo",
        "settings.shortcut.description": "Dice el saludo como aviso, en cualquier parte de Discord.",
        "command.description": "Decir el saludo",
        "command.nameOption": "A quién saludar",
    },
});
`;

const logic = `/**
 * Pure logic for ${name}: no Discord, DOM or storage, so it can be tested with bun test.
 * Keep what the plugin decides here and what it touches in index.tsx.
 */

export function greet(greeting: string, name?: string): string {
    const who = name?.trim();
    return who ? \`\${greeting.trim() || "Hello"}, \${who}!\` : \`\${greeting.trim() || "Hello"}!\`;
}
`;

const test = `import { expect, test } from "bun:test";

import { greet } from "${logicImport}";

test("greets someone by name", () => {
    expect(greet("Hello", "Ada")).toBe("Hello, Ada!");
});

test("greets everyone without one, and says hello without a greeting", () => {
    expect(greet("Hi")).toBe("Hi!");
    expect(greet("  ", " ")).toBe("Hello!");
});
`;

mkdirSync(dir, { recursive: true });
writeFileSync(join(dir, "manifest.json"), JSON.stringify(manifest, null, 4) + "\n");
writeFileSync(join(dir, "index.tsx"), index);
writeFileSync(join(dir, "strings.ts"), strings);
writeFileSync(join(dir, "greeting.ts"), logic);
writeFileSync(testFile, test);

const rel = (p: string) => relative(ROOT, p).replaceAll("\\", "/");
console.log(`✓ ${name} is in ${rel(dir)}/`);
console.log(`
  ${rel(join(dir, "manifest.json"))}   name, description, what it needs ("permissions"), "locales" for other languages
  ${rel(join(dir, "index.tsx"))}       what it does in Discord
  ${rel(join(dir, "strings.ts"))}      its text by language (English, and an example in Spanish)
  ${rel(join(dir, "greeting.ts"))}     logic without Discord, tested by ${rel(testFile)}

Next:
  bun run dev                      builds it and reloads it as you save
  Ctrl+Shift+D in Discord          turn ${name} on under Plugins, try /${command}
  bun test ${rel(testFile)}
  bun run preview-plugin ${id}      its store page, and what the store would say about it

The guide is docs/plugins.md.`);
