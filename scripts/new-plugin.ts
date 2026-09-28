/**
 * Starts a new plugin: a folder with a manifest, a working index.tsx, a pure logic file and its test,
 * laid out the way docs/plugins.md describes. It builds, runs and passes its test as it is.
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
    minEviVersion: pkg.version,
    enabledByDefault: false,
};

const index = `import { definePlugin } from "@evi/api";
import type { PluginContext } from "@evi/api";

import { greet } from "./greeting";

/**
 * ${name}: what it does, and how it hooks into Discord. Say which patches and hooks it uses and why,
 * so whoever reads this after a Discord update knows what to look at. See docs/plugins.md.
 */

type Settings = typeof settings;
const settings = {
    greeting: { type: "string", label: "Greeting", description: "What /${command} and the shortcut say.", default: "Hello", placeholder: "Hello" },
    shortcut: { type: "keybind", label: "Shortcut", description: "Says the greeting as a toast, anywhere in Discord.", default: "" },
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
            description: "Say the greeting",
            options: [{ name: "name", description: "Who to greet", type: "string" }],
            execute: args => ({ ephemeral: greet(ctx.settings.get("greeting"), args.name) }),
        });

        ctx.keybind("shortcut", () => ctx.toast(greet(ctx.settings.get("greeting"))));
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
writeFileSync(join(dir, "greeting.ts"), logic);
writeFileSync(testFile, test);

const rel = (p: string) => relative(ROOT, p).replaceAll("\\", "/");
console.log(`✓ ${name} is in ${rel(dir)}/`);
console.log(`
  ${rel(join(dir, "manifest.json"))}   name, description, what it needs ("permissions")
  ${rel(join(dir, "index.tsx"))}       what it does in Discord
  ${rel(join(dir, "greeting.ts"))}     logic without Discord, tested by ${rel(testFile)}

Next:
  bun run dev                      builds it and reloads it as you save
  Ctrl+Shift+D in Discord          turn ${name} on under Plugins, try /${command}
  bun test ${rel(testFile)}
  bun run preview-plugin ${id}      its store page, and what the store would say about it

The guide is docs/plugins.md.`);
