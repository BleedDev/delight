<p align="center">
  <img src="docs/art/banner.svg" alt="Evi" width="100%">
</p>

<p align="center">
  <b>Make Discord yours.</b><br>
  Plugins, themes and a store for the Discord desktop app, installed in one click.
</p>

<p align="center">
  <a href="https://evi.rest/download"><b>Download</b></a> ·
  <a href="https://evi.rest">evi.rest</a> ·
  <a href="https://github.com/BleedDev/evi/releases">What's new</a> ·
  <a href="docs/plugins.md">Make a plugin</a>
</p>

---

## Get started

Download **Evi Setup** for your system from [evi.rest/download](https://evi.rest/download), open it, tick your Discord and click **Install Evi**. That's it: Discord restarts with Evi in it.

- **macOS:** the first time, macOS says it can't verify Evi Setup. Open System Settings → Privacy & Security and click **Open Anyway**. If it then says Evi Setup was prevented from modifying apps, allow it under **App Management**.
- **Linux:** allow the download to run as a program first (right-click → Properties). Discord's folder usually belongs to the system, so Evi Setup asks for your password. It needs WebKitGTK, which most desktops have.

Then open Discord and press **Ctrl+Shift+D**, or find **Evi** in Discord's settings. Turn on the plugins you like, and you're done.

Works with Discord Stable, PTB and Canary. When there's a new Evi, it tells you and updates in one click, or quietly when you close Discord if you'd rather.

## What you get

<table>
  <tr>
    <td width="50%" valign="top">
      <img src="docs/art/store.svg" alt="" width="100%"><br>
      <b>A store full of plugins and themes</b><br>
      See what's trending and new, read reviews, heart plugins to hear when they update, and install with one click. Community plugins are read by Evi's team before they go in.
    </td>
    <td width="50%" valign="top">
      <img src="docs/art/promise.svg" alt="" width="100%"><br>
      <b>Plugins say what they need</b><br>
      Before you install anything, you see what it asks for: which sites it talks to, whether it reads your messages. Evi blocks the rest.
    </td>
  </tr>
  <tr>
    <td width="50%" valign="top">
      <img src="docs/art/safe.svg" alt="" width="100%"><br>
      <b>Hard to break</b><br>
      If a Discord update breaks a plugin, Evi's team can fix it for everyone within minutes. If Discord crashes, Evi tells you which plugin was busy and offers to turn it off.
    </td>
    <td width="50%" valign="top">
      <img src="docs/art/setup.svg" alt="" width="100%"><br>
      <b>Yours to shape</b><br>
      Put an image or video behind Discord, make a theme by picking colours, set keyboard shortcuts for plugins, and get Evi in your language.
    </td>
  </tr>
</table>

## Plugins

Evi comes with these, all off until you turn them on. There are more in the store.

**Chat**
- **Message Logger**: deleted and edited messages stay visible
- **Who Reacted**: little avatars of who reacted, on each reaction
- **Typing Tweaks**: see who's typing, with dots on channels and DMs
- **Inline Translate**: translate a message right under it
- **Snippets**: saved replies with `/snip`
- **Silent Typing**: nobody sees "is typing…"
- **Voice Message Download**: save voice messages as files

**Friends and people**
- **Last Seen**: when someone was last online, active or talking
- **Friend Online Alerts**: know when your people come online
- **Relationship Notifier**: know when someone unfriends you or leaves a group
- **Timezones**: see someone's local time next to their name
- **Platform Indicators**: desktop, mobile, web or console
- **DM Categories**: sort your DMs into folders
- **View Icons**: open someone's avatar or banner full size and download it

**Privacy**
- **Streamer Mode+**: blur your DMs, servers and images while you stream
- **Hide Personal Info**: blur your email, phone and IPs in settings
- **Link Safety**: warns you about scam links before they open
- **Clear URLs**: strip tracking junk from links you send
- **Strip Metadata**: remove GPS and camera info from images you upload
- **No Track**: block Discord's analytics
- **Game Activity Toggle**: hide what you're playing, in one click
- **Hide Blocked Completely**: blocked people's messages disappear

**Servers, media and voice**
- **Show Hidden Channels**, **Permissions Viewer**, **Read All**
- **Emoji Stealer**: add any emoji or sticker to your server
- **GIF Folders**, **Better Image Viewer**, **Video Controls+**
- **Volume Booster**: past Discord's 200%
- **Voice Activity Log**: who joined and left your call

**Speed**
- **Fast Lists**, **Smooth Typing**, **Calm Name Effects**, **Dedicated GPU**: keep Discord smooth, even with hundreds of servers

## Questions

**Can I get banned for this?**
Client mods are against Discord's Terms of Service. In practice Discord doesn't go looking for them, but it's your call.

**Something broke. What now?**
If Discord keeps crashing, Evi starts in safe mode on its own: no plugins, themes or custom CSS until you say so. You can also start Discord with `--evi-safe` for that, or `--vanilla` to skip Evi once. A store plugin's crash report can go straight to its author from Evi's settings.

**How do I remove it?**
Run Evi Setup and click **Uninstall Evi**. Discord goes back exactly as it was.

**Discord updated and Evi is gone.**
Evi puts itself back when Discord updates, on every system. If it ever doesn't, open Evi Setup and click **Install Evi** again.

## Make your own

Plugins are small TypeScript files that reload in Discord while you edit them.

```sh
git clone https://github.com/BleedDev/evi && cd evi
bun install && bun run build
bun run inject                     # point your Discord at this checkout (quit Discord first)
bun run new-plugin my-plugin       # a working plugin to start from
bun run dev                        # rebuilds as you save, and Discord reloads it
```

- **[Writing plugins](docs/plugins.md)**: the full guide, from an empty folder to the store
- **[Developing Evi](docs/development.md)**: how Evi works, building installers, releasing
- `bun run preview-plugin my-plugin` shows its store page before you upload it on [evi.rest](https://evi.rest)
