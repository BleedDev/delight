import { describe, expect, test } from "bun:test";

import { fillDays, parseDevLive } from "../src/shared/devLive";

describe("the developers' numbers", () => {
    test("anything malformed becomes zero or is left out", () => {
        const live = parseDevLive({
            at: 5,
            now: { online: -3, connections: "x", versions: [{ version: "1.4.3", count: 2.7 }, { count: 1 }] },
            days: [{ day: "2026-10-01", active: 4, peak: 2 }, { day: "nope", active: 1 }],
            topPlugins: [{ id: "view-icons", installs: 9 }],
        });
        expect(live.now).toEqual({ online: 0, connections: 0, versions: [{ version: "1.4.3", count: 2 }, { version: "unknown", count: 1 }] });
        expect(live.days).toEqual([{ day: "2026-10-01", active: 4, peak: 2 }]);
        expect(live.topPlugins).toEqual([{ id: "view-icons", name: "view-icons", installs: 9 }]);
        expect(live.store).toEqual({ plugins: 0, waiting: 0, reports: 0 });
        expect(parseDevLive(null).today).toEqual({ active: 0, peak: 0 });
    });

    test("days evi.rest has no row for are zero, today last", () => {
        const days = fillDays([{ day: "2026-09-30", active: 7, peak: 3 }], "2026-10-01", 3);
        expect(days).toEqual([
            { day: "2026-09-29", active: 0, peak: 0 },
            { day: "2026-09-30", active: 7, peak: 3 },
            { day: "2026-10-01", active: 0, peak: 0 },
        ]);
    });
});
