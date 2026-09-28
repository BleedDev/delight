/**
 * The Plugins tab's search, over what a plugin is (name, description, id, authors) and over its
 * settings: "blur" finds Streamer Mode+ by its "Blur images" setting, even though its name doesn't say.
 */

interface SearchableSetting {
    type: string;
    label: string;
    description?: string;
    options?: readonly { label: string; }[];
}

export interface SearchablePlugin {
    name: string;
    description?: string;
    id: string;
    authors: string[];
    settings?: Record<string, SearchableSetting>;
}

const has = (text: string | undefined, q: string) => !!text && text.toLowerCase().includes(q);

/** Keys of the settings `q` (lowercase, trimmed) finds, by label, description or an option's label */
export function matchingSettings(settings: SearchablePlugin["settings"], q: string): string[] {
    if (!q || !settings) return [];
    return Object.entries(settings)
        .filter(([, s]) => has(s.label, q) || has(s.description, q) || !!s.options?.some(o => has(o.label, q)))
        .map(([key]) => key);
}

export function matchesPlugin(p: SearchablePlugin, q: string): boolean {
    if (!q) return true;
    return has(`${p.name} ${p.description ?? ""} ${p.id} ${p.authors.join(" ")}`, q) || matchingSettings(p.settings, q).length > 0;
}

export interface KeybindOwner {
    pluginId: string;
    pluginName: string;
    key: string;
    label: string;
    value: string;
}

/**
 * Who else has `value` as their shortcut, as "Plugin: Setting". Only turned-on plugins count: a
 * shortcut in a plugin that's off doesn't run.
 */
export function keybindConflict(owners: KeybindOwner[], value: string, self: { pluginId: string; key: string; }): string | undefined {
    const other = owners.find(o => o.value === value && !(o.pluginId === self.pluginId && o.key === self.key));
    return other && `${other.pluginName}: ${other.label}`;
}
