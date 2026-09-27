// Claude as Discord slash commands: /claude, /catchup, /summarize, /draft, /todo, registered through Evi's local
// commands. They run locally (nothing is sent) and the answer comes back as Claude's own "Only you can see this"
// reply in the chat, with a live card that follows the session.
import { N } from "./native";
import { useAgents, rt, newChat, sendPrompt, setView, type AgentChat } from "./store";
import { syncCards, unmountCards, type CardRun } from "./claudeCard";
import { Stores, channelLabel, findStore, localMessage, ensureLocalMessage } from "./discord";
import { kv } from "./kv";

type Run = CardRun;
let runs: Run[] = [];

function channelContext(cid: string) {
    const c = Stores.Channel()?.getChannel(cid);
    const reply = findStore("PendingReplyStore")()?.getPendingReply?.(cid);
    const m = reply?.message;
    return {
        label: c ? channelLabel(c) : cid,
        reply: m ? { id: m.id, author: m.author?.globalName ?? m.author?.username ?? "someone", content: String(m.content ?? "").slice(0, 1500) } : null,
    };
}

function buildPrompt(cid: string, body: string, act: boolean) {
    const ctx = channelContext(cid);
    return (
        `<discord-command channel="${ctx.label}" channel_id="${cid}"${ctx.reply ? ` reply_to_message_id="${ctx.reply.id}"` : ""}>\n` +
        (ctx.reply ? `The user is replying to ${ctx.reply.author}: "${ctx.reply.content}"\n\n` : "") +
        `${body}\n</discord-command>\n\n` +
        "The user ran a Claude slash command in this Discord conversation. Read its recent messages with the discord tools if you need context. " +
        "Your answer is shown to them privately in the chat, so talk like a friend in the chat: direct and short, no preamble. " +
        `If they ask you to do something in Discord (reply to someone, send a message, react, look something up), do it with the discord tools — for a message here use send_message to channel_id ${cid}${ctx.reply ? ` (reply_to_message_id ${ctx.reply.id} when replying to that message)` : ""}. ` +
        (act ? "They asked you to act, so go ahead without asking what they meant. " : "") +
        "Then say in one line what you did."
    );
}

// run a task in a session (new or existing) for this channel
export async function route(cid: string, body: string, target: string, placement: "background" | "beside", act = false, command = "claude") {
    const st = useAgents.getState();
    let chat: AgentChat | undefined = target && target !== "new" ? st.chats.find(c => c.localId === target) : undefined;
    if (!chat) {
        const cwd = kv.get<string | null>("lastCwd", null) ?? N().env.home;
        const ctx = channelContext(cid);
        chat =
            (await newChat({
                cwd,
                title: `/${command} · ${ctx.label.replace(/^#/, "")} · ${body.replace(/\s+/g, " ").slice(0, 32)}`,
                autoTitle: false,
                attachedChannelId: placement === "beside" ? cid : undefined,
            })) ?? undefined;
        setView({ open: false }); // stay in the chat
    }
    if (!chat) return;
    const startIdx = rt(chat.localId).items.length;
    sendPrompt(useAgents.getState().chats.find(c => c.localId === chat!.localId) ?? chat, buildPrompt(cid, body, act));
    // the reply message: Discord's "used /claude" app message; the live card inside it shows the rest
    const msgId = localMessage(cid, "", undefined, { command, prompt: body });
    runs = [...runs.filter(r => Date.now() - r.at < 6 * 3600_000).slice(-30), { localId: chat.localId, channelId: cid, prompt: body, command, at: Date.now(), msgId, startIdx }];
    requestAnimationFrame(() => syncCards(runs));
    kv.set("mention.last:" + cid, chat.localId);
    return chat;
}

// ---------------------------------------------------------------- the commands
const arg = (args: any[], name: string) => args?.find(a => a.name === name)?.value as string | undefined;

function sessionChoices() {
    const st = useAgents.getState();
    const recent = [...st.chats]
        .filter(c => !c.archived)
        .sort((a, b) => b.updatedAt - a.updatedAt)
        .slice(0, 20);
    return [
        { name: "New session", displayName: "New session", value: "new" },
        ...recent.map(c => ({ name: c.title.slice(0, 90), displayName: c.title.slice(0, 90), value: c.localId })),
    ];
}

function where(args: any[]) {
    const w = arg(args, "where");
    return (w === "beside" || w === "background" ? w : kv.get<"background" | "beside">("mention.placement", "background")) as "background" | "beside";
}
function target(args: any[], cid: string) {
    return arg(args, "session") ?? kv.get<string | null>("mention.last:" + cid, null) ?? "new";
}

// what each command does (the command objects themselves are defined by the preload, before Discord starts)
export function runCommand(name: string, a: any[], cid: string) {
    if (kv.get<boolean>("mention.enabled", true) === false) return;
    const p = arg(a, "prompt") ?? "";
    if (name === "claude") return route(cid, p, target(a, cid), where(a), /^(please )?(reply|send|tell|react|post|dm|message)\b/i.test(p), "claude");
    if (name === "catchup")
        return route(cid, "Catch me up on this conversation: read the recent messages and tell me what I missed, briefly.", target(a, cid), "background", false, "catchup");
    if (name === "summarize")
        return route(
            cid,
            `Summarize the recent discussion in this conversation in a few bullet points.${arg(a, "focus") ? ` Focus on: ${arg(a, "focus")}` : ""}`,
            target(a, cid),
            "background",
            false,
            "summarize",
        );
    if (name === "draft")
        return route(
            cid,
            `Read the latest messages here and prepare a reply for me with draft_reply. Keep my usual tone.${arg(a, "instructions") ? ` ${arg(a, "instructions")}` : ""}`,
            target(a, cid),
            "background",
            false,
            "draft",
        );
    if (name === "todo") return route(cid, "Read this conversation and list any action items or questions directed at me.", target(a, cid), "background", false, "todo");
}

// ---------------------------------------------------------------- registration (Evi's local slash commands)
import type { PluginContext, CommandDefinition } from "@evi/api";

function definitions(): CommandDefinition[] {
    const session = {
        name: "session",
        description: "Which Coding Agents session (default: the one used here last)",
        choices: sessionChoices().map(c => ({ name: c.name, value: c.value })),
    };
    const run =
        (name: string) =>
        (args: Record<string, any>, { channel }: { channel: any }) => {
            if (channel?.id)
                runCommand(
                    name,
                    Object.entries(args).map(([name, value]) => ({ name, value })),
                    channel.id,
                );
            // nothing returned: the answer comes as Claude's own local reply in the chat
        };
    return [
        {
            name: "claude",
            description: "Ask Claude, or have it do something here — only you see the answer",
            options: [
                { name: "prompt", description: "What should Claude do?", required: true },
                session,
                {
                    name: "where",
                    description: "Where a new session runs",
                    choices: [
                        { name: "In the background", value: "background" },
                        { name: "Beside this chat", value: "beside" },
                    ],
                },
            ],
            execute: run("claude"),
        },
        { name: "catchup", description: "Claude catches you up on this conversation", options: [session], execute: run("catchup") },
        {
            name: "summarize",
            description: "Claude summarizes the recent discussion here",
            options: [{ name: "focus", description: "Anything to focus on?" }, session],
            execute: run("summarize"),
        },
        {
            name: "draft",
            description: "Claude drafts a reply for you to review and send",
            options: [{ name: "instructions", description: "How should the reply go?" }, session],
            execute: run("draft"),
        },
        { name: "todo", description: "Claude lists action items and questions for you here", options: [session], execute: run("todo") },
    ];
}

export function installMentions(ctx: PluginContext<any>) {
    let release: (() => void)[] = [];
    let lastKey = "";
    // the session option lists your sessions, so the commands are re-registered when that list changes
    const register = () => {
        const enabled = ctx.settings.get("commands" as any) !== false;
        const key = enabled
            ? sessionChoices()
                  .map(c => c.value + c.name)
                  .join("|")
            : "off";
        if (key === lastKey) return;
        lastKey = key;
        for (const r of release) r();
        release = enabled ? definitions().map(d => ctx.command(d)) : [];
    };
    register();
    const unsub = useAgents.subscribe(() => requestAnimationFrame(register));
    ctx.settings.onChange(() => register());
    // cards mount when their message renders (scrolling back, switching channels…)
    ctx.setInterval(() => {
        if (!runs.length) return;
        const cid = Stores.SelectedChannel()?.getChannelId?.();
        for (const r of runs) if (r.msgId && r.channelId === cid) ensureLocalMessage(r.channelId, r.msgId);
        syncCards(runs);
    }, 500);
    ctx.onDispose(() => {
        unsub();
        for (const r of release) r();
        release = [];
        unmountCards();
    });
}
