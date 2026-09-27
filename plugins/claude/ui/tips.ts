// Tips listed in the plugin's settings.
export const TIPS: { title: string; body: string }[] = [
    {
        title: "/claude in any chat",
        body: "Type /claude in any message box: Discord shows it in its own slash menu with a prompt field. It runs locally (nothing is sent) and Claude answers with a message only you can see, live.",
    },
    {
        title: "Pick the session",
        body: "/claude has a session option with your recent sessions (default: the one used in that chat last), and a where option: in the background or beside the chat.",
    },
    { title: "One-shot helpers", body: "/catchup, /summarize, /draft and /todo do the usual chat chores for the conversation you’re in." },
    { title: "Replies come with context", body: "Reply to a message, then run /claude — Claude gets the message you replied to, plus the channel it can read." },
    {
        title: "It does things too",
        body: "Ask it to reply to someone, react or send something and it will — in a Bypass-mode session without asking, otherwise you approve each message.",
    },
    { title: "Drafts, not sends", body: "/draft prepares a reply in Coding Agents; Use it puts it in your message box and you send it yourself." },
    { title: "Coding Agents anywhere", body: "⌘⇧J opens Coding Agents from anywhere; your sessions slide into the DM sidebar. ⌘K searches them, ⇧⌘O starts a new one." },
    { title: "Attach a session to a DM", body: "Drag a session onto a DM, or press the spark in a chat header, and it lives beside that conversation." },
    { title: "Shell and history", body: "In a session, !command runs a shell command (after you confirm), Esc takes back a queued message, and Esc Esc edits your last one." },
    { title: "Settings", body: "Evi settings (Ctrl+Shift+D) → Plugins → Claude: slash commands, where new sessions run, notifications, keep-awake and the default folder." },
];
