import { describe, expect, test } from "bun:test";

import { evaluatePatch, parsePatchValue } from "../src/renderer/patching/helper";

// Method-shorthand factories, the way Discord's rspack build emits them
const sources: [string, string][] = [
    ["1", '1(e,t,n){n.d(t,{Z:()=>r});class r{constructor(){Object.defineProperties(this,{isDeveloper:{configurable:!1,get:()=>a}})}}}'],
    ["2", '2(e,t,n){let a="unrelated";t.x=a}'],
    ["3", '3(e,t,n){let a="unrelated twice";t.y=a}'],
];
const isDev = { find: "Object.defineProperties(this,{isDeveloper", match: String.raw`/(?<=isDeveloper:\{[^}]*?get:\(\)=>)\i/`, replace: "true" };

describe("patch helper", () => {
    test("parses /regex/flags and leaves other text as a string", () => {
        expect(parsePatchValue("/a.b/g")).toEqual(/a.b/g);
        expect(parsePatchValue("a.b")).toBe("a.b");
        expect(() => parsePatchValue("/(/")).toThrow(SyntaxError);
    });

    test("finds the module, expands \\i, and the method-shorthand factory compiles after patching", () => {
        const r = evaluatePatch(isDev, sources);
        expect(r.candidates).toEqual(["1"]);
        expect(r.matchCount).toBe(1);
        expect(r.match?.mark).toBe("a");
        expect(r.changed).toBe(true);
        expect(r.before?.mark).toBe("a");
        expect(r.after?.mark).toBe("true");
        expect(r.compile).toEqual({ ok: true });
        expect(r.snippet).toContain(String.raw`match: /(?<=isDeveloper:\{[^}]*?get:\(\)=>)\i/,`);
        expect(r.snippet).toContain('find: "Object.defineProperties(this,{isDeveloper",');
    });

    test("reports code that no longer compiles", () => {
        const r = evaluatePatch({ ...isDev, replace: "true)" }, sources);
        expect(r.compile?.ok).toBe(false);
    });

    test("expands $self and capture groups like the patcher does", () => {
        const r = evaluatePatch({ find: "isDeveloper", match: String.raw`/get:\(\)=>(\i)/`, replace: "get:()=>$self.check($1)" }, sources, undefined, "my-plugin");
        expect(r.after?.mark).toContain('Delight.$("my-plugin").check(a)');
        expect(r.groups).toEqual(["a"]);
        expect(r.compile).toEqual({ ok: true });
    });

    test("ambiguous finds list every module and honour the chosen one", () => {
        const r = evaluatePatch({ find: "unrelated", match: "unrelated", replace: "changed" }, sources, "3");
        expect(r.candidates).toEqual(["2", "3"]);
        expect(r.moduleId).toBe("3");
    });

    test("no match and invalid regex are reported, not thrown", () => {
        expect(evaluatePatch({ ...isDev, match: "nothing like this" }, sources).matchCount).toBe(0);
        expect(evaluatePatch({ ...isDev, match: "/(/" }, sources).errors.match).toContain("SyntaxError");
        expect(evaluatePatch({ ...isDev, find: "nope" }, sources).candidates).toEqual([]);
    });
});
