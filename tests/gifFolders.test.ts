import { describe, expect, test } from "bun:test";

import {
    addToFolder, cleanName, createFolder, deleteFolder, EMPTY, filterFavourites, FolderState, foldersContaining, getFolder, moveToFolder,
    nameError, parseState, PICKER_PATCH, pruneFolders, removeFromFolder, renameFolder, reorderFolder, toggleInFolder, UNSORTED,
    unsortedCount,
} from "../plugins/gif-folders/folders";
import type { Replacement } from "../src/renderer/patching/source";
import { canonicalizeMatch, matchesFind } from "../src/renderer/patching/source";

// Verbatim from Discord's web build (test-results/chunks), trimmed to the GIF picker's class methods
const PICKER_SOURCE = "class B{renderHeaderContent(){let{query:e,favorites:t,headingColor:r}=this.props,{resultType:s}=this.state;}"
    + 'renderContent(){let{contentClassName:e,resultItems:t,resultQuery:r,query:s,favorites:l,searchOffset:i,searchLimit:a,searchTotalResults:o,suggestions:u,hideFavorites:c}=this.props,{resultType:h}=this.state;return null==h?(0,n.jsx)(H,{className:e,hideFavoritesTile:c,onSelectItem:this.handleSelectItem}):(0,n.jsx)(L.Ay,{className:e,data:h===b.dD.FAVORITES?function(e,t){if(""===t)return e;let r=t.toLowerCase().replace(/[-_ ]/g,"");return e.filter(e=>{let{url:t}=e;return t.toLowerCase().replace(/[-_]/g,"").includes(r)})}(l,s):t,onSelectGIF:this.handleSelectGIF,resultType:h,resultQuery:r,query:s,searchOffset:i,searchLimit:a,searchTotalResults:o,suggestions:u,onSelectSuggestion:this.handleSelectSuggestion,selectedGIF:this.props.selectedGIF})}'
    + 'render(){let{className:e,forwardedRef:t}=this.props;return(0,n.jsxs)("div",{id:W.ni,role:"tabpanel","aria-labelledby":W.g9,className:i()(K.kL,e),onClick:q,ref:t,children:[(0,n.jsx)("div",{className:i()(K.wx,this.props.headerClassName),children:this.renderHeader()}),(0,n.jsx)("div",{className:K.Qs,children:this.renderContent()})]})}}';

const replacements = ([] as Replacement[]).concat(PICKER_PATCH.replace);
const applyOne = (code: string, r: Replacement) => code.replace(canonicalizeMatch(r.match) as RegExp, (r.with as string).replaceAll("$self", "S"));

function withFolders(...names: string[]) {
    let state: FolderState = EMPTY;
    names.forEach((name, i) => void (state = createFolder(state, name, `f${i}`).state));
    return state;
}

describe("gif folders: folder CRUD", () => {
    test("create trims names, rejects empty and duplicate (case-insensitive) names", () => {
        const a = createFolder(EMPTY, "  Reactions  ", "a");
        expect(a.folder).toEqual({ id: "a", name: "Reactions", urls: [] });
        expect(createFolder(a.state, "reactions", "b").folder).toBeUndefined();
        expect(createFolder(a.state, "reactions", "b").state).toBe(a.state);
        expect(createFolder(a.state, "   ", "b").folder).toBeUndefined();
        expect(createFolder(a.state, "Other", "a").folder).toBeUndefined();
        expect(nameError(a.state, "")).toBeTruthy();
        expect(nameError(a.state, "REACTIONS")).toBeTruthy();
        expect(nameError(a.state, "REACTIONS", "a")).toBeNull();
        expect(cleanName("x".repeat(100)).length).toBe(32);
        expect(EMPTY.folders).toEqual([]);
    });

    test("rename keeps urls and refuses taken names", () => {
        let state = addToFolder(withFolders("Cats", "Dogs"), "f0", "u1");
        state = renameFolder(state, "f0", "Kittens");
        expect(getFolder(state, "f0")).toEqual({ id: "f0", name: "Kittens", urls: ["u1"] });
        expect(renameFolder(state, "f0", "dogs")).toBe(state);
        expect(renameFolder(state, "f0", "")).toBe(state);
        expect(renameFolder(state, "missing", "New")).toBe(state);
    });

    test("delete and reorder", () => {
        const state = withFolders("A", "B", "C");
        expect(deleteFolder(state, "f1").folders.map(f => f.name)).toEqual(["A", "C"]);
        expect(deleteFolder(state, "nope")).toBe(state);
        expect(reorderFolder(state, "f2", 0).folders.map(f => f.name)).toEqual(["C", "A", "B"]);
        expect(reorderFolder(state, "f0", 99).folders.map(f => f.name)).toEqual(["B", "C", "A"]);
        expect(reorderFolder(state, "f0", 0)).toBe(state);
    });

    test("never mutates its input", () => {
        const state = withFolders("A");
        const frozen = JSON.stringify(state);
        addToFolder(state, "f0", "u");
        renameFolder(state, "f0", "B");
        deleteFolder(state, "f0");
        expect(JSON.stringify(state)).toBe(frozen);
    });
});

describe("gif folders: GIFs in folders", () => {
    test("add puts newest first without duplicates, remove and toggle", () => {
        let state = withFolders("A");
        state = addToFolder(state, "f0", "u1");
        state = addToFolder(state, "f0", "u2");
        expect(addToFolder(state, "f0", "u1")).toBe(state);
        expect(addToFolder(state, "f0", "")).toBe(state);
        expect(getFolder(state, "f0")?.urls).toEqual(["u2", "u1"]);
        expect(getFolder(removeFromFolder(state, "f0", "u2"), "f0")?.urls).toEqual(["u1"]);
        expect(removeFromFolder(state, "f0", "zzz")).toBe(state);
        expect(getFolder(toggleInFolder(state, "f0", "u1"), "f0")?.urls).toEqual(["u2"]);
        expect(getFolder(toggleInFolder(state, "f0", "u3"), "f0")?.urls).toEqual(["u3", "u2", "u1"]);
        expect(toggleInFolder(state, "missing", "u3")).toBe(state);
    });

    test("a GIF can live in several folders; move takes it out of one into another", () => {
        let state = withFolders("A", "B", "C");
        state = addToFolder(addToFolder(state, "f0", "u"), "f1", "u");
        expect(foldersContaining(state, "u")).toEqual(["f0", "f1"]);
        state = moveToFolder(state, "u", "f0", "f2");
        expect(foldersContaining(state, "u")).toEqual(["f1", "f2"]);
        expect(moveToFolder(state, "u", "f1", "f1")).toBe(state);
        expect(moveToFolder(state, "u", "f1", "missing")).toBe(state);
    });

    test("prune drops URLs that aren't favourites any more, but not when favourites look unloaded", () => {
        let state = withFolders("A", "B");
        state = addToFolder(addToFolder(addToFolder(state, "f0", "keep"), "f0", "gone"), "f1", "keep");
        const pruned = pruneFolders(state, ["keep", "other"]);
        expect(getFolder(pruned, "f0")?.urls).toEqual(["keep"]);
        expect(pruned.folders[1]).toBe(state.folders[1]);
        expect(pruneFolders(pruned, ["keep"])).toBe(pruned);
        expect(pruneFolders(state, [])).toBe(state);
    });

    test("filter keeps Discord's order and shows everything for All or a deleted folder", () => {
        const items = [{ url: "c" }, { url: "b" }, { url: "a" }];
        let state = withFolders("A");
        state = addToFolder(addToFolder(state, "f0", "a"), "f0", "c");
        expect(filterFavourites(items, state, "f0")).toEqual([{ url: "c" }, { url: "a" }]);
        expect(filterFavourites(items, state, null)).toBe(items);
        expect(filterFavourites(items, state, "gone")).toBe(items);
        expect(filterFavourites(items, withFolders("Empty"), "f0")).toEqual([]);
    });
});

describe("gif folders: Unsorted tab and one folder per GIF", () => {
    const items = [{ url: "a" }, { url: "b" }, { url: "c" }];

    test("All shows everything, Unsorted only the favourites in no folder", () => {
        const state = addToFolder(addToFolder(withFolders("A", "B"), "f0", "b"), "f1", "c");
        expect(filterFavourites(items, state, null)).toBe(items);
        expect(filterFavourites(items, state, UNSORTED)).toEqual([{ url: "a" }]);
        expect(filterFavourites(items, EMPTY, UNSORTED)).toEqual(items);
        expect(unsortedCount(state, ["a", "b", "c"])).toBe(1);
        expect(unsortedCount(EMPTY, ["a", "b"])).toBe(2);
    });

    test("the Unsorted id can't clash with a real folder id", () => {
        expect(UNSORTED).toContain(":");
        expect(createFolder(EMPTY, "Unsorted").folder?.id).not.toBe(UNSORTED);
    });

    test("exclusive toggle moves a GIF; non-exclusive keeps it in several folders", () => {
        let state = addToFolder(withFolders("A", "B", "C"), "f0", "x");
        state = addToFolder(state, "f2", "x");
        const shared = toggleInFolder(state, "f1", "x");
        expect(foldersContaining(shared, "x")).toEqual(["f0", "f1", "f2"]);
        const moved = toggleInFolder(state, "f1", "x", true);
        expect(foldersContaining(moved, "x")).toEqual(["f1"]);
        // Unticking the folder it's in just takes it out, exclusive or not
        expect(foldersContaining(toggleInFolder(moved, "f1", "x", true), "x")).toEqual([]);
        expect(toggleInFolder(state, "missing", "x", true)).toBe(state);
    });
});

describe("gif folders: stored data", () => {
    test("parse survives garbage and cleans broken entries", () => {
        expect(parseState(undefined)).toEqual(EMPTY);
        expect(parseState("nope")).toEqual(EMPTY);
        expect(parseState({ folders: "x" })).toEqual(EMPTY);
        expect(parseState({
            folders: [
                { id: "a", name: " A ", urls: ["u1", "u1", 3, "", "u2"] },
                { id: "a", name: "Dup id", urls: [] },
                { id: "b", name: "", urls: [] },
                { name: "No id" },
                null,
                { id: "c", name: "C" },
            ],
        })).toEqual({ folders: [{ id: "a", name: "A", urls: ["u1", "u2"] }, { id: "c", name: "C", urls: [] }] });
    });

    test("round-trips through JSON", () => {
        const state = addToFolder(withFolders("A", "B"), "f1", "https://media.tenor.com/x.gif");
        expect(parseState(JSON.parse(JSON.stringify(state)))).toEqual(state);
    });
});

describe("gif folders: GIF picker patch", () => {
    test("matches Discord's picker, each replacement once, and still parses", () => {
        expect(matchesFind(PICKER_SOURCE, PICKER_PATCH.find)).toBe(true);
        let next = PICKER_SOURCE;
        for (const r of replacements) {
            const re = canonicalizeMatch(r.match) as RegExp;
            expect(PICKER_SOURCE.match(new RegExp(re.source, "g"))?.length).toBe(1);
            const before = next;
            next = applyOne(next, r);
            expect(next).not.toBe(before);
        }
        expect(next).toContain('function(e,t){e=S?.filterFavorites?.(e)??e;if(""===t)return e;');
        expect(next).toContain("children:[this.renderHeader(),S?.renderFolderBar?.(this)]}");
        expect(() => new Function(`return ${next}`)).not.toThrow();
    });

    test("patched code runs: filters favourites before search, falls back when the plugin is off", () => {
        const patched = applyOne(PICKER_SOURCE, replacements[0]);
        const body = patched.match(/FAVORITES\?(function\(e,t\)\{.*?\})\(l,s\)/)![1];
        const make = (S: unknown) => new Function("S", `return ${body}`)(S) as (items: { url: string; }[], query: string) => { url: string; }[];
        const items = [{ url: "cat-one" }, { url: "dog" }, { url: "cat-two" }];
        const on = make({ filterFavorites: (list: { url: string; }[]) => list.filter(i => i.url !== "cat-two") });
        expect(on(items, "")).toEqual([{ url: "cat-one" }, { url: "dog" }]);
        expect(on(items, "cat")).toEqual([{ url: "cat-one" }]);
        expect(make(undefined)(items, "cat")).toEqual([{ url: "cat-one" }, { url: "cat-two" }]);
    });
});
