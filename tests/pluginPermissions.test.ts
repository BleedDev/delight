import { describe, expect, test } from "bun:test";

import { analyzePermissions, cleanSwitches, riskSummary, scanBundle } from "../src/shared/pluginPermissions";

/** A bundle the way Bun builds a plugin: CommonJS, @evi/api required as import_api, not minified */
const bundle = (body: string) => `var import_api = require("@evi/api");
// plugins/demo/index.ts
${body}
module.exports = { default: plugin };`;

const ids = (code: string, extra: Parameters<typeof analyzePermissions>[0] = {}) =>
    analyzePermissions({ code, ...extra }).capabilities.map(c => c.id);

describe("plugin permissions: static scan", () => {
    test("source patches: counts them and reads their finds", () => {
        const code = bundle(`var plugin = (0, import_api.definePlugin)({
  patches: [
    { find: "Object.defineProperties(this,{isDeveloper", replace: { match: /isDeveloper/, replace: "x" } },
    { find: /\\.USER_SETTINGS\\b/, replace: [] },
  ],
});`);
        const found = scanBundle(code);
        expect(found.hasPatches).toBe(true);
        expect(found.patchCount).toBe(2);
        expect(found.patchFinds).toEqual(["Object.defineProperties(this,{isDeveloper", "/\\.USER_SETTINGS\\b/"]);

        const patches = analyzePermissions({ code }).capabilities.find(c => c.id === "patches")!;
        expect(patches.risk).toBe("medium");
        expect(patches.title).toContain("2 patches");
        expect(patches.details[0]).toBe('Find "Object.defineProperties(this,{isDeveloper"');
    });

    test("patches defined elsewhere: counted from the array, finds read from objects with a replace", () => {
        const code = bundle(`var PATCHES = {
  a: { find: "renderHeaderContent(){", replace: { match: /x/, replace: "y" } },
  b: { find: '"user-volume",label:', replace: { match: /x/, replace: "y" } },
};
var notAPatch = { find: "just a key" };
var plugin = { patches: [PATCHES.a, PATCHES.b] };`);
        const found = scanBundle(code);
        expect(found.patchCount).toBe(2);
        expect(found.patchFinds).toEqual(["renderHeaderContent(){", '"user-volume",label:']);
    });

    test("the evaluated plugin's patches win over the scan", () => {
        const report = analyzePermissions({ code: bundle("var plugin = { patches: [P] };"), patches: [{ find: "a" }, { find: "b" }, { find: /c/ }] });
        const patches = report.capabilities.find(c => c.id === "patches")!;
        expect(patches.title).toContain("3 patches");
        expect(patches.details).toEqual(['Find "a"', 'Find "b"', "Find /c/"]);
    });

    test("hooks, flux, menus, commands and css", () => {
        const code = bundle(`var plugin = {
  css: ".x { color: red }",
  flux: {
    MESSAGE_CREATE(action) { if (action.type) {} },
    "CHANNEL_SELECT": function (a) {},
  },
  start(ctx) {
    ctx.hookExport("before", import_api.filters.byProps("sendMessage"), "sendMessage", () => {});
    ctx.hook.after(store, "getMessages", () => {});
    ctx.flux.subscribe("PRESENCE_UPDATES", () => {});
    ctx.contextMenu("message", () => {});
    ctx.contextMenu(["user-context", "guild-context"], () => {});
    ctx.command({ name: "roll", description: "Roll a die", execute() {} });
    ctx.flux.dispatch({ type: "X" });
  },
};`);
        const found = scanBundle(code);
        expect(found.hooks).toBe(2);
        expect(found.hookNames.sort()).toEqual(["getMessages", "sendMessage"]);
        expect(found.flux.sort()).toEqual(["CHANNEL_SELECT", "MESSAGE_CREATE", "PRESENCE_UPDATES"]);
        expect(found.fluxDispatch).toBe(true);
        expect(found.menus).toEqual(["message", "user-context", "guild-context"]);
        expect(found.commands).toEqual(["roll"]);
        expect(found.css).toBe(true);

        const report = analyzePermissions({ code });
        expect(report.risk).toBe("low");
        expect(report.capabilities.map(c => c.id)).toEqual(["hooks", "flux", "menus", "commands", "css"]);
        expect(report.capabilities.find(c => c.id === "commands")!.details).toEqual(["/roll"]);
        expect(report.capabilities.find(c => c.id === "flux")!.details).toContain("Sends events");
    });

    test("flux keys are only the object's own, not what its handlers use", () => {
        const found = scanBundle(bundle(`var plugin = { flux: { MESSAGE_DELETE(a) { const x = { NOT_A_KEY: 1 }; foo(BAR_BAZ); } } };`));
        expect(found.flux).toEqual(["MESSAGE_DELETE"]);
    });

    test("network: fetch and friends, with the domains in the code", () => {
        const code = bundle(`var plugin = { async start() {
  const r = await fetch("https://api.example.net/v1/thing?x=1");
  new WebSocket("wss://live.example.net/socket");
  const svg = "http://www.w3.org/2000/svg";
  const cdn = "https://cdn.discordapp.com/avatars/1.png";
} };`);
        const found = scanBundle(code);
        expect(found.network).toEqual(["fetch", "WebSocket"]);
        expect(found.domains).toEqual(["api.example.net", "live.example.net"]);
        expect(found.discordDomains).toEqual(["cdn.discordapp.com"]);

        const network = analyzePermissions({ code }).capabilities[0];
        expect(network.id).toBe("network");
        expect(network.risk).toBe("medium");
        expect(network.details).toEqual(["Uses fetch, WebSocket", "api.example.net", "live.example.net", "Discord: cdn.discordapp.com"]);
    });

    test("method calls named fetch aren't network access, and URLs alone are only links", () => {
        const code = bundle(`var plugin = { start() {
  store.fetchMessages(1); api.fetch(2);
  window.open("https://translate.google.com/?text=" + t, "_blank");
} };`);
        const found = scanBundle(code);
        expect(found.network).toEqual([]);
        const report = analyzePermissions({ code });
        expect(report.capabilities.map(c => c.id)).toEqual(["links"]);
        expect(report.capabilities[0].risk).toBe("low");
        expect(report.capabilities[0].details).toEqual(["translate.google.com"]);
    });

    test("comment lines don't count", () => {
        expect(ids(bundle("// see https://docs.example.com and fetch(x)\nvar plugin = {};"))).toEqual([]);
    });

    test("clipboard: writing is low, reading is medium", () => {
        expect(analyzePermissions({ code: bundle("navigator.clipboard.writeText(x);") }).capabilities[0]).toMatchObject({ id: "clipboard", risk: "low" });
        expect(analyzePermissions({ code: bundle("await navigator.clipboard.readText();") }).capabilities[0]).toMatchObject({ id: "clipboard", risk: "medium" });
    });

    test("storage, settings, Discord data and dynamic code", () => {
        const code = bundle(`var plugin = {
  settings: { loud: { type: "boolean", label: "Loud", default: false } },
  start(ctx) {
    indexedDB.open("x"); localStorage.getItem("y");
    const Users = (0, import_api.findStore)("UserStore");
    const Channels = (0, import_api.getStore)("ChannelStore");
    eval(code);
  },
};`);
        const report = analyzePermissions({ code });
        const byId = Object.fromEntries(report.capabilities.map(c => [c.id, c]));
        expect(byId.storage.details).toEqual(["IndexedDB", "localStorage"]);
        expect(byId.storage.risk).toBe("low");
        expect(byId.settings).toBeDefined();
        expect(byId.discordData.details).toEqual(["ChannelStore", "UserStore"]);
        expect(byId.dynamicCode.risk).toBe("medium");
        expect(report.risk).toBe("medium");
    });

    test("cookies are medium", () => {
        expect(analyzePermissions({ code: bundle("const c = document.cookie;") }).capabilities[0]).toMatchObject({ id: "storage", risk: "medium" });
    });
});

describe("plugin permissions: native code and the overall picture", () => {
    test("native.js is high risk and listed first, from the manifest or the registry", () => {
        const fromManifest = analyzePermissions({ code: bundle("var plugin = { css: 'a{}' };"), manifest: { native: "native.js" } });
        expect(fromManifest.risk).toBe("high");
        expect(fromManifest.capabilities[0].id).toBe("native");
        expect(fromManifest.capabilities[0].description).toContain("Runs outside Discord with full access to your computer");
        expect(analyzePermissions({ native: true }).risk).toBe("high");
    });

    test("Chromium switches count as native", () => {
        const report = analyzePermissions({ manifest: { chromiumSwitches: { "enable-zero-copy": true, "force-gpu-mem": "512" } } });
        expect(report.risk).toBe("high");
        expect(report.capabilities[0].details).toEqual(["Chromium switch --enable-zero-copy", "Chromium switch --force-gpu-mem=512"]);
    });

    test("runtime usage adds what the scan couldn't see", () => {
        const report = analyzePermissions({
            code: bundle("var plugin = {};"),
            runtime: { hooks: ["dispatch"], flux: ["MESSAGE_CREATE"], menus: ["*"], commands: ["hello"], styles: 1 },
        });
        expect(report.capabilities.map(c => c.id)).toEqual(["hooks", "flux", "menus", "commands", "css"]);
        expect(report.capabilities.find(c => c.id === "menus")!.details).toEqual(["Every menu"]);
    });

    test("a plugin that does nothing special, and one that wasn't scanned", () => {
        const empty = analyzePermissions({ code: bundle("var plugin = { start() { console.log(1); } };") });
        expect(empty).toEqual({ capabilities: [], risk: "low", scanned: true });
        expect(riskSummary(empty)).toContain("Nothing found");
        expect(analyzePermissions({}).scanned).toBe(false);
    });

    test("long detail lists are capped", () => {
        const flux = Array.from({ length: 20 }, (_, i) => `ctx.flux.subscribe("EVENT_${i}", f);`).join("\n");
        const details = analyzePermissions({ code: bundle(flux) }).capabilities[0].details;
        expect(details.length).toBe(13);
        expect(details.at(-1)).toBe("and 8 more");
    });

    test("scanning a real-sized bundle is quick", () => {
        const big = bundle(Array.from({ length: 4000 }, (_, i) => `function f${i}(a) { return a.b${i} + "https://x${i % 7}.example.org"; }`).join("\n"));
        const t = performance.now();
        analyzePermissions({ code: big });
        expect(performance.now() - t).toBeLessThan(500);
    });

    test("Chromium switches from an untrusted manifest are cleaned", () => {
        expect(cleanSwitches({ "ok-flag": true, "val": "1", "bad flag": true, "num": 3 })).toEqual({ "ok-flag": true, "val": "1" });
        expect(cleanSwitches(["a"])).toBeUndefined();
        expect(cleanSwitches(null)).toBeUndefined();
    });
});
