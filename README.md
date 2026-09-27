# Evi

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

Press `Ctrl+Shift+D` in Discord to open the settings panel, where you manage plugins, themes, Quick CSS and patch health, and try out new source patches in the Patch Helper. The same pages are also in Discord's own settings, under Evi.

To ship it: `bun run compile` builds `dist/evi.exe`, a single-file installer with the core and official plugins embedded. `bun scripts/build.ts --release` builds it for every system at once, from any machine: `evi.exe`, `evi-macos-arm64`, `evi-macos-x64`, `evi-linux-x64` and `evi-linux-arm64`, each with a `.sha256`. Bun's cross-compiled macOS binaries have signatures that don't match their contents, which Apple Silicon refuses to run, so `--release` re-signs them ad hoc with [rcodesign](https://github.com/indygreg/apple-platform-rs/releases) (on your `PATH`, or `RCODESIGN=`) and checks every page hash. It also writes `evi-core.json` (the core and official plugins, what [Evi Setup](#evi-setup) downloads) with its `.sha256`. `bun scripts/build.ts --installer` builds Evi Setup itself into `dist/Evi-Setup.exe`; on its own it leaves `dist/core` and the plugins alone.

Where it finds Discord and keeps its data:

| | Discord | Evi's data |
|---|---|---|
| Windows | `%LOCALAPPDATA%\Discord\app-*` | `%APPDATA%\Evi` |
| macOS | `Discord*.app` in `/Applications` or `~/Applications` | `~/Library/Application Support/Evi` |
| Linux | `discord`, `discord-ptb`, ... in `/usr/share`, `/usr/lib`, `/opt` or `~/.local/share`, or the tarball in `~/Discord` | `~/.config/Evi` |

Linux packages install Discord as root, so run `install`, `uninstall` and `update` there with `sudo`. Under sudo Evi's data still goes to your home and belongs to you, and Discord isn't restarted for you (it would run as root). A package upgrade puts Discord's own `app.asar` back: run `evi install` again. On macOS, the terminal needs **App Management** (System Settings → Privacy & Security) to change `Discord.app`. Flatpak and Snap aren't supported: Snap is read-only and Flatpak's sandbox can't see Evi's data.

```
evi install   [--flavor stable|ptb|canary|development|all] [--restart] [--dev]
evi uninstall [--flavor ...] [--restart]
evi status
evi update    [--check] [--flavor ...] [--restart]
```

### Evi Setup

`Evi-Setup.exe` is the installer for everyone who'd rather not use a terminal: a small window (Rust + [Tauri](https://tauri.app), about 3.5 MB, in `installer/`) that lists Discord Stable, PTB, Canary and Development with what's in each (Evi and its version, nothing, another mod, not found), and installs or uninstalls Evi in the ones you tick. It closes Discord, swaps the archives exactly like `evi install` (the loader is byte for byte the CLI's), writes the core and official plugins into `%APPDATA%\Evi` (plugins you removed stay removed, retired ones are deleted), moves an old `%APPDATA%\Delight` over, and starts Discord again.

It doesn't carry Evi: it downloads `evi-core.json` from its own version's release on GitHub (or the latest, if that release has none) and checks it against `evi-core.json.sha256`; a mismatch changes nothing. When it opens it asks for the latest release, and if that's newer it offers to install it instead. Like the app's update check and `evi update`, it asks evi.rest's mirror of GitHub's release API (`https://evi.rest/v1/github`) first and GitHub itself if evi.rest can't answer; `EVI_UPDATE_API` points it at another API instead, with no fallback (the tests use a local fake) and `EVI_CORE_FILE=dist/embed.json` installs a local build without downloading. `Evi-Setup.exe --headless status|check|install|uninstall [--flavor stable,ptb|all] [--latest] [--no-restart]` does the same without the window and prints JSON.

Needs [Rust](https://rustup.rs) to build (`cargo build --release` in `installer/` works too). Windows only for now: the code builds for macOS and Linux, but those need Tauri's system libraries and a `.app` bundle, so releases carry just the CLI there. The CLI stays for terminals, Linux under sudo, and the in-app updater, which keeps downloading `evi.exe`.

Launch `Discord.exe --vanilla` to start once without Evi, or `Discord.exe --evi-safe` to start once in [safe mode](#safe-mode).

### Updating

`evi update` asks GitHub for the latest published release of `BleedDev/evi`. If it's newer than the running exe, it downloads the new installer for your system (`evi.exe` on Windows) next to the current one and checks it against the release's `.sha256` for it. A mismatch is rejected and nothing changes. Windows can't overwrite a running exe, so the current one is renamed to `evi.exe.old`, the new one takes its name, and the `.old` is removed the next time Evi runs. Then the new exe runs `install` (with your `--flavor` / `--restart`), which refreshes the core and official plugins in `%APPDATA%\Evi`.

Evi also updates from inside Discord: Evi settings → **Updates** shows the latest release and its notes, and **Update and restart Discord** installs it. It downloads `evi.exe`, checks it against `evi.exe.sha256`, keeps it as `%APPDATA%\Evi\evi.exe` and runs its `install --restart` as a separate process (output in `logs\update.log`). macOS and Linux do the same with their own installer when Discord's folder is writable; for a root-owned Linux install the Updates tab says to run `sudo evi update` instead. Evi checks when Discord starts and every few hours after, and shows a notice when a new version is out; the Updates tab can turn that off.

`evi update --check` only reports whether a newer release exists. Source checkouts (`bun src/cli/index.ts`) don't replace themselves: update them with `git pull` and `bun run build`.

### Releasing

`.github/workflows/release.yml` never publishes anything. It runs only when started from the Actions tab (with a `version` input) or when a `v*` tag is pushed. The version must match `package.json`. It builds, typechecks, runs the unit and CLI tests, compiles the installers with `--release --installer`, and creates a **draft** release with all five, `evi-core.json`, `Evi-Setup.exe` and their `.sha256` files attached. A maintainer reviews the draft and publishes it; only then does `evi update` see it. Versions with a `-suffix` are marked as prereleases, which `evi update` ignores.

## How it works

```
Discord.exe
 └ resources/app.asar        our loader (src/shared/shim.ts). Falls back to vanilla if the core fails
    └ core/main.js           src/main: IPC, settings, plugin host + native modules, file watchers
       ├ session preload     src/preload: hands EviNative to the renderer only, injects it before Discord's scripts
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

## Plugins

Official plugins ship in `plugins/` and are turned on or off in the Plugins tab.

| Plugin | Default | What it does |
|---|---|---|
| Clear URLs | on | Removes tracking parameters (utm_source, si...) from links you send |
| Fast Lists | on | Skips rendering work for servers, messages and members far out of view |
| No Track | on | Blocks Discord's analytics and metrics requests |
| Smooth Typing | on | Batches draft saves while you type, halving the worst frame drops |
| Experiments | off | Unlocks the Experiments and developer settings tabs |
| GPU Boost | off | Turns on Chromium's zero-copy GPU uploads (after a restart) |
| Silent Typing | off | Others don't see you typing. Toggle with `/silenttyping` or the keyboard button in the chat bar |
| Quick Actions | off | Message menu: Copy Message Link, Copy Raw Text, Copy Message ID, Search Image (Google Lens, Yandex, TinEye) and Translate with Google, opened in your browser. Items only show when they apply, and not when Discord's menu already has them |

## Themes

A theme is a `.css` file in `%APPDATA%\Evi\themes`. Turn it on in the Themes tab. Saving the file restyles Discord right away, and new files show up without a reload. BetterDiscord-style headers are read for the name, description, author and version:

```css
/**
 * @name Midnight
 * @description A darker Discord
 * @author you
 * @version 1.0.0
 */
```

Without a header, the file name is used. **Add from URL** downloads an `https://` link to a CSS file (up to 2 MB) into the themes folder and turns it on. For GitHub, use the Raw link. Enabled themes apply before Discord first paints, and Quick CSS always goes on top of them.

## Backup and restore

The Backup tab saves everything to one JSON file (`evi-backup-YYYY-MM-DD.json`): settings, which plugins are on and their settings, themes and Quick CSS. Plugin code isn't included; the file lists the plugins you had, and restoring shows which ones aren't installed so you know what to reinstall.

**Choose backup file** validates the file (format `evi-backup`, version 1, up to 16 MB) and shows what would change before anything is written. Pick how to restore:

- **Merge**: the backup's plugin choices and settings win, everything else stays, enabled themes are combined, and your Quick CSS is kept unless it's empty.
- **Replace**: settings and Quick CSS become exactly the backup's, and themes that aren't in the backup are turned off.

Both write the backup's themes (new files, or changed ones overwritten) and never delete anything. All files are written together or not at all, and Discord updates live, no reload.
## Plugin store

The **Plugin Store** (the banner at the top of the Plugins tab; themes have their own in the Themes tab) lists the plugins in a registry, a JSON file at `https://evi.rest/registry.json`, served by evi.rest. Search by name, description, author or tag, then **Install**, **Update** or **Uninstall**. An installed plugin appears and starts right away, no restart: the store writes it into `%APPDATA%\Evi\plugins\<id>` and the plugin watcher picks it up like any other folder.

- **Every file is verified.** The registry lists a sha256 for each file. Evi downloads all of them (https only, redirects included, 5 MB per file, 1 MB for the registry), checks each hash and the manifest (same id, standard file names), and only then writes anything. A mismatch is rejected and nothing is written.
- **Installs are atomic.** Files are staged in `%APPDATA%\Evi\store-staging`, outside the plugins folder, and moved into place with one rename. An update moves the old folder aside first and puts it back if the swap fails.
- **Native plugins ask first.** A plugin with a `native.js`, or with `chromiumSwitches`, runs outside Discord's page with full access to your computer. The registry must mark it `"native": true`, and installing it (or updating it) takes an explicit confirmation that says so. Main refuses the install without it.
- **Only its own plugins.** Store installs carry a `.evi-store.json` marker. The store never overwrites, updates or removes a plugin folder without one, so plugins you put there yourself are safe.
- **Updates** are offered when the registry's version is newer than the installed one (`1.10.0` > `1.9.0`, `1.0.0` > `1.0.0-beta`). Plugins whose `minEviVersion` is newer than your Evi can't be installed.
- **Another registry.** Put `{ "registryUrl": "https://…/registry.json" }` in `%APPDATA%\Evi\store.json`. The renderer can't change it: Discord's page only ever asks for a plugin id, main decides where the files come from. `EVI_STORE_URL` overrides both (the tests use it).

### Registry format

```json
{
    "schema": 1,
    "plugins": [{
        "id": "no-track",
        "name": "No Track",
        "description": "Blocks Discord's analytics requests.",
        "authors": ["Evi"],
        "version": "1.0.0",
        "tags": ["privacy"],
        "native": true,
        "minEviVersion": "0.1.0",
        "files": {
            "manifest.json": { "url": "https://…/no-track/manifest.json", "sha256": "…" },
            "index.js": { "url": "https://…/no-track/index.js", "sha256": "…" },
            "native.js": { "url": "https://…/no-track/native.js", "sha256": "…" }
        }
    }]
}
```

`id` is lowercase letters, digits and dashes (it becomes the folder name). `manifest.json` and `index.js` are required, `native.js` only on native entries, and no other files are allowed. URLs must be `https://`, hashes 64 lowercase hex digits. An invalid entry is skipped and the rest still load; a malformed document is rejected. The rules live in `src/shared/store.ts`.

### Publishing to the registry

```sh
bun run build
bun scripts/registry.ts
```

This copies the built official plugins into `store/plugins/<id>/` and writes `registry.json` with their hashes, pointing at `https://evi.rest/store/plugins`, and copies `themes/*.css` into `store/themes/`. Commit both together: the registry only matches the files from the same run. The same build always gives the same files and hashes. Name, description, authors, version and `tags` come from each plugin's `manifest.json`; `minEviVersion` too, defaulting to the current Evi version. Options: `--base <https url>` to serve the files from somewhere else, `--files <dir>` for where to copy them, `--out <file>` for the registry, `--only id,id` to publish a subset. The script checks its output with the app's own validation before writing it.
## Safe mode

A plugin, theme or Quick CSS that breaks Discord can't lock you out of it. In safe mode Evi still loads, with its settings, but nothing you added runs: no plugins (not even their top-level code, their native side or their Chromium switches), no themes and no Quick CSS. Discord itself works normally.

- **Crash loops.** Each start is counted in `%APPDATA%\Evi\safe-mode.json`. Once plugins have started and Discord has stayed up for 5 seconds, the start counts as healthy and the counter goes back to 0. A start that crashes, hangs or gets closed before that leaves it up. After 2 of those in a row, the next start is in safe mode.
- **Crashes while Discord runs.** If Discord's window crashes twice within 2 minutes, Discord switches to safe mode on the spot: native plugin code is stopped and the window reloads without plugins.
- **Staying safe.** Safe mode caused by crashes stays on across restarts until you leave it. If Discord still fails to start twice in safe mode, the next start skips Evi entirely, then it's back to safe mode.
- **On demand.** `Discord.exe --evi-safe` starts in safe mode once.

A notice in Discord (and at the top of the Plugins tab) says why safe mode is on and names the most recent change that's still on: a plugin turned on, added or updated, its settings changed, a theme turned on or edited, or a Quick CSS edit. It offers **Disable &lt;it&gt; and restart** and **Exit safe mode and restart**. Turning a plugin on is written to disk before any of its code runs, so a plugin that crashes Discord the moment you enable it is still named. In safe mode you can still turn plugins and themes on and off; the changes apply once you leave it.

All plugins are off, official ones included. They're installed into the same folder as yours and there's no telling them apart on disk, and a Discord update can break an official plugin's source patch as easily as yours. The notice and the settings are part of Evi's core, so they still work.
## Message Logger

An official plugin, off by default. Deleted messages stay in the chat, tinted red and marked **Deleted**, and edited messages show their previous versions under them, rendered with Discord's own markdown. Messages you delete yourself vanish as usual. Settings: keep deleted messages, keep edit history, ignore my own deletes, ignore my own messages, ignore bots, and how many messages to log per channel (the oldest are forgotten past it). The settings card counts what's logged and has a **Clear logged messages** button.

Nothing is written to disk. It uses no source patches: it hooks MessageStore's own entries in the Flux dispatcher, so only MessageStore keeps a deleted message (unread counts and mentions still see the delete), and the exported function that renders a message's accessories. Turning it off really deletes the kept messages and hides every edit history.

## Writing a plugin

The full guide, including how to have Claude generate a plugin, is in [docs/plugins.md](docs/plugins.md).

A plugin is a folder in `plugins/` (official) or `userplugins/` (yours, gitignored):

```
plugins/my-plugin/
  manifest.json    { "id": "my-plugin", "name": "My Plugin", "description": "…" }
  index.ts(x)      renderer code, required
  native.ts        main-process code, optional
```

```tsx
import { definePlugin, filters } from "@evi/api";

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
import { definePlugin, findMenuGroup, Menu } from "@evi/api";

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
- **Menus.** `navId` is Discord's name for the menu: `"message"`, `"user-context"`, `"guild-context"`, `"channel-context"`, `"gdm-context"`… or `"*"` for all of them. `children` is the menu's item list; push to it, splice into it, or use `findMenuGroup(children, itemId)` to add next to one of Discord's items. It's a fresh copy on every render, groups included, so edits never touch Discord's own arrays. Items must be `Menu.Item`, `Menu.Group`, `Menu.Separator`, `Menu.CheckboxItem`, `Menu.RadioItem`, `Menu.SwitchItem` or `Menu.ControlItem`, Discord's own components (it rejects anything else). `props` holds what the menu was rendered with (the message and channel, the user, the guild...). It comes from a core source patch, shown as `evi` in the Patches tab, that adds the rendering component's props next to every `navId` in Discord's code. Where that isn't possible (class fields, module scope), `props` is `{}`.
- **Commands** are listed with Discord's built-ins (`/shrug`, `/tableflip`) and run locally. `args` maps option names to values. Option `type` is `"string"` (default), `"integer"`, `"number"`, `"boolean"`, `"user"`, `"channel"`, `"role"`, `"mentionable"` or `"attachment"`. Returning `{ content }` makes Discord send it as a message from you. A thrown error shows a failure toast.

The same functions exist outside `ctx` as `showToast`, `addContextMenuPatch` and `registerCommand`. The last two return a removal function you must call yourself.

Finders exported from `@evi/api`: `find`, `findAll`, `findByProps`, `findByCode`, `findComponent`, `findStore`, `findExport` (returns where the value lives, for hooking), lazy variants (`findByPropsLazy`…), `findModuleIds`, `requireModule`, `waitFor`. Common modules are `React`, `ReactDOM`, `createRoot`, `Dispatcher` and `getStore(name)`. Plugins may `import` `react` and use JSX. Both resolve to Discord's own React at runtime.

`native.ts` runs in the main process:

```ts
import type { NativePlugin } from "@evi/api/native";

export default {
    start(ctx) {
        ctx.onBeforeRequest(({ url }) => url.includes("/science") ? { cancel: true } : undefined);
    },
    async readConfig(path: string) { /* full Node + Electron access */ },
} satisfies NativePlugin;
```

**Hot reload rules.** Code, hooks, styles and settings reload live, and so do source patches in most cases. When a patch changes for a module that already ran, *live module replacement* (`src/renderer/patching/live.ts`) re-runs that module with the new patch set. It moves the fresh exports into the existing exports object, so every importer switches to the patched code, and it carries existing export hooks over. Some modules can't safely run twice: Flux stores, modules whose exports are a bare function, and modules that subscribe to Flux actions when they run (detected by diffing the dispatcher, and undone). Those fall back to a reload banner that says why. A patch can force the choice with `live: true` or `live: false`.

## Performance

`Evi.stats` counts what Evi adds to module loading. `bun run bench` measures it on the live bundle. On about 6,800 modules:

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
| `test:unit` | Hook engine (ordering, error isolation, exact restore, getters, construct, rebasing), finders through hooks, Patch Helper evaluation, theme parsing and remote checks, the menu props patch, backup validation/merge/replace, store registry validation and hashing, safe mode start thresholds and suspects, Quick Actions URLs |
| `test:web` | The renderer on the **live discord.com bundle** in headless Chrome (WebAuthn disabled so no passkey prompts): runtime capture, finders, source patches, hooks, hot reload, live module replacement, toasts, menu items, slash commands, Silent Typing, Quick Actions, Message Logger (against Discord's real MessageStore), and every UI tab (Plugins, Store, Themes, Quick CSS, Backup, Patches, Patch Helper, safe mode notice). Runs on Node because Playwright's transports hang under Bun on Windows. |
| `test:electron` | Main process and preload in real Electron against a fake Discord install: preload, IPC boot, native request blocking, live plugin install, themes (startup, live, ordering, remote), backup export and restore into a second profile, store install/update/uninstall against a local fake registry (tampered files rejected, native needs confirmation), safe mode (crash loops, `--evi-safe`, mid-session crashes), auto-injection after an update. `EVI_TEST_APP_NAME` gives parallel runs their own profile. |
| `test:cli` | Installer against a fake `%LOCALAPPDATA%`: install, reinstall, uninstall byte-for-byte, refusal to install over other mods. `evi update` against a local fake of GitHub's API (`EVI_UPDATE_API`): up to date, newer release, no releases, network and API errors. `--exe` runs it against the compiled binary and also checks checksum rejection, self-replacement on a copy of the exe, and that updates only refresh Discords that already have Evi |
| `test:installer` | Evi Setup (`dist/Evi-Setup.exe`, headless) against a fake `%LOCALAPPDATA%` and a fake GitHub: the loader matches the CLI's byte for byte, checksum mismatches and missing releases change nothing, removed/retired/your own plugins, `--latest` and the fallback to the latest release, uninstall of every version folder, other mods, flavors, the Delight rename |
| `test:plugins` | Fast Lists on a synthetic 185-server sidebar and chat: no visible row ever hidden, never writes the scroll position, never gets stuck scrolling up through loading history |

None of the tests touch your real Discord install or profile.

## CI

[![CI](https://github.com/BleedDev/evi/actions/workflows/ci.yml/badge.svg)](https://github.com/BleedDev/evi/actions/workflows/ci.yml)

Every push and pull request to `main` runs the build, typecheck and all the suites above on `windows-latest` (`.github/workflows/ci.yml`). The web and Electron suites load the live discord.com, so an outage or a change on Discord's side can fail a run. Everything in `test-results/` (screenshots, logs) is uploaded as an artifact on every run. The browser suites look for Chrome in its usual install folders; set `CHROME_PATH` to use another Chromium browser.
