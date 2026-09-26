/**
 * Client-side slash commands, listed with Discord's built-ins (/shrug, /tableflip...) and run locally.
 *
 * Discord's command picker asks one function for the built-in commands every time it searches:
 * `getBuiltInCommands(commandTypes, includeAll, textOnly)` in the module that defines /tableflip.
 * An after-hook appends ours. Discord then calls `command.execute(options, context)` itself, and for
 * BUILT_IN_TEXT commands sends the returned `{ content }` as a message.
 */
import { Logger } from "../logger";
import { functionSource } from "../webpack/find";
import { inModulesWith, SharedHook } from "./shared";
import { showToast } from "./toasts";

const logger = new Logger("Commands", "#5865f2");

/** Discord's application command option types (public API values) */
export const CommandOptionType = {
    STRING: 3,
    INTEGER: 4,
    BOOLEAN: 5,
    USER: 6,
    CHANNEL: 7,
    ROLE: 8,
    MENTIONABLE: 9,
    NUMBER: 10,
    ATTACHMENT: 11,
} as const;

export type CommandOptionTypeName = Lowercase<keyof typeof CommandOptionType>;

export interface CommandOption {
    name: string;
    description: string;
    /** Default "string" */
    type?: CommandOptionTypeName | number;
    required?: boolean;
    choices?: { name: string; value: string | number; }[];
}

export interface CommandContext {
    /** The channel the command was used in */
    channel: any;
    /** Its guild, if any */
    guild?: any;
    /** Discord's parsed options, as passed to built-in commands */
    rawOptions: { name: string; type: number; value: any; }[];
}

/** Return this from execute to have Discord send it as a message from you */
export interface CommandResult {
    content: string;
    tts?: boolean;
}

export interface CommandDefinition {
    /** Lowercase, no spaces, as typed after the slash */
    name: string;
    description: string;
    options?: CommandOption[];
    /** Hide the command where this returns false */
    predicate?(context: { channel: any; guild?: any; }): boolean;
    /** `args` maps option names to their values (user, channel and role options give ids) */
    execute(args: Record<string, any>, context: CommandContext): void | CommandResult | Promise<void | CommandResult>;
}

// Discord's own values, used if its /shrug can't be read at runtime
const CHAT_INPUT = 1;
const BUILT_IN_TEXT = 1;
const BUILT_IN_APPLICATION_ID = "-1";

const commands = new Map<string, any>();
let nextId = 10000;

function toDiscordCommand(def: CommandDefinition, owner: string) {
    const option = (o: CommandOption) => ({
        name: o.name,
        displayName: o.name,
        description: o.description,
        displayDescription: o.description,
        type: typeof o.type === "number" ? o.type : CommandOptionType[(o.type ?? "string").toUpperCase() as keyof typeof CommandOptionType],
        required: o.required ?? false,
        choices: o.choices?.map(c => ({ name: c.name, displayName: c.name, value: c.value })),
    });

    return {
        id: `-${nextId++}`,
        untranslatedName: def.name,
        displayName: def.name,
        untranslatedDescription: def.description,
        displayDescription: def.description,
        type: CHAT_INPUT,
        inputType: BUILT_IN_TEXT,
        applicationId: BUILT_IN_APPLICATION_ID,
        options: def.options?.map(option),
        predicate: def.predicate,
        delightOwner: owner,
        execute: async (rawOptions: CommandContext["rawOptions"], context: { channel: any; guild?: any; }) => {
            const args: Record<string, any> = {};
            for (const o of rawOptions ?? []) args[o.name] = o.value;
            try {
                const result = await def.execute(args, { channel: context?.channel, guild: context?.guild, rawOptions });
                if (result && typeof result.content === "string" && result.content) return result;
            } catch (err) {
                logger.error(`/${def.name} (${owner}) threw`, err);
                showToast(`/${def.name} failed: ${err instanceof Error ? err.message : err}`, { type: "failure" });
            }
        },
    };
}

/** getBuiltInCommands: filters Discord's built-in list by command type and input type */
export const builtInCommandsFilter = inModulesWith(["\"tableflip\"", "\"unflip\""], v => {
    if (typeof v !== "function" || v.length !== 3) return false;
    const src = functionSource(v);
    return src.includes(".filter(") && src.includes(".inputType===");
});

const commandsHook = new SharedHook(builtInCommandsFilter, "after", ({ args, result }) => {
    if (!commands.size || !Array.isArray(result)) return;
    const [types, , textOnly] = args as [number[], boolean, boolean];

    // Copy Discord's own values from /shrug (a text built-in like ours), in case its enums change
    const shrug = result.find((c: any) => c?.untranslatedName === "shrug");
    const ours = [...commands.values()].filter(c => {
        if (shrug) Object.assign(c, { type: shrug.type, inputType: shrug.inputType, applicationId: shrug.applicationId });
        return (!Array.isArray(types) || types.includes(c.type)) && (!textOnly || !shrug || c.inputType === shrug.inputType);
    });
    return ours.length ? [...result, ...ours] : undefined;
});

/** Registers a slash command. Returns a function that removes it. */
export function registerCommand(def: CommandDefinition, owner = "unknown"): () => void {
    if (!/^[-_\p{L}\p{N}]{1,32}$/u.test(def.name) || def.name !== def.name.toLowerCase()) {
        throw new Error(`Invalid command name "${def.name}": lowercase letters, numbers, - and _ only`);
    }
    for (const existing of commands.values()) {
        if (existing.untranslatedName === def.name) logger.warn(`/${def.name} is registered twice (${existing.delightOwner}, ${owner})`);
    }

    const command = toDiscordCommand(def, owner);
    commands.set(command.id, command);
    const release = commandsHook.acquire();
    return () => {
        commands.delete(command.id);
        release();
    };
}

/** Whether Discord's built-in command list is currently hooked */
export const isCommandsHooked = () => commandsHook.installed;

/** Currently registered commands, as Discord sees them */
export const getRegisteredCommands = () => [...commands.values()];
