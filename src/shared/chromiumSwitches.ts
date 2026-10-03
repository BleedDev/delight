/**
 * Chromium reads a switch given twice as its last value, so Discord's own startup code (which sets
 * --disable-features after Evi applied plugins' switches) would silently drop the features Evi and
 * plugins asked for. These switches hold comma-separated lists, which can be merged instead.
 */
export const LIST_SWITCHES: ReadonlySet<string> = new Set(["enable-features", "disable-features", "enable-blink-features", "disable-blink-features"]);

/** Both lists, in order, each entry once */
export function mergeSwitchList(existing: string, added: string) {
    const entries = [...existing.split(","), ...added.split(",")].map(e => e.trim()).filter(Boolean);
    return [...new Set(entries)].join(",");
}
