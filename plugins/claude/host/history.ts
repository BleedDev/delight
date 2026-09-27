/**
 * Claude Code's own session store on disk (~/.claude/projects/<encoded cwd>/<session id>.jsonl): list past sessions
 * for "Resume a session", and read one back as messages for the transcript. Pure file reading, no Discord or Electron.
 */
import fs from "fs";
import os from "os";
import path from "path";

const SESSION_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const HEAD_TAIL = 64 * 1024;

export function projectsRoot(env: Record<string, string | undefined> = process.env) {
    return path.join(env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), ".claude"), "projects");
}

/** The folder name Claude Code uses for a working directory */
export function encodeProjectDir(dir: string) {
    const name = dir.normalize("NFC").replace(/[^a-zA-Z0-9]/g, "-");
    if (name.length <= 200) return name;
    let h = 0;
    for (let i = 0; i < dir.length; i++) h = ((h << 5) - h + dir.charCodeAt(i)) | 0;
    return `${name.slice(0, 200)}-${Math.abs(h).toString(36)}`;
}

function realDir(dir: string) {
    try {
        return fs.realpathSync(dir);
    } catch {
        return dir;
    }
}

// ---------------------------------------------------------------- one transcript
export function parseTranscript(text: string, sessionId: string) {
    const lines: any[] = [];
    for (const raw of text.split("\n")) {
        if (!raw.trim()) continue;
        try {
            const e = JSON.parse(raw);
            if (["user", "assistant", "progress", "system", "attachment"].includes(e?.type) && typeof e.uuid === "string") lines.push(e);
        } catch { }
    }
    const byId = new Map<string, any>();
    lines.forEach((e, i) => byId.set(e.uuid, { ...e, _pos: i }));

    // the conversation is the chain from the newest main-chain leaf back to the root
    const mainChain = (e: any) => !e.isSidechain && !e.teamName && e.type !== "progress" && !(e.type === "attachment" && e.attachment?.type === "fork_briefing");
    const pointedTo = new Set<string>();
    for (const e of byId.values()) if (mainChain(e) && e.parentUuid) pointedTo.add(e.parentUuid);
    const terminals = [...byId.values()].filter(e => mainChain(e) && !pointedTo.has(e.uuid)).sort((a, b) => b._pos - a._pos);
    let leaf: any;
    for (const t of terminals) {
        let cur = t;
        while (cur && cur.type !== "user" && cur.type !== "assistant") cur = cur.parentUuid ? byId.get(cur.parentUuid) : undefined;
        if (cur) {
            leaf = cur;
            break;
        }
    }
    if (!leaf) return [];
    const chain: any[] = [];
    const seen = new Set<string>();
    for (let cur = leaf; cur && !seen.has(cur.uuid); cur = cur.parentUuid ? byId.get(cur.parentUuid) : undefined) {
        seen.add(cur.uuid);
        chain.push(cur);
    }
    chain.reverse();

    // parallel tool calls hang off side branches: put their sibling blocks and tool results back in
    const out: any[] = [];
    const inChain = new Set(chain.map(e => e.uuid));
    for (let ci = 0; ci < chain.length; ci++) {
        const e = chain[ci];
        out.push(e);
        if (e.type !== "assistant" || !e.message?.id) continue;
        // one API message split over consecutive lines: insert its side branches after the last of them
        const nx = chain[ci + 1];
        if (nx?.type === "assistant" && nx.message?.id === e.message.id) continue;
        const toolIds = new Set<string>();
        const extra = [...byId.values()].filter(x => {
            if (inChain.has(x.uuid) || x.isSidechain) return false;
            if (x.type === "assistant" && x.message?.id === e.message.id) return true;
            return false;
        });
        const group = chain.filter(x => x.type === "assistant" && x.message?.id === e.message.id);
        for (const x of [...group, ...extra]) for (const b of Array.isArray(x.message?.content) ? x.message.content : []) if (b?.type === "tool_use") toolIds.add(b.id);
        const results = [...byId.values()].filter(x => !inChain.has(x.uuid) && x.type === "user" && Array.isArray(x.message?.content) && x.message.content.some((b: any) => b?.type === "tool_result" && toolIds.has(b.tool_use_id)));
        for (const x of [...extra, ...results].sort((a, b) => String(a.timestamp).localeCompare(String(b.timestamp)))) {
            inChain.add(x.uuid);
            out.push(x);
        }
    }

    const messages: any[] = [];
    for (const e of out) {
        if (e.type === "attachment" && e.attachment?.type === "queued_command" && !e.isMeta) {
            messages.push({ type: "user", uuid: e.uuid, session_id: sessionId, message: { role: "user", content: e.attachment.prompt ?? "" }, parent_tool_use_id: null, timestamp: e.timestamp, isQueuedCommand: true });
            continue;
        }
        if ((e.type !== "user" && e.type !== "assistant") || e.isMeta || e.isSidechain || e.teamName) continue;
        messages.push({
            type: e.type,
            uuid: e.uuid,
            session_id: sessionId,
            message: e.message,
            parent_tool_use_id: null,
            timestamp: e.timestamp,
            ...(e.origin ? { origin: e.origin } : {}),
            ...(e.isCompactSummary ? { isCompactSummary: true } : {}),
        });
    }
    return messages;
}

export function findTranscript(sessionId: string, dir?: string, root = projectsRoot()) {
    if (!SESSION_ID.test(sessionId)) return null;
    if (dir) {
        const p = path.join(root, encodeProjectDir(realDir(dir)), `${sessionId}.jsonl`);
        if (fs.existsSync(p)) return p;
    }
    let dirs: string[] = [];
    try {
        dirs = fs.readdirSync(root);
    } catch {
        return null;
    }
    for (const d of dirs) {
        const p = path.join(root, d, `${sessionId}.jsonl`);
        try {
            if (fs.statSync(p).size > 0) return p;
        } catch { }
    }
    return null;
}

export function getSessionMessages(sessionId: string, dir?: string) {
    const file = findTranscript(sessionId, dir);
    if (!file) return [];
    return parseTranscript(fs.readFileSync(file, "utf8"), sessionId);
}

// ---------------------------------------------------------------- the list of sessions
function readHeadTail(file: string, size: number) {
    const fd = fs.openSync(file, "r");
    try {
        const head = Buffer.alloc(Math.min(HEAD_TAIL, size));
        fs.readSync(fd, head, 0, head.length, 0);
        const tailLen = Math.min(HEAD_TAIL, size);
        const tail = Buffer.alloc(tailLen);
        fs.readSync(fd, tail, 0, tailLen, size - tailLen);
        return { head: head.toString("utf8"), tail: tail.toString("utf8") };
    } finally {
        fs.closeSync(fd);
    }
}
const lastString = (text: string, key: string) => {
    const re = new RegExp(`"${key}":"((?:[^"\\\\]|\\\\.)*)"`, "g");
    let m: RegExpExecArray | null;
    let last: string | undefined;
    while ((m = re.exec(text))) last = m[1];
    if (last === undefined) return undefined;
    try {
        return JSON.parse(`"${last}"`) as string;
    } catch {
        return last;
    }
};

function promptText(content: any): string | null {
    const text = typeof content === "string" ? content : Array.isArray(content) ? content.filter((b: any) => b?.type === "text").map((b: any) => b.text).join("\n") : "";
    if (Array.isArray(content) && content.some((b: any) => b?.type === "tool_result")) return null;
    const t = text.trim();
    const bash = /^<bash-input>([\s\S]*?)<\/bash-input>/.exec(t);
    if (bash) return `! ${bash[1]}`;
    // wrapped prompts (<command-name>, <discord-event>, …) and interrupt markers aren't what the user typed
    if (!t || /^<[a-z][\w-]*[\s>]/i.test(t) || /^\[Request interrupted/.test(t)) return null;
    return t;
}

export function summarizeSession(file: string, sessionId: string) {
    const st = fs.statSync(file);
    if (!st.size) return null;
    const { head, tail } = readHeadTail(file, st.size);
    if (head.split("\n")[0]?.includes('"isSidechain":true')) return null;
    let firstPrompt: string | undefined;
    let cwd: string | undefined;
    let createdAt: number | undefined;
    for (const raw of head.split("\n")) {
        let e: any;
        try {
            e = JSON.parse(raw);
        } catch {
            continue;
        }
        createdAt ??= e.timestamp ? Date.parse(e.timestamp) : undefined;
        cwd ??= e.cwd;
        if (!firstPrompt && e.type === "user" && !e.isMeta && !e.isCompactSummary) {
            const t = promptText(e.message?.content);
            if (t) firstPrompt = t.length > 200 ? t.slice(0, 200) + "…" : t;
        }
    }
    const customTitle = lastString(tail, "customTitle") ?? lastString(head, "customTitle") ?? lastString(tail, "aiTitle") ?? lastString(head, "aiTitle");
    const summary = customTitle ?? lastString(tail, "lastPrompt") ?? lastString(tail, "summary") ?? firstPrompt;
    if (!summary) return null;
    return {
        sessionId,
        summary,
        customTitle,
        firstPrompt,
        lastModified: st.mtimeMs,
        fileSize: st.size,
        gitBranch: lastString(tail, "gitBranch") ?? lastString(head, "gitBranch"),
        cwd: lastString(tail, "relocatedCwd") ?? cwd,
        createdAt,
    };
}

export function listSessions(opts: { dir?: string; limit?: number; offset?: number; } = {}, root = projectsRoot()) {
    let dirs: string[] = [];
    try {
        dirs = opts.dir ? [encodeProjectDir(realDir(opts.dir))] : fs.readdirSync(root);
    } catch {
        return [];
    }
    const byId = new Map<string, ReturnType<typeof summarizeSession> & {}>();
    for (const d of dirs) {
        let files: string[] = [];
        try {
            files = fs.readdirSync(path.join(root, d));
        } catch {
            continue;
        }
        for (const f of files) {
            const id = f.slice(0, -6);
            if (!f.endsWith(".jsonl") || !SESSION_ID.test(id)) continue;
            try {
                const s = summarizeSession(path.join(root, d, f), id);
                if (s && (!byId.has(id) || byId.get(id)!.lastModified < s.lastModified)) byId.set(id, s);
            } catch { }
        }
    }
    const all = [...byId.values()].sort((a, b) => b.lastModified - a.lastModified || a.sessionId.localeCompare(b.sessionId));
    const offset = opts.offset ?? 0;
    return all.slice(offset, opts.limit ? offset + opts.limit : undefined);
}
