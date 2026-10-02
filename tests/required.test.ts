import { describe, expect, test } from "bun:test";

import { mustUpdate, parseRequired, parseRequiredInput } from "../src/shared/required";

describe("a required Evi version", () => {
    test("reads what evi.rest sends, and nothing from anything malformed", () => {
        expect(parseRequired({ required: { version: "2.0.1", reason: " Fixes\n toasts ", forcePlugins: true, at: 5 } })).toEqual({ version: "2.0.1", reason: "Fixes toasts", forcePlugins: true, at: 5 });
        expect(parseRequired({ required: null })).toBeNull();
        expect(parseRequired({ required: { version: "nope" } })).toBeNull();
        expect(parseRequired(null)).toBeNull();
        expect(parseRequired({ required: { version: "2.0.1", reason: "x".repeat(500) } })!.reason).toHaveLength(200);
    });

    test("an admin can only require a released version", () => {
        expect(parseRequiredInput({ version: "v2.0.1" })).toEqual({ version: "2.0.1", reason: "", forcePlugins: false });
        expect(parseRequiredInput({ version: "2.0.1-beta.1" })).toHaveProperty("error");
        expect(parseRequiredInput({ version: "" })).toHaveProperty("error");
        expect(parseRequiredInput({ version: "2.0.1", reason: "x".repeat(201) })).toHaveProperty("error");
    });

    test("older Evis must update; that version, newer ones and its betas don't", () => {
        const required = { version: "2.0.1", reason: "", forcePlugins: false, at: 0 };
        expect(mustUpdate(required, "1.5.0")).toBe(true);
        expect(mustUpdate(required, "2.0.0")).toBe(true);
        expect(mustUpdate(required, "2.0.0-beta.3")).toBe(true);
        expect(mustUpdate(required, "2.0.1")).toBe(false);
        expect(mustUpdate(required, "2.0.1-beta.1")).toBe(false);
        expect(mustUpdate(required, "2.1.0")).toBe(false);
        expect(mustUpdate(null, "1.0.0")).toBe(false);
    });
});
