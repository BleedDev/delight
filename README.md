# Delight

A Discord desktop client mod. Plugins are separate bundles loaded at runtime and hot-reload when their files change. They can rewrite Discord's source, hook any exported function, and run code in Electron's main process.

## Quick start

```sh
bun install
bun run build            # core + plugins into dist/
bun run inject           # point Discord Stable at this repo's dist/ (quit Discord first, or add --restart)
bun run dev              # rebuild on save
```

With `bun run dev` running:

- **Plugin edits** apply live: the plugin stops, its new code is evaluated, and it starts again. Discord doesn't reload.
- **Renderer core edits** apply on `Ctrl+R` in Discord.
- **Main process edits** need Discord restarted.

Press `Ctrl+Shift+D` in Discord to open the settings panel, where you manage plugins, themes, Quick CSS and patch health, and try out new source patches in the Patch Helper. The same pages are also in Discord's own settings, under Delight.

To ship it: `bun run compile` builds `dist/delight.exe`, a single-file installer with the core and official plugins embedded.

```
delight install   [--flavor stable|ptb|canary|development|all] [--restart] [--dev]
delight uninstall [--flavor ...] [--restart]
delight status
delight update    [--check] [--flavor ...] [--restart]
```

Launch `Discord.exe --vanilla` to start once without Delight, or `Discord.exe --delight-safe` to start once in [safe mode](#safe-mode).

### Updating

`delight update` asks GitHub for the latest published release of `BleedDev/delight`. If it's newer than the running exe, it downloads the new `delight.exe` next to the current one and checks it against the release's `delight.exe.sha256`. A mismatch is rejected and nothing changes. Windows can't overwrite a running exe, so the current one is renamed to `delight.exe.old`, the new one takes its name, and the `.old` is removed the next time Delight runs. Then the new exe runs `install` (with your `--flavor` / `--restart`), which refreshes the core and official plugins in `%APPDATA%\Delight`.

`delight update --check` only reports whether a newer release exists. Source checkouts (`bun src/cli/index.ts`) don't replace themselves: update them with `git pull` and `bun run build`.

### Releasing

`.github/workflows/release.yml` never publishes anything. It runs only when started from the Actions tab (with a `version` input) or when a `v*` tag is pushed. The version must match `package.json`. It builds, typechecks, runs the unit and CLI tests, compiles `delight.exe`, and creates a **draft** release with `delight.exe` and `delight.exe.sha256` attached. A maintainer reviews the draft and publishes it; only then does `delight update` see it. Versions with a `-suffix` are marked as prereleases, which `delight update` ignores.

## How it works

```
Discord.exe
 └ resources/app.asar        our loader (src/shared/shim.ts). Falls back to vanilla if the core fails
    └ core/main.js           src/main: IPC, settings, plugin host + native modules, file watchers
       ├ session preload     src/preload: exposes DelightNative, injects the renderer before Discord's scripts
       │  └ renderer.js      src/renderer: webpack capture, patching, plugin manager, UI
       └ resources/_app.asar Discord's untouched original, loaded after setup
```

- **Injection.** Electron always loads `app.asar` before an `app` folder, so the installer renames Discord's archive to `_app.asar` and writes a tiny loader archive in its place. When Discord updates into a new `app-x.y.z` folder, the main process re-applies this swap on its own at startup and on quit.
- **Preload.** Instead of replacing Discord's `BrowserWindow`, we register an extra session preload, so Discord's own preload is never touched.
- **Webpack capture.** Discord is built with rspack. Four runtimes share `webpackChunkdiscord_app`: libdiscore, fast-connect, sentry and the main app. We trap the array's `push` assignment, get each runtime's `__webpack_require__` through a fake chunk, and wrap every module factory. The runtime that executes the most modules is treated as the main one.
- **Two patching models**, both first-class:
  - **Source patches** (`src/renderer/patching/source.ts`) rewrite a module's code right before it first runs. They can change anything. `\i` matches any minified identifier, and `$self` refers to your plugin. Each patch is compiled separately and reverted if it produces invalid code.
  - **Export hooks** (`src/renderer/patching/hooks.ts`) are chained `before` / `after` / `instead` hooks on any function (module exports, store methods, components). They survive most Discord updates. Exports are made configurable at capture time so this always works.
- **Patch health.** The Patches tab checks every source patch against every module factory Discord has registered. Each patch is reported as `applied`, `waiting` (lazy chunk), `broken` (Discord changed) or `ambiguous`. After a Discord update, you see exactly which patch broke.
- **Patch Helper.** Write a `find`, `match` and `replace` and see, as you type, which modules the find hits, what the match catches with context, the code before and after, and whether the patched module still compiles. It uses the patcher's own matching and compile steps, and gives you the finished patch to paste into your plugin.

## Themes

A theme is a `.css` file in `%APPDATA%\Delight\themes`. Turn it on in the Themes tab. Saving the file restyles Discord right away, and new files show up without a reload. BetterDiscord-style headers are read for the name, description, author and version:

```css
/**
 * @name Midnight
 * @description A darker Discord
 * @author you
 * @version 1.0.0
 */
```

Without a header, the file name is used. **Add from URL** downloads an `https://` link to a CSS file (up to 2 MB) into the themes folder and turns it on. For GitHub, use the Raw link. Enabled themes apply before Discord first paints, and Quick CSS always goes on top of them.

## Safe mode

A plugin, theme or Quick CSS that breaks Discord can't lock you out of it. In safe mode Delight still loads, with its settings, but nothing you added runs: no plugins (not even their top-level code, their native side or their Chromium switches), no themes and no Quick CSS. Discord itself works normally.

- **Crash loops.** Each start is counted in `%APPDATA%\Delight\safe-mode.json`. Once plugins have started and Discord has stayed up for 5 seconds, the start counts as healthy and the counter goes back to 0. A start that crashes, hangs or gets closed before that leaves it up. After 2 of those in a row, the next start is in safe mode.
- **Crashes while Discord runs.** If Discord's window crashes twice within 2 minutes, Discord switches to safe mode on the spot: native plugin code is stopped and the window reloads without plugins.
- **Staying safe.** Safe mode caused by crashes stays on across restarts until you leave it. If Discord still fails to start twice in safe mode, the next start skips Delight entirely, then it's back to safe mode.
- **On demand.** `Discord.exe --delight-safe` starts in safe mode once.

A notice in Discord (and at the top of the Plugins tab) says why safe mode is on and names the most recent change that's still on: a plugin turned on, added or updated, its settings changed, a theme turned on or edited, or a Quick CSS edit. It offers **Disable &lt;it&gt; and restart** and **Exit safe mode and restart**. Turning a plugin on is written to disk before any of its code runs, so a plugin that crashes Discord the moment you enable it is still named. In safe mode you can still turn plugins and themes on and off; the changes apply once you leave it.

All plugins are off, official ones included. They're installed into the same folder as yours and there's no telling them apart on disk, and a Discord update can break an official plugin's source patch as easily as yours. The notice and the settings are part of Delight's core, so they still work.

## Writing a plugin

A plugin is a folder in `plugins/` (official) or `userplugins/` (yours, gitignored):

```
plugins/my-plugin/
  manifest.json    { "id": "my-plugin", "name": "My Plugin", "description": "…" }
  index.ts(x)      renderer code, required
  native.ts        main-process code, optional
```

```tsx
import { definePlugin, filters } from "@delight/api";

export default definePlugin({
    settings: {
        loud: { type: "boolean", label: "Shout every message", default: false },
    },

    // Source patch: rewrite Discord's code before it runs
    patches: [{
        find: "Object.defineProperties(this,{isDeveloper",
        replace: { match: /(?<=isDeveloper:\{[^}]*?get:\(\)=>)\i/, with: "$self.isDev()" },
    }],
    isDev: () => true,

    // Everything registered through ctx is undone automatically on stop / hot reload
    start(ctx) {
        ctx.hookExport("before", filters.byProps("sendMessage", "editMessage"), "sendMessage", ({ args }) => {
            if (ctx.settings.get("loud")) args[1].content = args[1].content.toUpperCase();
        });
        ctx.flux.subscribe("MESSAGE_CREATE", action => ctx.logger.info(action.message.content));
        ctx.addStyle(".some-class { color: hotpink; }");
    },
});
```

The `ctx` object:

| Member | What it does |
|---|---|
| `hook.before / after / instead(obj, key, cb)` | Hook a function on an object |
| `hookExport(kind, filter, [method], cb)` | Hook a webpack export as soon as its module loads, even if the module is lazy |
| `waitFor(filter, cb)` | Get notified when a matching export appears |
| `flux.subscribe(type, handler)`, `flux.dispatch(action)` | Subscribe to and dispatch Flux actions |
| `settings.get / set / all / use() / onChange(cb)` | Typed settings from your schema. `use()` is a React hook, `onChange` is removed on stop |
| `native.call(method, ...args)` | Call a function exported by your `native.ts` |
| `toast(message, { type?, duration?, position? })` | Show one of Discord's toasts. `type` is `"info"` (default), `"success"` or `"failure"` |
| `contextMenu(navId, (children, props, menuProps) => void)` | Add items to a Discord menu. Removed on stop |
| `command({ name, description, options?, predicate?, execute })` | Register a local slash command. Removed on stop |
| `addStyle(css)`, `setInterval`, `setTimeout`, `onDispose(fn)` | Tracked resources, cleaned up on stop |

### Toasts, menu items and slash commands

These use Discord's own systems, so they look and behave like Discord's.

```tsx
import { definePlugin, findMenuGroup, Menu } from "@delight/api";

export default definePlugin({
    start(ctx) {
        ctx.command({
            name: "roll",
            description: "Roll a die",
            options: [{ name: "sides", description: "How many sides", type: "integer", required: true }],
            execute(args, { channel }) {
                ctx.toast(`Rolled ${1 + Math.floor(Math.random() * args.sides)}`, { type: "success" });
                // or: return { content: "..." } and Discord sends it as your message
            },
        });

        ctx.contextMenu("message", (children, { message }) => {
            if (!message) return;
            // Next to Discord's own "Copy Text" item, or at the end if it's missing
            (findMenuGroup(children, "copy-text") ?? children).push(
                <Menu.Item id="my-copy" label="Copy Content" action={() => navigator.clipboard.writeText(message.content)} />,
            );
        });
    },
});
```

- **Toasts** go through Discord's toast queue: one shows at a time, the rest wait their turn.
- **Menus.** `navId` is Discord's name for the menu: `"message"`, `"user-context"`, `"guild-context"`, `"channel-context"`, `"gdm-context"`… or `"*"` for all of them. `children` is the menu's item list; push to it, splice into it, or use `findMenuGroup(children, itemId)` to add next to one of Discord's items. Items must be `Menu.Item`, `Menu.Group`, `Menu.Separator`, `Menu.CheckboxItem`, `Menu.RadioItem`, `Menu.SwitchItem` or `Menu.ControlItem`, Discord's own components (it rejects anything else). `props` holds what the menu was rendered with (the message and channel, the user, the guild...). It comes from a core source patch, shown as `delight` in the Patches tab, that adds the rendering component's props next to every `navId` in Discord's code. Where that isn't possible (class fields, module scope), `props` is `{}`.
- **Commands** are listed with Discord's built-ins (`/shrug`, `/tableflip`) and run locally. `args` maps option names to values. Option `type` is `"string"` (default), `"integer"`, `"number"`, `"boolean"`, `"user"`, `"channel"`, `"role"`, `"mentionable"` or `"attachment"`. Returning `{ content }` makes Discord send it as a message from you. A thrown error shows a failure toast.

The same functions exist outside `ctx` as `showToast`, `addContextMenuPatch` and `registerCommand`. The last two return a removal function you must call yourself.

Finders exported from `@delight/api`: `find`, `findAll`, `findByProps`, `findByCode`, `findComponent`, `findStore`, `findExport` (returns where the value lives, for hooking), lazy variants (`findByPropsLazy`…), `findModuleIds`, `requireModule`, `waitFor`. Common modules are `React`, `ReactDOM`, `createRoot`, `Dispatcher` and `getStore(name)`. Plugins may `import` `react` and use JSX. Both resolve to Discord's own React at runtime.

`native.ts` runs in the main process:

```ts
import type { NativePlugin } from "@delight/api/native";

export default {
    start(ctx) {
        ctx.onBeforeRequest(({ url }) => url.includes("/science") ? { cancel: true } : undefined);
    },
    async readConfig(path: string) { /* full Node + Electron access */ },
} satisfies NativePlugin;
```

**Hot reload rules.** Code, hooks, styles and settings reload live, and so do source patches in most cases. When a patch changes for a module that already ran, *live module replacement* (`src/renderer/patching/live.ts`) re-runs that module with the new patch set. It moves the fresh exports into the existing exports object, so every importer switches to the patched code, and it carries existing export hooks over. Some modules can't safely run twice: Flux stores, modules whose exports are a bare function, and modules that subscribe to Flux actions when they run (detected by diffing the dispatcher, and undone). Those fall back to a reload banner that says why. A patch can force the choice with `live: true` or `live: false`.

## Performance

`Delight.stats` counts what Delight adds to module loading. `bun run bench` measures it on the live bundle. On about 6,800 modules:

| | Before | After |
|---|---|---|
| Source patch scanning | 12.6 ms | 7 ms |
| Export lookups (`waitFor`) | 104 ms | 49 ms (worst case: one waiter that never resolves on the logged-out page) |
| Hooked call | n/a | about 86 ns (unhooked 5 ns) |

These come from:
- A single dispatcher for all waiters, which reads each module's exports once.
- Code filters that check the module's source first, so no per-function stringification.
- Copy-on-write hook lists and no per-call closures.
- A JSX runtime that's resolved once.

Settings and Quick CSS are flushed synchronously when the page unloads.

## Tests

`bun run test` runs everything:

| Suite | What it proves |
|---|---|
| `test:unit` | Hook engine: ordering, error isolation, exact restore, getters, construct, rebasing. Patch Helper evaluation. Theme header parsing and remote theme checks. The menu props patch: what gets rewritten and what must not be. Safe mode rules: when a start is safe or vanilla, which changes are recorded, which one is the suspect |
| `test:web` | The renderer on the **live discord.com bundle** in headless Chrome: runtime capture, finders, source patch, hooks, hot reload, toasts, menu items, slash commands, UI including the Patch Helper and Themes tabs, and a second page booted in safe mode: nothing evaluated or styled, the notice and its buttons. It runs on Node because Playwright's transports hang under Bun on Windows. |
| `test:electron` | Main process and preload in real Electron against a fake Discord install: preload, IPC boot, native request blocking, live plugin install, themes (applied at startup, live from the folder, ordered under Quick CSS, downloaded from a URL), auto-injection after an update. Safe mode over repeated starts against one data folder: a plugin that crashes the renderer when turned on, two crashing starts, then safe mode naming it, "Disable and restart", a healthy start resetting the counter, `--delight-safe`, crashes while running, and the vanilla fallback |
| `test:cli` | Installer against a fake `%LOCALAPPDATA%`: install, reinstall, uninstall byte-for-byte, refusal to install over other mods. `delight update` against a local fake of GitHub's API (`DELIGHT_UPDATE_API`): up to date, newer release, no releases, network and API errors. `--exe` runs it against the compiled binary and also checks checksum rejection, self-replacement on a copy of the exe, and that updates only refresh Discords that already have Delight |

None of the tests touch your real Discord install or profile.

## CI

[![CI](https://github.com/BleedDev/delight/actions/workflows/ci.yml/badge.svg)](https://github.com/BleedDev/delight/actions/workflows/ci.yml)

Every push and pull request to `main` runs the build, typecheck and all the suites above on `windows-latest` (`.github/workflows/ci.yml`). The web and Electron suites load the live discord.com, so an outage or a change on Discord's side can fail a run. Everything in `test-results/` (screenshots, logs) is uploaded as an artifact on every run. The browser suites look for Chrome in its usual install folders; set `CHROME_PATH` to use another Chromium browser.
