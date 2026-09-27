var __defProp = Object.defineProperty;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __hasOwnProp = Object.prototype.hasOwnProperty;
function __accessProp(key) {
  return this[key];
}
var __toCommonJS = (from) => {
  var entry = (__moduleCache ??= new WeakMap).get(from), desc;
  if (entry)
    return entry;
  entry = __defProp({}, "__esModule", { value: true });
  if (from && typeof from === "object" || typeof from === "function") {
    for (var key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(entry, key))
        __defProp(entry, key, {
          get: __accessProp.bind(from, key),
          enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable
        });
  }
  __moduleCache.set(from, entry);
  return entry;
};
var __moduleCache;
var __returnValue = (v) => v;
function __exportSetter(name, newValue) {
  this[name] = __returnValue.bind(null, newValue);
}
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, {
      get: all[name],
      enumerable: true,
      configurable: true,
      set: __exportSetter.bind(all, name)
    });
};

// plugins/show-hidden-channels/index.tsx
var exports_show_hidden_channels = {};
__export(exports_show_hidden_channels, {
  default: () => show_hidden_channels_default
});
module.exports = __toCommonJS(exports_show_hidden_channels);
var import_api3 = require("@evi/api");

// plugins/show-hidden-channels/LockScreen.tsx
var import_api2 = require("@evi/api");

// plugins/show-hidden-channels/shared.ts
var import_api = require("@evi/api");
var ID = "show-hidden-channels";
var settings = {
  showMode: {
    type: "select",
    label: "How hidden channels look",
    description: "Takes effect after a reload for voice channels.",
    default: "lock",
    options: [
      { label: "A lock instead of the channel icon", value: "lock" },
      { label: "Muted, with a crossed-out eye after the name", value: "muted" }
    ]
  },
  hideUnreads: {
    type: "boolean",
    label: "Hide unreads",
    description: "Hidden channels never show as unread.",
    default: true
  },
  showAllowedByDefault: {
    type: "boolean",
    label: "Show who can see it",
    description: "Open the allowed users and roles list on a hidden channel's page by default.",
    default: true
  }
};
var context;
var setContext = (ctx) => void (context = ctx);
var getContext = () => context;
function setting(key) {
  if (context)
    return context.settings.get(key);
  const stored = window.Evi?.settings?.plugin?.(ID)?.settings;
  return stored && key in stored ? stored[key] : settings[key].default;
}
var Permissions = {
  VIEW_CHANNEL: 1n << 10n,
  CONNECT: 1n << 20n
};
var stores = new Map;
function store(name) {
  let found = stores.get(name);
  if (found)
    return found;
  try {
    found = import_api.getStore(name);
  } catch {
    return;
  }
  stores.set(name, found);
  return found;
}
function findCached(search) {
  let value;
  let lastMiss = -Infinity;
  return () => {
    if (value !== undefined)
      return value;
    if (performance.now() - lastMiss < 5000)
      return;
    value = search();
    if (value === undefined)
      lastMiss = performance.now();
    return value;
  };
}
function isHiddenChannel(channel, checkConnect = false) {
  try {
    if (channel == null || Object.hasOwn(channel, "channelId") && channel.channelId == null)
      return false;
    if (channel.channelId != null)
      channel = store("ChannelStore")?.getChannel(channel.channelId);
    if (channel == null || channel.isDM?.() || channel.isGroupDM?.() || channel.isMultiUserDM?.())
      return false;
    if (["browse", "customize", "guide"].includes(channel.id))
      return false;
    const permissions = store("PermissionStore");
    if (!permissions)
      return false;
    return !permissions.can(Permissions.VIEW_CHANNEL, channel) || checkConnect && !permissions.can(Permissions.CONNECT, channel);
  } catch (err) {
    context?.logger.error("isHiddenChannel threw", err);
    return false;
  }
}
function cssClasses(...names) {
  const patterns = names.map((n) => [n, new RegExp(`^${n}_+[\\da-f]+(?: |$)`)]);
  const matches = (value, pattern) => typeof value === "string" && pattern.test(value);
  const lookup = findCached(() => {
    const module2 = import_api.find((v) => !!v && typeof v === "object" && !Array.isArray(v) && patterns.every(([, p]) => Object.values(v).some((c) => matches(c, p))));
    if (!module2)
      return;
    const classes = {};
    for (const [n, p] of patterns)
      classes[n] = Object.values(module2).find((c) => matches(c, p));
    return classes;
  });
  return () => lookup() ?? {};
}

// plugins/show-hidden-channels/LockScreen.tsx
var jsx_runtime = require("react/jsx-runtime");
var TYPE_NAMES = { 0: "text", 2: "voice", 5: "announcement", 13: "stage", 15: "forum", 16: "media" };
var SORT_ORDERS = { 0: "Latest activity", 1: "Creation date" };
var FORUM_LAYOUTS = { 0: "Not set", 1: "List view", 2: "Gallery view" };
var VIDEO_QUALITY = { 1: "Automatic", 2: "720p" };
var LOGO = "/assets/433e3ec4319a9d11b0cbe39342614982.svg";
var DISCORD_EPOCH = 1420070400000;
var scrollerClasses = cssClasses("auto", "customTheme", "managedReactiveScroller");
var topicParser = findCached(() => import_api2.find(import_api2.filters.byProps("parseTopic")));
var ChannelBeginHeader = () => null;
var setChannelBeginHeader = (component) => void (ChannelBeginHeader = component);
var snowflakeDate = (id) => new Date(Number(BigInt(id) >> 22n) + DISCORD_EPOCH);
var formatDate = (date) => date.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
function formatDuration(amount, unit) {
  let seconds = unit === "minutes" ? amount * 60 : amount;
  const parts = [];
  for (const [name, size] of [["day", 86400], ["hour", 3600], ["minute", 60], ["second", 1]]) {
    const n = Math.floor(seconds / size);
    if (!n)
      continue;
    seconds -= n * size;
    parts.push(`${n} ${name}${n === 1 ? "" : "s"}`);
  }
  return parts.join(" ") || "0 seconds";
}
function Emoji({ id, name }) {
  if (name)
    return /* @__PURE__ */ jsx_runtime.jsx("span", {
      className: "evi-shc-emoji",
      children: name
    });
  if (!id)
    return null;
  const alt = store("EmojiStore")?.getCustomEmojiById?.(id)?.name ?? "emoji";
  return /* @__PURE__ */ jsx_runtime.jsx("img", {
    className: "evi-shc-emoji",
    src: `https://cdn.discordapp.com/emojis/${id}.webp?size=48`,
    alt: `:${alt}:`
  });
}
function Topic({ channel }) {
  const parser = topicParser();
  try {
    if (parser)
      return /* @__PURE__ */ jsx_runtime.jsx(jsx_runtime.Fragment, {
        children: parser.parseTopic(channel.topic, false, { channelId: channel.id })
      });
  } catch {}
  return /* @__PURE__ */ jsx_runtime.jsx(jsx_runtime.Fragment, {
    children: channel.topic
  });
}
function WithTooltip({ text, children }) {
  const Tooltip = import_api2.Components.Tooltip;
  return Tooltip ? /* @__PURE__ */ jsx_runtime.jsx(Tooltip, {
    text,
    children
  }) : /* @__PURE__ */ jsx_runtime.jsx("span", {
    title: text,
    children: children({})
  });
}
function LockScreen({ channel }) {
  const ctx = getContext();
  const [, rerender] = import_api2.React.useReducer((n) => n + 1, 0);
  import_api2.React.useEffect(() => ctx?.settings.onChange(rerender), [ctx]);
  const showAllowed = setting("showAllowedByDefault");
  const {
    type,
    topic,
    lastMessageId,
    lastPinTimestamp,
    rateLimitPerUser,
    defaultThreadRateLimitPerUser,
    bitrate,
    rtcRegion,
    videoQualityMode,
    defaultAutoArchiveDuration,
    defaultForumLayout,
    defaultSortOrder,
    defaultReactionEmoji,
    availableTags,
    permissionOverwrites,
    guild_id: guildId
  } = channel;
  import_api2.React.useEffect(() => {
    const members = store("GuildMemberStore");
    const ownerId = store("GuildStore")?.getGuild(guildId)?.ownerId;
    const missing = new Set;
    if (ownerId && !members?.getMember(guildId, ownerId))
      missing.add(ownerId);
    for (const { type: type2, id } of Object.values(permissionOverwrites ?? {})) {
      if (type2 === 1 && !members?.getMember(guildId, id))
        missing.add(id);
    }
    if (missing.size)
      import_api2.Dispatcher.dispatch({ type: "GUILD_MEMBERS_REQUEST", guildIds: [guildId], userIds: [...missing] });
  }, [channel.id]);
  const isVoice = channel.isGuildVoice?.() || channel.isGuildStageVoice?.();
  const isForum = channel.isForumChannel?.();
  const hidden = !store("PermissionStore")?.can(Permissions.VIEW_CHANNEL, channel);
  const scroller = scrollerClasses();
  return /* @__PURE__ */ jsx_runtime.jsx("div", {
    className: [scroller.auto, scroller.customTheme, scroller.managedReactiveScroller].filter(Boolean).join(" "),
    children: /* @__PURE__ */ jsx_runtime.jsxs("div", {
      className: "evi-shc-container",
      children: [
        /* @__PURE__ */ jsx_runtime.jsx("img", {
          className: "evi-shc-logo",
          src: LOGO,
          alt: ""
        }),
        /* @__PURE__ */ jsx_runtime.jsxs("div", {
          className: "evi-shc-heading",
          children: [
            /* @__PURE__ */ jsx_runtime.jsxs("h2", {
              children: [
                "This is a ",
                hidden ? "hidden" : "locked",
                " ",
                TYPE_NAMES[type] ?? "",
                " channel"
              ]
            }),
            channel.isNSFW?.() && /* @__PURE__ */ jsx_runtime.jsx(WithTooltip, {
              text: "NSFW",
              children: (props) => /* @__PURE__ */ jsx_runtime.jsx("svg", {
                ...props,
                className: "evi-shc-nsfw",
                width: "32",
                height: "32",
                viewBox: "0 0 48 48",
                "aria-hidden": true,
                role: "img",
                children: /* @__PURE__ */ jsx_runtime.jsx("path", {
                  fill: "currentColor",
                  d: "M.7 43.05 24 2.85l23.3 40.2Zm23.55-6.25q.75 0 1.275-.525.525-.525.525-1.275 0-.75-.525-1.3t-1.275-.55q-.8 0-1.325.55-.525.55-.525 1.3t.55 1.275q.55.525 1.3.525Zm-1.85-6.1h3.65V19.4H22.4Z"
                })
              })
            })
          ]
        }),
        !isVoice && /* @__PURE__ */ jsx_runtime.jsxs("p", {
          className: "evi-shc-lead",
          children: [
            "You can't see the ",
            isForum ? "posts" : "messages",
            " in this channel.",
            isForum && topic && " Its guidelines are below."
          ]
        }),
        isForum && topic && /* @__PURE__ */ jsx_runtime.jsx("div", {
          className: "evi-shc-box evi-shc-topic",
          children: /* @__PURE__ */ jsx_runtime.jsx(Topic, {
            channel
          })
        }),
        lastMessageId && /* @__PURE__ */ jsx_runtime.jsxs("p", {
          children: [
            "Last ",
            isForum ? "post" : "message",
            ": ",
            formatDate(snowflakeDate(lastMessageId))
          ]
        }),
        lastPinTimestamp && /* @__PURE__ */ jsx_runtime.jsxs("p", {
          children: [
            "Last pin: ",
            formatDate(new Date(lastPinTimestamp))
          ]
        }),
        rateLimitPerUser > 0 && /* @__PURE__ */ jsx_runtime.jsxs("p", {
          children: [
            "Slowmode: ",
            formatDuration(rateLimitPerUser, "seconds")
          ]
        }),
        defaultThreadRateLimitPerUser > 0 && /* @__PURE__ */ jsx_runtime.jsxs("p", {
          children: [
            "Default thread slowmode: ",
            formatDuration(defaultThreadRateLimitPerUser, "seconds")
          ]
        }),
        isVoice && bitrate != null && /* @__PURE__ */ jsx_runtime.jsxs("p", {
          children: [
            "Bitrate: ",
            Math.round(bitrate / 1000),
            " kbps"
          ]
        }),
        rtcRegion !== undefined && /* @__PURE__ */ jsx_runtime.jsxs("p", {
          children: [
            "Region: ",
            rtcRegion ?? "Automatic"
          ]
        }),
        isVoice && /* @__PURE__ */ jsx_runtime.jsxs("p", {
          children: [
            "Video quality: ",
            VIDEO_QUALITY[videoQualityMode ?? 1]
          ]
        }),
        defaultAutoArchiveDuration > 0 && /* @__PURE__ */ jsx_runtime.jsxs("p", {
          children: [
            isForum ? "Posts" : "Threads",
            " archive after ",
            formatDuration(defaultAutoArchiveDuration, "minutes"),
            " of inactivity"
          ]
        }),
        defaultForumLayout != null && /* @__PURE__ */ jsx_runtime.jsxs("p", {
          children: [
            "Default layout: ",
            FORUM_LAYOUTS[defaultForumLayout]
          ]
        }),
        defaultSortOrder != null && /* @__PURE__ */ jsx_runtime.jsxs("p", {
          children: [
            "Default sort order: ",
            SORT_ORDERS[defaultSortOrder]
          ]
        }),
        defaultReactionEmoji != null && /* @__PURE__ */ jsx_runtime.jsxs("div", {
          className: "evi-shc-box evi-shc-row",
          children: [
            /* @__PURE__ */ jsx_runtime.jsx("p", {
              children: "Default reaction:"
            }),
            /* @__PURE__ */ jsx_runtime.jsx(Emoji, {
              id: defaultReactionEmoji.emojiId,
              name: defaultReactionEmoji.emojiName
            })
          ]
        }),
        channel.hasFlag?.(16 /* REQUIRE_TAG */) && /* @__PURE__ */ jsx_runtime.jsx("p", {
          children: "Posts in this forum need a tag."
        }),
        availableTags?.length > 0 && /* @__PURE__ */ jsx_runtime.jsxs("div", {
          className: "evi-shc-box",
          children: [
            /* @__PURE__ */ jsx_runtime.jsx("h3", {
              children: "Available tags"
            }),
            /* @__PURE__ */ jsx_runtime.jsx("div", {
              className: "evi-shc-tags",
              children: availableTags.map((tag) => /* @__PURE__ */ jsx_runtime.jsxs("span", {
                className: "evi-shc-tag",
                children: [
                  /* @__PURE__ */ jsx_runtime.jsx(Emoji, {
                    id: tag.emojiId,
                    name: tag.emojiName
                  }),
                  tag.name
                ]
              }, tag.id))
            })
          ]
        }),
        /* @__PURE__ */ jsx_runtime.jsxs("div", {
          className: "evi-shc-box evi-shc-allowed",
          children: [
            /* @__PURE__ */ jsx_runtime.jsxs("div", {
              className: "evi-shc-row",
              children: [
                /* @__PURE__ */ jsx_runtime.jsx("h3", {
                  children: "Allowed users and roles"
                }),
                /* @__PURE__ */ jsx_runtime.jsx(WithTooltip, {
                  text: showAllowed ? "Hide allowed users and roles" : "Show allowed users and roles",
                  children: (props) => /* @__PURE__ */ jsx_runtime.jsx("button", {
                    ...props,
                    className: "evi-shc-toggle",
                    "aria-expanded": showAllowed,
                    onClick: () => ctx?.settings.set("showAllowedByDefault", !showAllowed),
                    children: /* @__PURE__ */ jsx_runtime.jsx("svg", {
                      width: "24",
                      height: "24",
                      viewBox: "0 0 24 24",
                      style: { transform: showAllowed ? "scaleY(-1)" : undefined },
                      children: /* @__PURE__ */ jsx_runtime.jsx("path", {
                        fill: "currentColor",
                        d: "M16.59 8.59003L12 13.17L7.41 8.59003L6 10L12 16L18 10L16.59 8.59003Z"
                      })
                    })
                  })
                })
              ]
            }),
            showAllowed && /* @__PURE__ */ jsx_runtime.jsx(ChannelBeginHeader, {
              channel
            })
          ]
        })
      ]
    })
  });
}
var Boundary;
function getBoundary() {
  return Boundary ??= class extends import_api2.React.Component {
    state = { failed: false };
    static getDerivedStateFromError() {
      return { failed: true };
    }
    componentDidCatch(err) {
      getContext()?.logger.error("The hidden channel page crashed", err);
    }
    render() {
      return this.state.failed ? /* @__PURE__ */ jsx_runtime.jsx("div", {
        className: "evi-shc-container",
        children: /* @__PURE__ */ jsx_runtime.jsx("p", {
          children: "Couldn't show this hidden channel."
        })
      }) : this.props.children;
    }
  };
}
function renderLockScreen(channel) {
  if (!channel)
    return null;
  const ErrorBoundary = getBoundary();
  return /* @__PURE__ */ jsx_runtime.jsx(ErrorBoundary, {
    children: /* @__PURE__ */ jsx_runtime.jsx(LockScreen, {
      channel
    })
  }, channel.id);
}
var lockScreenCss = `
.evi-shc-container { display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; gap: 0.65em; margin: 0.5em 0; min-height: 100%; color: var(--text-default); font-size: 16px; line-height: 1.375; }
.evi-shc-container p { margin: 0; }
.evi-shc-container h2 { margin: 0; font-size: 32px; font-weight: 700; line-height: 1.25; color: var(--text-strong, var(--header-primary)); }
.evi-shc-container h3 { margin: 0; font-size: 18px; font-weight: 700; color: var(--text-strong, var(--header-primary)); }
.evi-shc-lead { font-size: 18px; }
.evi-shc-logo { width: 12em; height: 12em; }
.evi-shc-heading { display: flex; align-items: center; gap: 0.5em; }
.evi-shc-nsfw { color: var(--text-default); }
.evi-shc-box { display: flex; flex-direction: column; align-items: center; gap: 0.75em; padding: 0.75em; max-width: 70vw; border-radius: 8px; background: var(--background-base-lower); }
.evi-shc-row { display: flex; flex-direction: row; align-items: center; gap: 0.5em; }
.evi-shc-topic { display: block; text-align: start; }
.evi-shc-tags { display: flex; flex-wrap: wrap; align-items: center; justify-content: center; gap: 0.35em; }
.evi-shc-tag { display: inline-flex; align-items: center; gap: 4px; padding: 2px 8px; border-radius: 999px; font-size: 14px; background: var(--background-mod-normal, var(--background-base-low)); }
.evi-shc-emoji { font-size: 20px; line-height: 1; }
img.evi-shc-emoji { width: 20px; height: 20px; object-fit: contain; }
.evi-shc-tag .evi-shc-emoji { font-size: 14px; }
.evi-shc-tag img.evi-shc-emoji { width: 14px; height: 14px; }
.evi-shc-toggle { all: unset; display: flex; align-items: center; cursor: pointer; color: var(--text-default); border-radius: 4px; }
.evi-shc-toggle:focus-visible { outline: 2px solid var(--focus-primary, #00a8fc); }
.evi-shc-allowed > [class*="members"] { margin-left: 12px; flex-wrap: wrap; justify-content: center; }
`;

// plugins/show-hidden-channels/index.tsx
var jsx_runtime2 = require("react/jsx-runtime");
var channelListClasses = cssClasses("modeSelected", "modeMuted", "unread", "icon");
var mutedStyle = (channel) => setting("showMode") === "muted" && isHiddenChannel(channel);
function LockIcon() {
  return /* @__PURE__ */ jsx_runtime2.jsx("svg", {
    className: channelListClasses().icon,
    height: "18",
    width: "20",
    viewBox: "0 0 24 24",
    "aria-hidden": true,
    role: "img",
    children: /* @__PURE__ */ jsx_runtime2.jsx("path", {
      fill: "currentColor",
      fillRule: "evenodd",
      d: "M17 11V7C17 4.243 14.756 2 12 2C9.242 2 7 4.243 7 7V11C5.897 11 5 11.896 5 13V20C5 21.103 5.897 22 7 22H17C18.103 22 19 21.103 19 20V13C19 11.896 18.103 11 17 11ZM12 18C11.172 18 10.5 17.328 10.5 16.5C10.5 15.672 11.172 15 12 15C12.828 15 13.5 15.672 13.5 16.5C13.5 17.328 12.828 18 12 18ZM15 11H9V7C9 5.346 10.346 4 12 4C13.654 4 15 5.346 15 7V11Z"
    })
  });
}
function HiddenIcon() {
  const icon = (props) => /* @__PURE__ */ jsx_runtime2.jsx("svg", {
    ...props,
    className: [channelListClasses().icon, "evi-shc-hidden-icon"].filter(Boolean).join(" "),
    width: "24",
    height: "24",
    viewBox: "0 0 24 24",
    "aria-label": "Hidden channel",
    role: "img",
    children: /* @__PURE__ */ jsx_runtime2.jsx("path", {
      fill: "currentColor",
      fillRule: "evenodd",
      d: "m19.8 22.6-4.2-4.15q-.875.275-1.762.413Q12.95 19 12 19q-3.775 0-6.725-2.087Q2.325 14.825 1 11.5q.525-1.325 1.325-2.463Q3.125 7.9 4.15 7L1.4 4.2l1.4-1.4 18.4 18.4ZM12 16q.275 0 .512-.025.238-.025.513-.1l-5.4-5.4q-.075.275-.1.513-.025.237-.025.512 0 1.875 1.312 3.188Q10.125 16 12 16Zm7.3.45-3.175-3.15q.175-.425.275-.862.1-.438.1-.938 0-1.875-1.312-3.188Q13.875 7 12 7q-.5 0-.938.1-.437.1-.862.3L7.65 4.85q1.025-.425 2.1-.638Q10.825 4 12 4q3.775 0 6.725 2.087Q21.675 8.175 23 11.5q-.575 1.475-1.512 2.738Q20.55 15.5 19.3 16.45Zm-4.625-4.6-3-3q.7-.125 1.288.112.587.238 1.012.688.425.45.613 1.038.187.587.087 1.162Z"
    })
  });
  const Tooltip = import_api3.Components.Tooltip;
  return Tooltip ? /* @__PURE__ */ jsx_runtime2.jsx(Tooltip, {
    text: "Hidden channel",
    children: icon
  }) : icon({});
}
var filteredChannels = new WeakMap;
var isUncategorized = (entry) => entry.channel.id === "null" && entry.channel.name === "Uncategorized" && entry.comparator === -1;
var css = `
.evi-shc-hidden-icon { cursor: not-allowed; margin-left: 6px; z-index: 0; }
${lockScreenCss}
`;
var show_hidden_channels_default = import_api3.definePlugin({
  settings,
  css,
  patches: [
    {
      find: '"placeholder-channel-id"',
      replace: [
        {
          match: /if\(!\i\.\i\.can\(\i\.\i\.VIEW_CHANNEL.+?{if\(this\.id===\i\).+?threadIds:\[\]}}/,
          with: ""
        },
        {
          match: /(?<=&&)(?=!\i\.\i\.hasUnread\(this\.record\.id\))/,
          with: "$self.isHiddenChannel(this.record)||"
        },
        {
          match: /(this\.record\)\?{renderLevel:(.+?),threadIds.+?renderLevel:).+?(?=,threadIds)/g,
          with: (_, rest, defaultRenderLevel) => `${rest}${defaultRenderLevel}`
        },
        {
          match: /(getRenderLevel\(\i\){.+?return)!\i\.\i\.can\(\i\.\i\.VIEW_CHANNEL,this\.record\)\|\|/,
          with: (_, rest) => `${rest} `
        }
      ]
    },
    {
      find: "VoiceChannel, transitionTo: Channel does not have a guildId",
      replace: [
        {
          match: /(?<=getIgnoredUsersForVoiceChannel\((\i)\.id\)[^;]{0,300}?;return\()/,
          with: (_, channel) => `!$self.isHiddenChannel(${channel})&&`
        },
        {
          match: /(?=\|\|\i\.\i\.selectVoiceChannel\((\i)\.id\))/,
          with: (_, channel) => `||$self.isHiddenChannel(${channel})`
        },
        {
          match: /!__OVERLAY__&&\((?<=selectVoiceChannel\((\i)\.id\).+?)/,
          with: (m, channel) => `${m}$self.isHiddenChannel(${channel},true)||`
        }
      ]
    },
    {
      find: ".AUDIENCE),{isSubscriptionGated",
      replace: {
        match: /(\i)\.isRoleSubscriptionTemplatePreviewChannel\(\)/,
        with: (m, channel) => `${m}||$self.isHiddenChannel(${channel})`
      }
    },
    {
      find: 'tutorialId:"instant-invite"',
      replace: ["renderEditButton", "renderInviteButton"].map((fn) => ({
        match: new RegExp(`(?<=${fn}\\(\\){)`, "g"),
        with: "if($self.isHiddenChannel(this?.props?.channel))return null;"
      }))
    },
    {
      find: "VoiceChannel.renderPopout: There must always be something to render",
      all: true,
      replace: {
        match: /(?<=renderOpenChatButton(?:",|=)\(\)=>{)/,
        with: "if($self.isHiddenChannel(this?.props?.channel))return null;"
      }
    },
    {
      find: ".t.IzZTIe",
      replace: {
        match: /(?<=(\i)\.isNSFW\(\);)switch\(\i\.type\).{0,15}\.GUILD_ANNOUNCEMENT/,
        with: (m, channel) => `if($self.showLockIcon(${channel}))return $self.LockIcon;${m}`
      }
    },
    {
      find: "UNREAD_IMPORTANT:",
      replace: [
        {
          match: /Children\.count.+?;(?=return\(0,\i\.jsxs?\)\(\i\.\i,{focusTarget:)(?<={channel:(\i),name:\i,muted:(\i).+?;)/,
          with: (m, channel, muted) => `${m}${muted}=$self.mutedStyle(${channel})?true:${muted};`
        },
        {
          match: /\.Children\.count.+?:null(?<=,channel:(\i).+?)/,
          with: (m, channel) => `${m},$self.mutedStyle(${channel})?$self.HiddenChannelIcon():null`
        }
      ]
    },
    {
      find: "UNREAD_IMPORTANT:",
      predicate: () => setting("showMode") === "muted",
      replace: {
        match: /(?<=\?\i\.\i:\i\.\i,)(.{0,150}?)if\((\i)(?:\)return |\?)(\i\.MUTED)/,
        with: (_, otherClasses, isMuted, mutedClass) => `${isMuted}?${mutedClass}:"",${otherClasses}if(${isMuted})return ""`
      }
    },
    {
      find: "UNREAD_IMPORTANT:",
      replace: [
        {
          match: /(?<=\.LOCKED;if\()(?<={channel:(\i).+?)/,
          with: (_, channel) => `!$self.showUnreadWhileMuted(${channel})&&`
        },
        {
          match: /Children\.count.+?;(?=return\(0,\i\.jsxs?\)\(\i\.\i,{focusTarget:)(?<={channel:(\i),name:\i,.+?unread:(\i).+?)/,
          with: (m, channel, unread) => `${m}${unread}=$self.hideUnread(${channel})?false:${unread};`
        }
      ]
    },
    {
      find: '"ChannelListUnreadsStore"',
      replace: {
        match: /(?<=\.id\)\))(?=&&\(0,\i\.\i\)\((\i)\))/,
        with: (_, channel) => `&&!$self.isHiddenChannel(${channel})`
      }
    },
    {
      find: "renderBottomUnread(){",
      replace: {
        match: /(?<=!0\))(?=&&\(0,\i\.\i\)\((\i\.record)\))/,
        with: "&&!$self.isHiddenChannel($1)"
      }
    },
    {
      find: "GUILD_EVENT)}),[",
      replace: {
        match: /(?<=\.id\)\))(?=&&\(0,\i\.\i\)\((\i)\))/,
        with: "&&!$self.isHiddenChannel($1)"
      }
    },
    {
      find: "Missing channel in Channel.renderHeaderToolbar",
      replace: [
        {
          match: /renderHeaderToolbar(?:",|=)\(\)=>{.+?case \i\.\i\.GUILD_TEXT:(?=.+?(\i\.push.{0,50}channel:(\i)},"notifications"\)\)))(?<=isLurking:(\i).+?)/,
          with: (m, pushNotifications, channel, isLurking) => `${m}if(!${isLurking}&&$self.isHiddenChannel(${channel})){${pushNotifications};break;}`
        },
        {
          match: /renderHeaderToolbar(?:",|=)\(\)=>{.+?case \i\.\i\.GUILD_MEDIA:(?=.+?(\i\.push.{0,40}channel:(\i)},"notifications"\)\)))(?<=isLurking:(\i).+?)/,
          with: (m, pushNotifications, channel, isLurking) => `${m}if(!${isLurking}&&$self.isHiddenChannel(${channel})){${pushNotifications};break;}`
        },
        {
          match: /renderMobileToolbar(?:",|=)\(\)=>{.+?case \i\.\i\.GUILD_DIRECTORY:(?<=let{channel:(\i).+?)/,
          with: (m, channel) => `${m}if($self.isHiddenChannel(${channel}))break;`
        },
        {
          match: /(?<=renderHeaderBar(?:",|=)\(\)=>{.+?hideSearch:(\i)\.isDirectory\(\))/,
          with: (_, channel) => `||$self.isHiddenChannel(${channel})`
        },
        {
          match: /(?<=renderSidebar\(\){)/,
          with: "if($self.isHiddenChannel(this?.props?.channel))return null;"
        },
        {
          match: /(?<=renderChat\(\){)/,
          with: "if($self.isHiddenChannel(this?.props?.channel))return $self.HiddenChannelLockScreen(this?.props?.channel);"
        }
      ]
    },
    {
      find: '"MessageManager"',
      replace: {
        match: /forceFetch:\i,isPreload:.+?}=\i;(?=.+?getChannel\((\i)\))/,
        with: (m, channelId) => `${m}if($self.isHiddenChannel({channelId:${channelId}}))return;`
      }
    },
    {
      find: '"alt+shift+down"',
      replace: {
        match: /(?<=getChannel\(\i\);return null!=(\i))(?=.{0,200}?>0\)&&\(0,\i\.\i\)\(\i\))/,
        with: (_, channel) => `&&!$self.isHiddenChannel(${channel})`
      }
    },
    {
      find: ".APPLICATION_STORE&&null!=",
      replace: {
        match: /getState\(\)\.channelId.+?(?=\.map\(\i=>\i\.id)/,
        with: "$&.filter(e=>!$self.isHiddenChannel(e))"
      }
    },
    {
      find: ".t.rt0ERW",
      replace: [
        {
          match: /(forceRoles:.+?)(\i\.\i\(\i\.\i\.ADMINISTRATOR,\i\.\i\.VIEW_CHANNEL\))(?<=context:(\i)}.+?)/,
          with: (_, rest, mergedPermissions, channel) => `${rest}$self.swapViewChannelWithConnectPermission(${mergedPermissions},${channel})`
        },
        {
          match: /permissionOverwrites\[.+?\i=(?<=context:(\i)}.+?)(?=(.+?)VIEW_CHANNEL)/,
          with: (m, channel, permCheck) => `${m}!$self.canConnect(${channel})?${permCheck}CONNECT):`
        },
        {
          match: /getSortedRoles.+?\.filter\(\i=>(?=!)/,
          with: (m) => `${m}$self.isHiddenChannel(arguments[0]?.channel)?true:`
        },
        {
          match: /forceRoles:.+?.value\(\)(?<=channel:(\i).+?)/,
          with: (m, channel) => `${m}.reduce(...$self.makeAllowedRolesReduce(${channel}.guild_id))`
        },
        {
          match: /return\(0,\i\.jsxs?\)\(\i\.\i,{channelId:(\i)\.id,children:\[(?=.{0,1000}?(\(0,\i\.jsxs?\)\("div",{className:\i\.\i,children:\[.{0,100}\i\.length>0.+?\]}\)),)/,
          with: (m, channel, allowedUsersAndRoles) => `if($self.isHiddenChannel(${channel},true)){return${allowedUsersAndRoles};}${m}`
        },
        {
          match: /maxUsers:\d+?,users:\i(?<=channel:(\i).+?)/,
          with: (m, channel) => `${m},shcChannel:${channel}`
        },
        {
          match: /1!==\i\.length(?=\|\|)/,
          with: "true"
        }
      ]
    },
    {
      find: '="interactive-text-default",overflowCountClassName:',
      replace: [
        {
          match: /let{users:\i,maxUsers:\i,/,
          with: "let{shcChannel}=arguments[0];$&"
        },
        {
          match: /\i>0(?=&&!\i&&!\i)/,
          with: (m) => `($self.isHiddenChannel(typeof shcChannel!=="undefined"?shcChannel:void 0,true)?true:${m})`
        },
        {
          match: /(?<=`\+\$\{)\i(?=\})/,
          with: (overflow) => `$self.isHiddenChannel(typeof shcChannel!=="undefined"?shcChannel:void 0,true)&&(${overflow}-1)<=0?"":${overflow}`
        }
      ]
    },
    {
      find: ".t.JjdizN",
      replace: {
        match: /(?<=&&)\i\.push\(.{0,120}"chat-spacer"/,
        with: "(arguments[0]?.inCall||!$self.isHiddenChannel(arguments[0]?.channel,true))&&$&"
      }
    },
    {
      find: '.t["AlJyI+"]',
      replace: [
        {
          match: /renderContent\(\i\){.+?this\.renderVoiceChannelEffects.+?children:/,
          with: "$&!this?.props?.inCall&&$self.isHiddenChannel(this?.props?.channel,true)?$self.HiddenChannelLockScreen(this?.props?.channel):"
        },
        {
          match: /renderContent\(\i\){.+?disableGradients:/,
          with: "$&!this?.props?.inCall&&$self.isHiddenChannel(this?.props?.channel,true)||"
        },
        {
          match: /(?:{|,)render(?!Header|ExternalHeader).{0,30}?:/g,
          with: "$&!this?.props?.inCall&&$self.isHiddenChannel(this?.props?.channel,true)?()=>null:"
        },
        {
          match: /(?=\i\|\|\i!==\i\.\i\.FULL_SCREEN.{0,100}?this\._callContainerRef)/,
          with: '$&!this?.props?.inCall&&$self.isHiddenChannel(this?.props?.channel,true)?"":'
        }
      ]
    },
    {
      find: '"HasBeenInStageChannel"',
      replace: [
        {
          match: /screenMessage:(\i)\?.+?children:(?=!\1)(?<=let \i,{channel:(\i).+?)/,
          with: (m, _isPopoutOpen, channel) => `${m}$self.isHiddenChannel(${channel})?$self.HiddenChannelLockScreen(${channel}):`
        },
        {
          match: /render(?:BottomLeft|BottomCenter|BottomRight|ChatToasts):\(\)=>(?<=let \i,{channel:(\i).+?)/g,
          with: (m, channel) => `${m}$self.isHiddenChannel(${channel})?null:`
        },
        {
          match: /"124px".+?disableGradients:(?<=let \i,{channel:(\i).+?)/,
          with: (m, channel) => `${m}$self.isHiddenChannel(${channel})||`
        },
        {
          match: /"124px".+?style:(?<=let \i,{channel:(\i).+?)/,
          with: (m, channel) => `${m}$self.isHiddenChannel(${channel})?void 0:`
        }
      ]
    },
    {
      find: '.t["T+zF9M"]',
      replace: [
        {
          match: /\(0,\i\.jsx\)\(\i\.\i\.Divider.+?}\)]}\)(?=.+?:(\i)\.guild_id)/,
          with: (m, channel) => `$self.isHiddenChannel(${channel})?null:(${m})`
        },
        {
          match: /(?<=numRequestToSpeak:\i\}\)\}\):null,!\i&&)\(0,\i\.jsxs?\).{0,280}?iconClassName:/,
          with: "!$self.isHiddenChannel(arguments[0]?.channel,true)&&$&"
        }
      ]
    },
    {
      find: ",queryStaticRouteChannels(",
      replace: [
        {
          match: /(?<=queryChannels\(\i\){.+?getChannels\(\i)(?=\))/,
          with: ",true"
        },
        {
          match: /(?<=queryChannels\(\i\){.+?\)\((\i)\.type\))(?=&&!\i\.\i\.can\()/,
          with: "&&!$self.isHiddenChannel($1)"
        }
      ]
    },
    {
      find: '"^/guild-stages/(\\\\d+)(?:/)?(\\\\d+)?"',
      replace: {
        match: /\i\.\i\.can\(\i\.\i\.VIEW_CHANNEL,\i\)/,
        with: "true"
      }
    },
    {
      find: 'getConfig({location:"channel_mention"})',
      replace: {
        match: /(?<=getChannel\(\i\);if\(null!=(\i)).{0,200}?return void (?=\i\.default\.selectVoiceChannel)/,
        with: (m, channel) => `${m}!$self.isHiddenChannel(${channel})&&`
      }
    },
    {
      find: '"GuildChannelStore"',
      replace: [
        {
          match: /isChannelGated\(.+?\)(?=&&)/,
          with: (m) => `${m}&&false`
        },
        {
          match: /(?<=getChannels\(\i)(\){.*?)return (.+?)}/,
          with: (_, rest, channels) => `,shouldIncludeHidden${rest}return $self.resolveGuildChannels(${channels},shouldIncludeHidden??arguments[0]==="@favorites");}`
        }
      ]
    },
    {
      find: "GuildTooltip - ",
      replace: {
        match: /(?<=getChannels\(\i)(?=\))/,
        with: ",true"
      }
    },
    {
      find: '"NowPlayingViewStore"',
      replace: {
        match: /(getVoiceStateForUser.{0,150}?)&&\i\.\i\.canWithPartialContext.{0,20}VIEW_CHANNEL.+?}\)(?=\?)/,
        with: "$1"
      }
    },
    {
      find: ".t.rt0ERW",
      replace: {
        match: /(?=function (\i)\(\i\){let{channel:.{0,200}?getSortedRoles\()/,
        with: "$self.ChannelBeginHeader=$1;"
      }
    },
    {
      find: "2026-02-private-channel-hiding",
      replace: {
        match: /(?<=enableObfuscation|enableIntegrityCheck):!0/g,
        with: ":false"
      }
    }
  ],
  set ChannelBeginHeader(component) {
    setChannelBeginHeader(component);
  },
  isHiddenChannel,
  mutedStyle,
  showLockIcon: (channel) => setting("showMode") === "lock" && isHiddenChannel(channel),
  hideUnread: (channel) => setting("hideUnreads") && isHiddenChannel(channel),
  showUnreadWhileMuted: (channel) => !setting("hideUnreads") && mutedStyle(channel),
  canConnect: (channel) => !!store("PermissionStore")?.can(Permissions.CONNECT, channel),
  swapViewChannelWithConnectPermission(mergedPermissions, channel) {
    if (!store("PermissionStore")?.can(Permissions.CONNECT, channel)) {
      mergedPermissions &= ~Permissions.VIEW_CHANNEL;
      mergedPermissions |= Permissions.CONNECT;
    }
    return mergedPermissions;
  },
  resolveGuildChannels(channels, includeHidden) {
    if (includeHidden || !channels || typeof channels !== "object")
      return channels;
    let result = filteredChannels.get(channels);
    if (result)
      return result;
    result = {};
    for (const [key, entries] of Object.entries(channels)) {
      if (!Array.isArray(entries)) {
        result[key] = entries;
        continue;
      }
      result[key] = entries.filter((entry) => isUncategorized(entry) || entry.channel.id === null || !isHiddenChannel(entry.channel));
    }
    filteredChannels.set(channels, result);
    return result;
  },
  makeAllowedRolesReduce(guildId) {
    return [
      (prev, _role, index, roles) => {
        if (index !== 0)
          return prev;
        const everyone = roles.find((role) => role.id === guildId);
        return everyone ? [everyone] : roles;
      },
      []
    ];
  },
  HiddenChannelLockScreen: renderLockScreen,
  LockIcon,
  HiddenChannelIcon: () => /* @__PURE__ */ jsx_runtime2.jsx(HiddenIcon, {}),
  start(ctx) {
    setContext(ctx);
    const permissions = store("PermissionStore");
    const reset = () => void (filteredChannels = new WeakMap);
    permissions?.addChangeListener?.(reset);
    ctx.onDispose(() => permissions?.removeChangeListener?.(reset));
  },
  stop() {
    setContext(undefined);
  }
});
