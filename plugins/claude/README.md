# Claude

Claude Code inside Discord. Off by default; it needs [Claude Code](https://claude.com/claude-code) installed (`claude` on your PATH) and signed in. [Codex](https://github.com/openai/codex) works too if it's installed.

## What you get

- **Coding Agents** in the DM list. Opening it slides the DM list out and your sessions in, in the same sidebar, and the page shows the session: streaming transcript with thinking, tool calls (grouped, with diffs and command output), approval cards (tools, plans, questions, MCP requests), a composer with `/` commands, `@` files, attachments, mode, model, effort, fast mode and a usage meter, queued messages, rewind and fork, chapters, and a Changes pane that commits, pushes and opens pull requests (`gh`).
- **Sessions beside a chat.** The spark button in a chat's header opens a session next to the conversation. Drag a session onto a DM to attach it there. An attached session can *watch* the chat, so new messages wake it.
- **Slash commands** in any chat: `/claude prompt:… [session:…] [where:…]`, `/catchup`, `/summarize`, `/draft`, `/todo`. They run locally, nothing is sent. The answer arrives as a message from Claude that only you can see, with a live card inside: the spark while it works, each tool step, Allow / Deny when it needs your OK, then the formatted answer.
- **Discord tools** for the agent: read and search messages, unread and mentions, friends and presence, servers, members, pins and voice, open channels and DMs, mark read, drafts, and pings. Sending, editing, deleting and reacting act as you, so each one asks for your approval, unless the session is in Bypass mode *and* you started the turn (a watched channel's message never skips the approval).
- **Shortcuts**: `Ctrl/⌘+Shift+J` opens Coding Agents from anywhere, `Ctrl/⌘+K` searches sessions, `Ctrl/⌘+Shift+Enter` in Discord's message box asks the chat's session instead of posting.

## How it works

- `native.ts` / `host/` run in Discord's main process. `host/claude.ts` drives the `claude` CLI over its stream-json protocol (the same NDJSON messages and control requests the official Agent SDK uses), implemented directly so the plugin has no dependencies. `host/codex.ts` drives `codex app-server`. The Discord tools reach both CLIs through a small MCP server (`host/bridge.ts`, written to the plugin's data folder and run with Electron's own Node) that forwards calls over a local socket.
- `host/history.ts` reads Claude Code's own session files (`~/.claude/projects`) for "Resume a session" and transcripts.
- The renderer talks to the host with `ctx.native.call("invoke", …)` and receives events through a long poll (`poll`).
- The UI renders in shadow roots with `styles.css`, which is generated: Tailwind compiles the classes the UI uses, and `styles/source.css` maps every colour to Discord's theme variables, so it follows your theme. After changing class names, run `bun plugins/claude/styles/build.ts`.
- Icons are [Lucide](https://lucide.dev) (ISC).

Chats (titles, folders, which chat is attached where) are kept in the plugin's data folder; the transcripts themselves stay in Claude Code's and Codex's own stores.
