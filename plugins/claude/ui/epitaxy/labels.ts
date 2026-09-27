// Tool-row labels, ported from Claude Code web's label table: verbs (running / done / failed), meta,
// and the description conjugation ("Show README" -> "Showing README…" / "Showed README…").

const IRREGULAR_PAST: Record<string, string> = {
    begin: "began",
    bind: "bound",
    bring: "brought",
    build: "built",
    buy: "bought",
    catch: "caught",
    choose: "chose",
    come: "came",
    cut: "cut",
    debug: "debugged",
    dig: "dug",
    do: "did",
    draw: "drew",
    feed: "fed",
    feel: "felt",
    fight: "fought",
    find: "found",
    fly: "flew",
    forget: "forgot",
    freeze: "froze",
    get: "got",
    give: "gave",
    go: "went",
    have: "had",
    hide: "hid",
    hit: "hit",
    hold: "held",
    input: "input",
    keep: "kept",
    know: "knew",
    lead: "led",
    leave: "left",
    let: "let",
    lose: "lost",
    make: "made",
    mean: "meant",
    meet: "met",
    override: "overrode",
    overwrite: "overwrote",
    pay: "paid",
    put: "put",
    quit: "quit",
    read: "read",
    rebuild: "rebuilt",
    redo: "redid",
    rerun: "reran",
    reset: "reset",
    rewrite: "rewrote",
    run: "ran",
    see: "saw",
    seek: "sought",
    send: "sent",
    set: "set",
    show: "showed",
    shut: "shut",
    sit: "sat",
    sleep: "slept",
    spend: "spent",
    spin: "spun",
    split: "split",
    spread: "spread",
    stand: "stood",
    sweep: "swept",
    sync: "synced",
    take: "took",
    teach: "taught",
    tear: "tore",
    tell: "told",
    think: "thought",
    throw: "threw",
    understand: "understood",
    undo: "undid",
    unset: "unset",
    win: "won",
    unwrap: "unwrapped",
    unzip: "unzipped",
    write: "wrote",
};
const IRREGULAR_ING: Record<string, string> = {
    begin: "beginning",
    commit: "committing",
    control: "controlling",
    debug: "debugging",
    emit: "emitting",
    equip: "equipping",
    forget: "forgetting",
    format: "formatting",
    input: "inputting",
    occur: "occurring",
    omit: "omitting",
    output: "outputting",
    permit: "permitting",
    prefer: "preferring",
    quit: "quitting",
    refer: "referring",
    rerun: "rerunning",
    reset: "resetting",
    screenshot: "screenshotting",
    snapshot: "snapshotting",
    submit: "submitting",
    sync: "syncing",
    transfer: "transferring",
    unset: "unsetting",
    unwrap: "unwrapping",
    unzip: "unzipping",
};
const PARTICIPLES = new Set([
    ...Object.entries(IRREGULAR_PAST)
        .filter(([a, b]) => a !== b)
        .map(([, b]) => b),
    ..."been broken chosen done drawn driven eaten fallen forgotten given gone grown hidden known ridden risen seen shown spoken taken thrown torn worn written".split(" "),
]);
const REGULAR =
    "add analyze append apply archive assert attempt audit autofix await benchmark bisect call capture check click clone collect compare compile compute confirm connect convert copy count create curl decode delete deploy detect disable discard dismiss display download dump edit emit enable encode ensure enumerate evaluate execute expand expect export extract fetch fill filter fix flush focus follow generate grep identify ignore import include inject insert inspect install invoke kill launch lint list load locate loop measure merge monitor move navigate normalize parse patch pick ping pipe poll post prepare preview print probe profile prune publish pull push queue rebase recheck record recover redirect reduce refresh regenerate reinstall relaunch reload remove rename render reopen repeat replay reply report request resolve restart restore retry revert save scan screenshot scroll search select serialize serve settle skip snapshot sort spawn squash stage start stash stop strip summarize switch sync tail tally test toggle touch trace track trigger trim truncate try typecheck unblock uninstall unlink unmount unpack update upgrade upload validate verify visit wait walk warn wipe".split(
        " ",
    );
const VERBS = new Set([...Object.keys(IRREGULAR_PAST), ...Object.keys(IRREGULAR_ING), ...REGULAR]);
const AMBIGUOUS = new Set(
    "output input lead feed spread set cut split hit let put quit shut read go make dig tear win fly spin control permit have hold keep mean feel do see know think understand".split(
        " ",
    ),
);
const MID_VERBS = new Set([...VERBS].filter(v => !AMBIGUOUS.has(v)));
const CVC = /[^aeiou][aeiou][bcdfghjklmnpqrstvz]$/i;
const MID = /(?<![\w-])((?:(?:[Aa]nd|[Tt]hen)\s+)+)([a-z]{2,16})(?=$|[\s,;!?]|\.(?:\s|$))/g;
const NOT_VERB_AFTER =
    /^(?:\s+\w+){0,2}\s+(?:is|are|was|were|has|have|do|does|did|will|would|should|can|could|passes|passed|fails|failed|exists|works|worked|succeeds|succeeded|stays|remains|looks|runs|ran|not|if|when|unless|whether)(?:n['’]t)?\b/;
const PREFIXED = /^(re|un|de|pre|co|sub|over|out|mis|auto|post)-(.+)$/i;
const vowels = (w: string) => (w.match(/[aeiou]/gi) ?? []).length;

function ing(w: string) {
    const l = w.toLowerCase();
    if (IRREGULAR_ING[l]) return IRREGULAR_ING[l];
    if (/ie$/i.test(w)) return w.slice(0, -2) + "ying";
    if (/[^eoy]e$/i.test(w)) return w.slice(0, -1) + "ing";
    if (CVC.test(w) && vowels(w) === 1) return w + w.slice(-1) + "ing";
    if (/c$/i.test(w)) return w + "king";
    return w + "ing";
}
function past(w: string) {
    const l = w.toLowerCase();
    if (IRREGULAR_PAST[l]) return IRREGULAR_PAST[l];
    if (/e$/i.test(w)) return w + "d";
    if (/[^aeiou]y$/i.test(w)) return w.slice(0, -1) + "ied";
    if (CVC.test(w) && vowels(w) === 1) return w + w.slice(-1) + "ed";
    if (/c$/i.test(w)) return w + "ked";
    if (IRREGULAR_ING[l]) return IRREGULAR_ING[l].slice(0, -3) + "ed";
    return w + "ed";
}
const matchCase = (src: string, out: string) => (/^[A-Z]/.test(src) ? out.charAt(0).toUpperCase() + out.slice(1) : out);
function looksLikeVerb(w: string) {
    if (w.length < 2 || w.length > 16 || !/^[A-Za-z]+$/.test(w) || w === w.toUpperCase()) return false;
    const l = w.toLowerCase();
    if (PARTICIPLES.has(l)) return false;
    if (IRREGULAR_PAST[l]) return true;
    if ((/ing$/i.test(w) && w.length > 4) || (/ed$/i.test(w) && !/eed$/i.test(w) && w.length > 3) || (/s$/i.test(w) && !/(ss|us)$/i.test(w) && w.length > 3)) return false;
    return /[aeiou]/i.test(w) || /y/i.test(w);
}
function conjugateTail(s: string, fn: (w: string) => string) {
    return s.replace(MID, (m, lead, verb, at) => (MID_VERBS.has(verb) && !NOT_VERB_AFTER.test(s.slice(at + m.length)) ? lead + fn(verb) : m));
}

export function conjugate(desc: string): { running: string; done: string; infinitive: string } | undefined {
    const t = desc.trimStart();
    const ws = desc.slice(0, desc.length - t.length);
    const m = /^(\S+)([\s\S]*)$/.exec(t);
    if (!m) return;
    const [, first, rest] = m;
    const pre = PREFIXED.exec(first);
    if (pre && looksLikeVerb(pre[2])) {
        const [, p, base] = pre;
        const joined = (p + base).toLowerCase();
        const b = base.toLowerCase();
        if (PARTICIPLES.has(joined) || PARTICIPLES.has(b) || (!VERBS.has(joined) && !VERBS.has(b))) return;
        const f = (table: Record<string, string>, fn: (w: string) => string) => p + "-" + matchCase(base, table[joined] ? table[joined].slice(p.length) : fn(base));
        return {
            running: ws + f(IRREGULAR_ING, ing) + conjugateTail(rest, ing),
            done: ws + f(IRREGULAR_PAST, past) + conjugateTail(rest, past),
            infinitive: ws + first.toLowerCase() + rest,
        };
    }
    if (!looksLikeVerb(first) || !VERBS.has(first.toLowerCase())) return;
    return {
        running: ws + matchCase(first, ing(first)) + conjugateTail(rest, ing),
        done: ws + matchCase(first, past(first)) + conjugateTail(rest, past),
        infinitive: ws + first.charAt(0).toLowerCase() + first.slice(1) + rest,
    };
}

// ---------------------------------------------------------------- per-tool labels
let discordName: ((id: string) => string | undefined) | null = null;
export const setDiscordNamer = (fn: (id: string) => string | undefined) => (discordName = fn);
export interface ToolLabel {
    runningVerb: string;
    verb: string;
    failedVerb: string;
    meta?: string;
    metaIsCode?: boolean;
    metaIsFile?: string; // full path, for file-ref links
    runningLabel?: string;
    doneLabel?: string;
    failedLabel?: string;
}

const basename = (p?: string) => (p ? (p.split("/").filter(Boolean).pop() ?? p) : undefined);
const str = (v: any) => (typeof v === "string" ? v : undefined);
const SAFE_WORD = /^[\w./:@=+-]+$/;

function commandMeta(cmd?: string) {
    if (!cmd) return undefined;
    const words = cmd.trim().split(/\s+/);
    const safe: string[] = [];
    for (const w of words.slice(0, 4)) {
        if (!SAFE_WORD.test(w)) break;
        safe.push(w);
    }
    return safe.length ? safe.join(" ") + (safe.length < words.length ? " …" : "") : undefined;
}

export function mcpParts(name: string) {
    const [, server, ...rest] = name.split("__");
    const tool = rest.join("__");
    const pretty = (s: string) => s.replace(/[-_]+/g, " ").replace(/^\w/, c => c.toUpperCase());
    return { server, tool, label: `${pretty(server)}: ${tool.replace(/_+/g, " ")}` };
}

export function toolLabel(name: string, input: any = {}, result?: any): ToolLabel {
    const L = (runningVerb: string, verb: string, failedVerb: string, meta?: string, extra: Partial<ToolLabel> = {}): ToolLabel => ({
        runningVerb,
        verb,
        failedVerb,
        meta,
        ...extra,
    });
    const withDescription = (l: ToolLabel, d?: string) => {
        if (!d) return l;
        const c = conjugate(d);
        return c ? { ...l, runningLabel: c.running, doneLabel: c.done, failedLabel: `Failed to ${c.infinitive}` } : { ...l, runningLabel: d, doneLabel: d, failedLabel: d };
    };
    switch (name) {
        case "Bash":
        case "BashTool":
        case "PowerShell": {
            const d = str(input.description);
            const meta = d ?? commandMeta(str(input.command)) ?? "a command";
            return withDescription(L("Running", "Ran", "Failed to run", meta, { metaIsCode: !d }), d);
        }
        case "Read":
            return L("Reading", "Read", "Failed to read", basename(input.file_path), { metaIsFile: input.file_path });
        case "Write": {
            const upd = result?.type === "update";
            return L(upd ? "Updating" : "Creating", upd ? "Updated" : "Created", "Failed to write", basename(input.file_path), { metaIsFile: input.file_path });
        }
        case "Edit":
        case "MultiEdit":
            return L("Editing", "Edited", "Failed to edit", basename(input.file_path), { metaIsFile: input.file_path });
        case "NotebookEdit":
            return L("Editing", "Edited", "Failed to edit", basename(input.notebook_path), { metaIsFile: input.notebook_path });
        case "Grep":
        case "Glob":
            return L("Searching", "Searched", "Failed to search", str(input.pattern), { metaIsCode: true });
        case "LS":
            return L("Listing", "Listed", "Failed to list", str(input.path));
        case "WebFetch":
            return L("Fetching", "Fetched", "Failed to fetch", str(input.url));
        case "WebSearch":
            return L("Searching web", "Searched web", "Failed to search web", str(input.query));
        case "Task":
        case "Agent": {
            const d = str(input.description);
            const c = d ? conjugate(d) : undefined;
            return L(
                "Running agent",
                "Ran agent",
                "Failed to run agent",
                c ? undefined : d,
                c ? { runningLabel: c.running, doneLabel: c.done, failedLabel: `Failed to ${c.infinitive}` } : {},
            );
        }
        case "Skill":
            return L("Running skill", "Ran skill", "Failed to run skill", input.skill ? `/${input.skill}` : undefined, { metaIsCode: true });
        case "SlashCommand":
            return L("Running command", "Ran command", "Failed to run command", str(input.command), { metaIsCode: true });
        case "TodoWrite":
            return L("Updating todos", (input.todos ?? []).length ? "Updated todos" : "Cleared todos", "Failed to update todos");
        case "TaskCreate":
            return L("Adding task", "Added task", "Failed to add task", str(input.subject));
        case "TaskUpdate":
            return L("Updating task", "Updated task", "Failed to update task", str(input.subject));
        case "TaskGet":
            return L("Reading task", "Read task", "Failed to read task");
        case "TaskList":
            return L("Listing tasks", "Listed tasks", "Failed to list tasks");
        case "TaskStop":
        case "KillShell":
        case "KillBash":
            return L("Stopping task", "Stopped task", "Failed to stop task");
        case "TaskOutput":
        case "BashOutput":
            return L("Reading task output", "Read task output", "Failed to read task output");
        case "Monitor":
            return L("Watching background command", "Started watching background command", "Failed to watch background command");
        case "EnterPlanMode":
            return L("Making a plan", "Started planning", "Failed to start planning");
        case "ExitPlanMode":
            return L("Proposing plan", "Proposed plan", "Failed to propose plan");
        case "AskUserQuestion": {
            const qs = input.questions ?? [];
            return L("Asking", "Asked", "Failed to ask", qs.length > 1 ? `${qs.length} questions` : qs[0]?.header);
        }
        case "EnterWorktree":
            return L("Entering a worktree", "Entered a worktree", "Failed to enter a worktree", str(input.name));
        case "ExitWorktree":
            return L("Leaving the worktree", "Left the worktree", "Failed to leave the worktree");
        case "ToolSearch":
            return L("Loading tools", "Loaded tools", "Failed to load tools");
        case "ApplyPatch": {
            const ch: any[] = input.changes ?? [];
            if (ch.length === 1) {
                const k = ch[0].kind;
                const f = basename(ch[0].path);
                if (k === "add") return L("Creating", "Created", "Failed to create", f, { metaIsFile: ch[0].path });
                if (k === "delete") return L("Deleting", "Deleted", "Failed to delete", f, { metaIsFile: ch[0].path });
                return L("Editing", "Edited", "Failed to edit", f, { metaIsFile: ch[0].path });
            }
            return L("Editing", "Edited", "Failed to edit", `${ch.length} files`);
        }
        case "Permissions":
            return L("Requesting access", "Requested access", "Access denied");
        case "LSP":
            return L("Inspecting code", "Inspected code", "Failed to inspect code");
        case "ListMcpResourcesTool":
            return L("Listing resources", "Listed resources", "Failed to list resources");
        case "ReadMcpResourceTool":
            return L("Reading resource", "Read resource", "Failed to read resource", str(input.uri));
        case "CronCreate":
            return L("Scheduling prompt", "Scheduled prompt", "Failed to schedule prompt", str(input.prompt));
        case "CronList":
            return L("Listing scheduled prompts", "Listed scheduled prompts", "Failed to list scheduled prompts");
        case "CronDelete":
            return L("Stopping scheduled prompt", "Stopped scheduled prompt", "Failed to stop scheduled prompt");
        case "ScheduleWakeup":
            return L("Scheduling check-in", "Scheduled check-in", "Failed to schedule check-in", str(input.reason));
    }
    if (name.startsWith("mcp__discord__")) {
        const ch = (id?: string) => (id ? discordName?.(id) : undefined);
        const D: Record<string, [string, string, string, string?]> = {
            list_conversations: ["Listing conversations", "Listed conversations", "Failed to list conversations"],
            list_servers: ["Listing servers", "Listed servers", "Failed to list servers"],
            read_messages: ["Reading messages", "Read messages", "Failed to read messages", ch(input.channel_id) && `in ${ch(input.channel_id)}`],
            search_messages: ["Searching Discord", "Searched Discord", "Failed to search Discord", input.query],
            get_user: ["Looking up user", "Looked up user", "Failed to look up user"],
            draft_reply: ["Drafting a reply", "Drafted a reply", "Failed to draft a reply", ch(input.channel_id) && `in ${ch(input.channel_id)}`],
            open_channel: ["Opening", "Opened", "Failed to open", ch(input.channel_id)],
            current_context: ["Checking what’s open", "Checked what’s open", "Failed to check context"],
            current_user: ["Checking your account", "Checked your account", "Failed to check account"],
            send_message: ["Sending a message", "Sent a message", "Failed to send a message", ch(input.channel_id) && `to ${ch(input.channel_id)}`],
            edit_message: ["Editing a message", "Edited a message", "Failed to edit a message"],
            delete_message: ["Deleting a message", "Deleted a message", "Failed to delete a message"],
            add_reaction: ["Reacting", "Reacted", "Failed to react", input.emoji],
            get_channel: ["Inspecting channel", "Inspected channel", "Failed to inspect channel", ch(input.channel_id)],
            get_message: ["Fetching a message", "Fetched a message", "Failed to fetch a message"],
            get_unread: ["Checking unread", "Checked unread", "Failed to check unread"],
            get_mentions: ["Checking mentions", "Checked mentions", "Failed to check mentions"],
            list_friends: ["Listing friends", "Listed friends", "Failed to list friends"],
            get_presence: ["Checking status", "Checked status", "Failed to check status"],
            get_server: ["Inspecting server", "Inspected server", "Failed to inspect server"],
            search_members: ["Searching members", "Searched members", "Failed to search members", input.query],
            get_pins: ["Reading pins", "Read pins", "Failed to read pins", ch(input.channel_id) && `in ${ch(input.channel_id)}`],
            get_voice: ["Checking voice", "Checked voice", "Failed to check voice"],
            open_dm: ["Opening a DM", "Opened a DM", "Failed to open a DM"],
            mark_read: ["Marking read", "Marked read", "Failed to mark read", ch(input.channel_id)],
            watch_channel:
                input.watch === false
                    ? ["Unwatching", "Stopped watching", "Failed to unwatch", ch(input.channel_id)]
                    : ["Watching", "Watching", "Failed to watch", ch(input.channel_id)],
            notify_user: ["Notifying you", "Notified you", "Failed to notify you", input.title],
        };
        const d = D[name.slice(14)];
        if (d) return L(d[0], d[1], d[2], d[3] || undefined);
    }
    if (name.startsWith("mcp__")) {
        const { label } = mcpParts(name);
        return L(`Using ${label}`, `Used ${label}`, `Failed to use ${label}`);
    }
    return L(`Using ${name}`, `Used ${name}`, `Failed to use ${name}`);
}

// ---------------------------------------------------------------- multi-tool group summaries
type Cat = { key: string; verb: string; one: string; many: (n: number) => string };
function category(name: string, result?: any): Cat {
    const f = (key: string, verb: string, one: string, many: (n: number) => string): Cat => ({ key, verb, one, many });
    switch (name) {
        case "Read":
            return f("read", "read", "a file", n => `${n} files`);
        case "Write":
            return result?.type === "update" ? f("edit", "edited", "a file", n => `${n} files`) : f("write", "created", "a file", n => `${n} files`);
        case "Edit":
        case "MultiEdit":
        case "ApplyPatch":
            return f("edit", "edited", "a file", n => `${n} files`);
        case "NotebookEdit":
            return f("notebook", "edited", "a notebook", n => `${n} notebooks`);
        case "Bash":
        case "BashTool":
        case "PowerShell":
            return f("bash", "ran", "a command", n => `${n} commands`);
        case "Grep":
            return f("grep", "searched", "code", () => "code");
        case "Glob":
            return f("glob", "found", "files", () => "files");
        case "WebSearch":
            return f("web", "browsed", "the web", () => "the web");
        case "WebFetch":
            return f("fetch", "fetched", "a page", n => `${n} pages`);
        case "Task":
        case "Agent":
            return f("task", "ran", "an agent", n => `${n} agents`);
        case "TodoWrite":
            return f("todo", "updated", "todos", () => "todos");
        case "ExitPlanMode":
            return f("plan", "proposed", "a plan", () => "a plan");
        case "AskUserQuestion":
            return f("ask", "asked", "a question", n => `${n} questions`);
        case "ToolSearch":
            return f("toolsearch", "loaded", "tools", () => "tools");
        default:
            return f("other", "used", "a tool", n => `${n} tools`);
    }
}

export function groupSummary(tools: { name: string; result?: any; failed?: boolean; stopped?: boolean }[]) {
    const parts: { key: string; verb: string; count: number; failed: number; stopped: number; cat: Cat }[] = [];
    for (const t of tools) {
        const cat = category(t.name, t.result);
        let p = parts.find(x => x.key === cat.key);
        if (!p) parts.push((p = { key: cat.key, verb: cat.verb, count: 0, failed: 0, stopped: 0, cat }));
        p.count++;
        if (t.failed) p.failed++;
        if (t.stopped) p.stopped++;
    }
    return parts.map(p => {
        let meta = p.count === 1 ? p.cat.one : p.cat.many(p.count);
        if (p.failed && p.stopped) meta += ` (${p.failed} failed, ${p.stopped} stopped)`;
        else if (p.failed) meta += ` (${p.failed} failed)`;
        else if (p.stopped) meta += ` (${p.stopped} stopped)`;
        return { verb: p.verb, meta, isError: p.failed === p.count };
    });
}
