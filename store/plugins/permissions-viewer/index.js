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

// plugins/permissions-viewer/index.tsx
var exports_permissions_viewer = {};
__export(exports_permissions_viewer, {
  default: () => permissions_viewer_default
});
module.exports = __toCommonJS(exports_permissions_viewer);
var import_api = require("@evi/api");

// plugins/permissions-viewer/perms.ts
var TABLE = [
  [0, "CREATE_INSTANT_INVITE", "Create Invite"],
  [1, "KICK_MEMBERS", "Kick Members"],
  [2, "BAN_MEMBERS", "Ban Members"],
  [3, "ADMINISTRATOR", "Administrator"],
  [4, "MANAGE_CHANNELS", "Manage Channels"],
  [5, "MANAGE_GUILD", "Manage Server"],
  [6, "ADD_REACTIONS", "Add Reactions"],
  [7, "VIEW_AUDIT_LOG", "View Audit Log"],
  [8, "PRIORITY_SPEAKER", "Priority Speaker"],
  [9, "STREAM", "Video"],
  [10, "VIEW_CHANNEL", "View Channels"],
  [11, "SEND_MESSAGES", "Send Messages"],
  [12, "SEND_TTS_MESSAGES", "Send Text-to-Speech Messages"],
  [13, "MANAGE_MESSAGES", "Manage Messages"],
  [14, "EMBED_LINKS", "Embed Links"],
  [15, "ATTACH_FILES", "Attach Files"],
  [16, "READ_MESSAGE_HISTORY", "Read Message History"],
  [17, "MENTION_EVERYONE", "Mention @everyone, @here and All Roles"],
  [18, "USE_EXTERNAL_EMOJIS", "Use External Emoji"],
  [19, "VIEW_GUILD_INSIGHTS", "View Server Insights"],
  [20, "CONNECT", "Connect"],
  [21, "SPEAK", "Speak"],
  [22, "MUTE_MEMBERS", "Mute Members"],
  [23, "DEAFEN_MEMBERS", "Deafen Members"],
  [24, "MOVE_MEMBERS", "Move Members"],
  [25, "USE_VAD", "Use Voice Activity"],
  [26, "CHANGE_NICKNAME", "Change Nickname"],
  [27, "MANAGE_NICKNAMES", "Manage Nicknames"],
  [28, "MANAGE_ROLES", "Manage Roles"],
  [29, "MANAGE_WEBHOOKS", "Manage Webhooks"],
  [30, "MANAGE_GUILD_EXPRESSIONS", "Manage Expressions"],
  [31, "USE_APPLICATION_COMMANDS", "Use Application Commands"],
  [32, "REQUEST_TO_SPEAK", "Request to Speak"],
  [33, "MANAGE_EVENTS", "Manage Events"],
  [34, "MANAGE_THREADS", "Manage Threads"],
  [35, "CREATE_PUBLIC_THREADS", "Create Public Threads"],
  [36, "CREATE_PRIVATE_THREADS", "Create Private Threads"],
  [37, "USE_EXTERNAL_STICKERS", "Use External Stickers"],
  [38, "SEND_MESSAGES_IN_THREADS", "Send Messages in Threads"],
  [39, "USE_EMBEDDED_ACTIVITIES", "Use Activities"],
  [40, "MODERATE_MEMBERS", "Timeout Members"],
  [41, "VIEW_CREATOR_MONETIZATION_ANALYTICS", "View Server Subscription Insights"],
  [42, "USE_SOUNDBOARD", "Use Soundboard"],
  [43, "CREATE_GUILD_EXPRESSIONS", "Create Expressions"],
  [44, "CREATE_EVENTS", "Create Events"],
  [45, "USE_EXTERNAL_SOUNDS", "Use External Sounds"],
  [46, "SEND_VOICE_MESSAGES", "Send Voice Messages"],
  [49, "SEND_POLLS", "Create Polls"],
  [50, "USE_EXTERNAL_APPS", "Use External Apps"],
  [51, "PIN_MESSAGES", "Pin Messages"],
  [52, "BYPASS_SLOWMODE", "Bypass Slowmode"]
];
var PERMISSIONS = TABLE.map(([bit, key, name]) => ({ bit, flag: 1n << BigInt(bit), key, name }));
var Permission = Object.fromEntries(PERMISSIONS.map((p) => [p.key, p.flag]));
var ADMINISTRATOR = 1n << 3n;
var ALL_PERMISSIONS = PERMISSIONS.reduce((all, p) => all | p.flag, 0n);
function permissionsIn(bits) {
  const known = PERMISSIONS.filter((p) => bits & p.flag);
  const unknown = [];
  for (let bit = 0;bit < 64; bit++) {
    const flag = 1n << BigInt(bit);
    if (bits & flag && !(ALL_PERMISSIONS & flag))
      unknown.push({ bit, flag, key: `BIT_${bit}`, name: `Unknown (bit ${bit})` });
  }
  return [...known, ...unknown];
}
function toBits(value) {
  if (typeof value === "bigint")
    return value;
  if (typeof value === "number" && Number.isFinite(value))
    return BigInt(Math.trunc(value));
  if (typeof value === "string" && /^\d+$/.test(value))
    return BigInt(value);
  return 0n;
}
var list = (v) => !v ? [] : Array.isArray(v) ? v : Object.values(v);
var isMemberOverwrite = (o) => o.type === 1 || o.type === "member" || o.type === "1";
function sortRoles(roles, guildId) {
  return [...roles].sort((a, b) => (a.id === guildId ? 1 : 0) - (b.id === guildId ? 1 : 0) || (b.position ?? 0) - (a.position ?? 0));
}
function computePermissions(input) {
  const { guildId, userId } = input;
  const byId = new Map(list(input.roles).map((r) => [r.id, r]));
  const everyone = byId.get(guildId);
  const memberRoles = sortRoles(input.memberRoleIds.filter((id) => id !== guildId).flatMap((id) => byId.get(id) ?? []), guildId);
  const baseRoles = [...memberRoles, ...everyone ? [everyone] : []];
  const sources = new Map;
  let perms = 0n;
  for (const role of [...baseRoles].reverse())
    perms |= toBits(role.permissions);
  const everything = (source) => ({
    permissions: ALL_PERMISSIONS,
    entries: PERMISSIONS.map((p) => ({ ...p, granted: true, source }))
  });
  if (input.ownerId && input.ownerId === userId)
    return everything({ kind: "owner" });
  if (perms & ADMINISTRATOR) {
    const admin = baseRoles.find((r) => toBits(r.permissions) & ADMINISTRATOR);
    return everything({ kind: "administrator", roleId: admin.id });
  }
  for (const p of PERMISSIONS) {
    const role = baseRoles.find((r) => toBits(r.permissions) & p.flag);
    if (role)
      sources.set(p.flag, { kind: "role", roleId: role.id });
  }
  if (input.overwrites) {
    const overwrites = list(input.overwrites);
    const apply = (allow2, deny2, source) => {
      perms &= ~deny2;
      perms |= allow2;
      for (const p of PERMISSIONS) {
        if (allow2 & p.flag)
          sources.set(p.flag, source(p.flag, true));
        else if (deny2 & p.flag)
          sources.set(p.flag, source(p.flag, false));
      }
    };
    const everyoneOw = overwrites.find((o) => o.id === guildId && !isMemberOverwrite(o));
    if (everyoneOw)
      apply(toBits(everyoneOw.allow), toBits(everyoneOw.deny), () => ({ kind: "overwrite", target: "everyone", id: guildId }));
    const memberRoleIds = new Set(memberRoles.map((r) => r.id));
    const roleOws = sortRoles(overwrites.filter((o) => !isMemberOverwrite(o) && o.id !== guildId && memberRoleIds.has(o.id)).map((o) => ({ ...o, permissions: 0n, position: byId.get(o.id)?.position })), guildId);
    let allow = 0n, deny = 0n;
    for (const o of roleOws) {
      allow |= toBits(o.allow);
      deny |= toBits(o.deny);
    }
    apply(allow, deny, (flag, allowed) => ({
      kind: "overwrite",
      target: "role",
      id: roleOws.find((o) => toBits(allowed ? o.allow : o.deny) & flag).id
    }));
    const memberOw = overwrites.find((o) => o.id === userId && isMemberOverwrite(o));
    if (memberOw)
      apply(toBits(memberOw.allow), toBits(memberOw.deny), () => ({ kind: "overwrite", target: "member", id: userId }));
  }
  return {
    permissions: perms,
    entries: PERMISSIONS.map((p) => ({ ...p, granted: !!(perms & p.flag), source: sources.get(p.flag) ?? { kind: "none" } }))
  };
}
function summarizeOverwrites(guildId, overwrites, roles = []) {
  const position = new Map(list(roles).map((r) => [r.id, r.position ?? 0]));
  const rank = (o) => o.id === guildId && !isMemberOverwrite(o) ? 0 : isMemberOverwrite(o) ? 2 : 1;
  return list(overwrites).sort((a, b) => rank(a) - rank(b) || (position.get(b.id) ?? 0) - (position.get(a.id) ?? 0)).map((o) => ({
    id: o.id,
    target: rank(o) === 0 ? "everyone" : rank(o) === 1 ? "role" : "member",
    allowed: permissionsIn(toBits(o.allow)),
    denied: permissionsIn(toBits(o.deny))
  }));
}

// plugins/permissions-viewer/index.tsx
var jsx_runtime = require("react/jsx-runtime");
var store = (name) => {
  try {
    return import_api.getStore(name);
  } catch {
    return;
  }
};
function guildRoles(guildId) {
  const guild = store("GuildStore")?.getGuild?.(guildId);
  const roleStore = store("GuildRoleStore");
  let raw;
  try {
    raw = roleStore?.getRolesSnapshot?.(guildId) ?? roleStore?.getRoles?.(guildId) ?? roleStore?.getSortedRoles?.(guildId);
  } catch {}
  raw ??= guild?.roles;
  const list2 = !raw ? [] : Array.isArray(raw) ? raw : Object.values(raw);
  return sortRoles(list2.filter((r) => r?.id).map((r) => ({
    id: r.id,
    name: r.id === guildId ? "@everyone" : r.name ?? r.id,
    permissions: toBits(r.permissions),
    position: r.position ?? 0,
    color: r.colorString ?? undefined
  })), guildId);
}
var getGuild = (id) => id ? store("GuildStore")?.getGuild?.(id) : undefined;
var getChannel = (id) => id ? store("ChannelStore")?.getChannel?.(id) : undefined;
var memberRoleIds = (guildId, userId) => store("GuildMemberStore")?.getMember?.(guildId, userId)?.roles;
var ownId = () => store("UserStore")?.getCurrentUser?.()?.id;
function userName(guildId, userId) {
  const nick = guildId ? store("GuildMemberStore")?.getMember?.(guildId, userId)?.nick : undefined;
  const user = store("UserStore")?.getUser?.(userId);
  return nick || user?.globalName || user?.username || userId;
}
var attempt = (fn) => {
  try {
    return fn();
  } catch {
    return;
  }
};
function overwritesOf(channel) {
  const source = channel?.isThread?.() ? getChannel(channel.parent_id) ?? channel : channel;
  const raw = source?.permissionOverwrites ?? {};
  return Object.values(raw).map((o) => ({ id: o.id, type: o.type, allow: toBits(o.allow), deny: toBits(o.deny) }));
}
var channelLabel = (channel) => channel?.name ? `#${channel.name}` : "this channel";
var CATEGORIES = [
  ["General", ["VIEW_CHANNEL", "MANAGE_CHANNELS", "MANAGE_ROLES", "CREATE_GUILD_EXPRESSIONS", "MANAGE_GUILD_EXPRESSIONS", "VIEW_AUDIT_LOG", "VIEW_GUILD_INSIGHTS", "VIEW_CREATOR_MONETIZATION_ANALYTICS", "MANAGE_WEBHOOKS", "MANAGE_GUILD"]],
  ["Membership", ["CREATE_INSTANT_INVITE", "CHANGE_NICKNAME", "MANAGE_NICKNAMES", "KICK_MEMBERS", "BAN_MEMBERS", "MODERATE_MEMBERS"]],
  ["Text", ["SEND_MESSAGES", "SEND_MESSAGES_IN_THREADS", "CREATE_PUBLIC_THREADS", "CREATE_PRIVATE_THREADS", "EMBED_LINKS", "ATTACH_FILES", "ADD_REACTIONS", "USE_EXTERNAL_EMOJIS", "USE_EXTERNAL_STICKERS", "MENTION_EVERYONE", "MANAGE_MESSAGES", "PIN_MESSAGES", "BYPASS_SLOWMODE", "MANAGE_THREADS", "READ_MESSAGE_HISTORY", "SEND_TTS_MESSAGES", "SEND_VOICE_MESSAGES", "SEND_POLLS"]],
  ["Voice", ["CONNECT", "SPEAK", "STREAM", "USE_SOUNDBOARD", "USE_EXTERNAL_SOUNDS", "USE_VAD", "PRIORITY_SPEAKER", "MUTE_MEMBERS", "DEAFEN_MEMBERS", "MOVE_MEMBERS", "REQUEST_TO_SPEAK"]],
  ["Apps", ["USE_APPLICATION_COMMANDS", "USE_EMBEDDED_ACTIVITIES", "USE_EXTERNAL_APPS"]],
  ["Events", ["CREATE_EVENTS", "MANAGE_EVENTS"]],
  ["Advanced", ["ADMINISTRATOR"]]
];
var ORDER = new Map(CATEGORIES.flatMap(([category, keys]) => keys.map((key, i) => [key, { category, i }])));
function byCategory(items) {
  const groups = new Map([...CATEGORIES.map(([c]) => [c, []]), ["Other", []]]);
  for (const item of items)
    groups.get(ORDER.get(item.key)?.category ?? "Other").push(item);
  for (const list2 of groups.values())
    list2.sort((a, b) => (ORDER.get(a.key)?.i ?? 99) - (ORDER.get(b.key)?.i ?? 99));
  return [...groups].filter(([, list2]) => list2.length);
}
var closeOpen;
function openDialog(subject, sections) {
  closeOpen?.();
  const container = document.createElement("div");
  document.body.append(container);
  const root = import_api.createRoot(container);
  const close = () => {
    if (closeOpen !== close)
      return;
    closeOpen = undefined;
    root.unmount();
    container.remove();
  };
  closeOpen = close;
  root.render(/* @__PURE__ */ jsx_runtime.jsx(Dialog, {
    subject,
    sections,
    onClose: close
  }));
}
function Dialog({ subject, sections, onClose }) {
  const [selected, setSelected] = import_api.React.useState(sections[0]?.key);
  const [filter, setFilter] = import_api.React.useState("all");
  const [query, setQuery] = import_api.React.useState("");
  const ref = import_api.React.useRef(null);
  const searchRef = import_api.React.useRef(null);
  const current = sections.find((s) => s.key === selected) ?? sections[0];
  import_api.React.useEffect(() => {
    const previous = document.activeElement;
    (searchRef.current ?? ref.current)?.focus();
    const onKey = (e) => {
      if (e.key !== "Escape")
        return;
      e.preventDefault();
      e.stopImmediatePropagation();
      const search = searchRef.current;
      if (search && document.activeElement === search && search.value)
        setQuery("");
      else
        onClose();
    };
    window.addEventListener("keydown", onKey, true);
    return () => {
      window.removeEventListener("keydown", onKey, true);
      previous?.focus?.();
    };
  }, []);
  const items = current?.items ?? [];
  const granted = items.filter((i) => i.state === "allow").length;
  const q = query.trim().toLowerCase();
  const visible = items.filter((i) => (filter === "all" || filter === "allow" === (i.state === "allow")) && (!q || i.name.toLowerCase().includes(q)));
  const labels = current?.overwrite ? ["Allowed", "Denied"] : ["Granted", "Not granted"];
  const filters = [["all", "All", items.length], ["allow", labels[0], granted], ["off", labels[1], items.length - granted]];
  return /* @__PURE__ */ jsx_runtime.jsx("div", {
    className: "evi-pv-scrim",
    onMouseDown: (e) => e.target === e.currentTarget && onClose(),
    children: /* @__PURE__ */ jsx_runtime.jsxs("div", {
      className: "evi-pv-modal",
      role: "dialog",
      "aria-modal": "true",
      "aria-labelledby": "evi-pv-title",
      "aria-describedby": "evi-pv-subtitle",
      tabIndex: -1,
      ref,
      children: [
        /* @__PURE__ */ jsx_runtime.jsxs("header", {
          className: "evi-pv-head",
          children: [
            /* @__PURE__ */ jsx_runtime.jsx(SubjectIcon, {
              subject
            }),
            /* @__PURE__ */ jsx_runtime.jsxs("div", {
              className: "evi-pv-titles",
              children: [
                /* @__PURE__ */ jsx_runtime.jsx("h2", {
                  id: "evi-pv-title",
                  children: subject.title
                }),
                /* @__PURE__ */ jsx_runtime.jsx("p", {
                  id: "evi-pv-subtitle",
                  children: subject.subtitle
                })
              ]
            }),
            /* @__PURE__ */ jsx_runtime.jsx("button", {
              className: "evi-pv-close",
              "aria-label": "Close",
              onClick: onClose,
              children: /* @__PURE__ */ jsx_runtime.jsx("svg", {
                viewBox: "0 0 24 24",
                width: "18",
                height: "18",
                "aria-hidden": "true",
                children: /* @__PURE__ */ jsx_runtime.jsx("path", {
                  d: "M6 6l12 12M18 6L6 18",
                  stroke: "currentColor",
                  strokeWidth: "2",
                  strokeLinecap: "round"
                })
              })
            })
          ]
        }),
        /* @__PURE__ */ jsx_runtime.jsxs("div", {
          className: "evi-pv-main",
          children: [
            sections.length > 1 && /* @__PURE__ */ jsx_runtime.jsx("nav", {
              className: "evi-pv-nav",
              "aria-label": "Sections",
              children: sections.map((s, i) => /* @__PURE__ */ jsx_runtime.jsxs(import_api.React.Fragment, {
                children: [
                  s.group && s.group !== sections[i - 1]?.group && /* @__PURE__ */ jsx_runtime.jsx("h3", {
                    className: "evi-pv-nav-group",
                    children: s.group
                  }),
                  /* @__PURE__ */ jsx_runtime.jsxs("button", {
                    className: "evi-pv-tab",
                    "aria-current": s.key === current?.key,
                    onClick: () => setSelected(s.key),
                    children: [
                      /* @__PURE__ */ jsx_runtime.jsx("span", {
                        className: "evi-pv-dot",
                        style: s.color ? { background: s.color } : undefined,
                        "data-empty": !s.color || undefined
                      }),
                      /* @__PURE__ */ jsx_runtime.jsx("span", {
                        className: "evi-pv-tab-label",
                        title: s.label,
                        children: s.label
                      }),
                      /* @__PURE__ */ jsx_runtime.jsx(TabCount, {
                        section: s
                      })
                    ]
                  })
                ]
              }, s.key))
            }),
            /* @__PURE__ */ jsx_runtime.jsxs("div", {
              className: "evi-pv-body",
              children: [
                items.length > 0 && /* @__PURE__ */ jsx_runtime.jsxs("div", {
                  className: "evi-pv-toolbar",
                  children: [
                    /* @__PURE__ */ jsx_runtime.jsx("div", {
                      className: "evi-pv-seg",
                      role: "group",
                      "aria-label": "Show",
                      children: filters.map(([key, label, count]) => /* @__PURE__ */ jsx_runtime.jsxs("button", {
                        "aria-pressed": filter === key,
                        onClick: () => setFilter(key),
                        children: [
                          label,
                          /* @__PURE__ */ jsx_runtime.jsx("span", {
                            className: "evi-pv-seg-count",
                            children: count
                          })
                        ]
                      }, key))
                    }),
                    /* @__PURE__ */ jsx_runtime.jsxs("label", {
                      className: "evi-pv-search",
                      children: [
                        /* @__PURE__ */ jsx_runtime.jsxs("svg", {
                          viewBox: "0 0 24 24",
                          width: "16",
                          height: "16",
                          "aria-hidden": "true",
                          children: [
                            /* @__PURE__ */ jsx_runtime.jsx("circle", {
                              cx: "11",
                              cy: "11",
                              r: "6.5",
                              fill: "none",
                              stroke: "currentColor",
                              strokeWidth: "2"
                            }),
                            /* @__PURE__ */ jsx_runtime.jsx("path", {
                              d: "M16 16l4 4",
                              stroke: "currentColor",
                              strokeWidth: "2",
                              strokeLinecap: "round"
                            })
                          ]
                        }),
                        /* @__PURE__ */ jsx_runtime.jsx("span", {
                          className: "evi-pv-sr",
                          children: "Search permissions"
                        }),
                        /* @__PURE__ */ jsx_runtime.jsx("input", {
                          ref: searchRef,
                          type: "search",
                          inputMode: "search",
                          placeholder: "Search",
                          autoComplete: "off",
                          spellCheck: false,
                          value: query,
                          onChange: (e) => setQuery(e.target.value)
                        })
                      ]
                    })
                  ]
                }),
                /* @__PURE__ */ jsx_runtime.jsxs("div", {
                  className: "evi-pv-scroll",
                  children: [
                    current?.notice && /* @__PURE__ */ jsx_runtime.jsx(Notice, {
                      children: current.notice
                    }),
                    !items.length ? /* @__PURE__ */ jsx_runtime.jsx("p", {
                      className: "evi-pv-empty",
                      children: current?.empty ?? "Nothing to show."
                    }) : !visible.length ? /* @__PURE__ */ jsx_runtime.jsxs("div", {
                      className: "evi-pv-empty",
                      children: [
                        /* @__PURE__ */ jsx_runtime.jsx("p", {
                          children: q ? `No ${filter === "all" ? "" : `${filters.find((f) => f[0] === filter)[1].toLowerCase()} `}permissions match “${query.trim()}”.` : `No permissions are ${filters.find((f) => f[0] === filter)[1].toLowerCase()} here.`
                        }),
                        /* @__PURE__ */ jsx_runtime.jsx("button", {
                          className: "evi-pv-link",
                          onClick: () => {
                            setFilter("all");
                            setQuery("");
                          },
                          children: "Show all permissions"
                        })
                      ]
                    }) : byCategory(visible).map(([category, list2]) => {
                      const all = items.filter((i) => (ORDER.get(i.key)?.category ?? "Other") === category);
                      return /* @__PURE__ */ jsx_runtime.jsxs("section", {
                        className: "evi-pv-group",
                        "aria-label": category,
                        children: [
                          /* @__PURE__ */ jsx_runtime.jsxs("h3", {
                            className: "evi-pv-heading",
                            children: [
                              /* @__PURE__ */ jsx_runtime.jsx("span", {
                                children: category
                              }),
                              /* @__PURE__ */ jsx_runtime.jsx("span", {
                                className: "evi-pv-heading-count",
                                children: current.overwrite ? list2.length : `${all.filter((i) => i.state === "allow").length} of ${all.length}`
                              })
                            ]
                          }),
                          /* @__PURE__ */ jsx_runtime.jsx("ul", {
                            className: "evi-pv-list",
                            children: list2.map((i) => /* @__PURE__ */ jsx_runtime.jsx(Row, {
                              item: i
                            }, i.key))
                          })
                        ]
                      }, category);
                    })
                  ]
                }, current?.key)
              ]
            })
          ]
        })
      ]
    })
  });
}
function SubjectIcon({ subject }) {
  const [broken, setBroken] = import_api.React.useState(false);
  if (subject.image && !broken)
    return /* @__PURE__ */ jsx_runtime.jsx("img", {
      className: "evi-pv-avatar",
      src: subject.image,
      alt: "",
      onError: () => setBroken(true)
    });
  return /* @__PURE__ */ jsx_runtime.jsx("span", {
    className: "evi-pv-avatar",
    "data-glyph": "",
    style: subject.color ? { "--evi-pv-tint": subject.color } : undefined,
    "aria-hidden": "true",
    children: subject.glyph
  });
}
function TabCount({ section }) {
  if (!section.items.length)
    return null;
  const allowed = section.items.filter((i) => i.state === "allow").length;
  if (!section.overwrite)
    return /* @__PURE__ */ jsx_runtime.jsx("span", {
      className: "evi-pv-tab-count",
      title: `${allowed} granted`,
      children: allowed
    });
  const denied = section.items.length - allowed;
  return /* @__PURE__ */ jsx_runtime.jsxs("span", {
    className: "evi-pv-tab-count",
    title: `${allowed} allowed, ${denied} denied`,
    children: [
      allowed > 0 && /* @__PURE__ */ jsx_runtime.jsxs("span", {
        "data-state": "allow",
        children: [
          "+",
          allowed
        ]
      }),
      denied > 0 && /* @__PURE__ */ jsx_runtime.jsxs("span", {
        "data-state": "deny",
        children: [
          "−",
          denied
        ]
      })
    ]
  });
}
var Notice = ({ children }) => /* @__PURE__ */ jsx_runtime.jsxs("p", {
  className: "evi-pv-notice",
  children: [
    /* @__PURE__ */ jsx_runtime.jsxs("svg", {
      viewBox: "0 0 24 24",
      width: "16",
      height: "16",
      "aria-hidden": "true",
      children: [
        /* @__PURE__ */ jsx_runtime.jsx("circle", {
          cx: "12",
          cy: "12",
          r: "9",
          fill: "none",
          stroke: "currentColor",
          strokeWidth: "2"
        }),
        /* @__PURE__ */ jsx_runtime.jsx("path", {
          d: "M12 11v5M12 8h.01",
          stroke: "currentColor",
          strokeWidth: "2",
          strokeLinecap: "round"
        })
      ]
    }),
    /* @__PURE__ */ jsx_runtime.jsx("span", {
      children
    })
  ]
});
var MARKS = {
  allow: ["Granted", "M6.5 12.5l3.5 3.5 7.5-8"],
  deny: ["Denied", "M8 8l8 8M16 8l-8 8"],
  none: ["Not granted", "M8 12h8"]
};
function Row({ item }) {
  const [label, path] = MARKS[item.state];
  const { chip } = item;
  return /* @__PURE__ */ jsx_runtime.jsxs("li", {
    className: "evi-pv-row",
    "data-state": item.state,
    children: [
      /* @__PURE__ */ jsx_runtime.jsx("span", {
        className: "evi-pv-mark",
        role: "img",
        "aria-label": label,
        children: /* @__PURE__ */ jsx_runtime.jsx("svg", {
          viewBox: "0 0 24 24",
          width: "14",
          height: "14",
          "aria-hidden": "true",
          children: /* @__PURE__ */ jsx_runtime.jsx("path", {
            d: path,
            fill: "none",
            stroke: "currentColor",
            strokeWidth: "2.5",
            strokeLinecap: "round",
            strokeLinejoin: "round"
          })
        })
      }),
      /* @__PURE__ */ jsx_runtime.jsx("span", {
        className: "evi-pv-name",
        children: item.name
      }),
      chip && /* @__PURE__ */ jsx_runtime.jsxs("span", {
        className: "evi-pv-chip",
        "data-tone": chip.tone,
        title: chip.title,
        children: [
          chip.tone !== "quiet" && /* @__PURE__ */ jsx_runtime.jsx("span", {
            className: "evi-pv-dot",
            style: chip.color ? { background: chip.color } : undefined,
            "data-empty": !chip.color || undefined
          }),
          /* @__PURE__ */ jsx_runtime.jsx("span", {
            className: "evi-pv-chip-label",
            children: chip.label
          }),
          chip.overwrite && /* @__PURE__ */ jsx_runtime.jsx("span", {
            className: "evi-pv-chip-kind",
            children: "overwrite"
          })
        ]
      })
    ]
  });
}
function sourceChip(source, granted, guildId, roles) {
  const name = (id) => roles.get(id)?.name ?? "Deleted role";
  switch (source.kind) {
    case "owner":
      return { label: "Server owner", title: "Server owner" };
    case "administrator":
      return { label: name(source.roleId), color: roles.get(source.roleId)?.color, title: `Administrator through the ${name(source.roleId)} role` };
    case "none":
      return;
    case "role": {
      if (source.roleId === guildId)
        return { label: "@everyone", tone: "quiet", title: "Granted to @everyone" };
      return { label: name(source.roleId), color: roles.get(source.roleId)?.color, title: `Granted by the ${name(source.roleId)} role` };
    }
    case "overwrite": {
      const verb = granted ? "Allowed" : "Denied";
      const tone = granted ? undefined : "deny";
      if (source.target === "everyone")
        return { label: "@everyone", overwrite: true, tone, title: `${verb} by this channel's @everyone overwrite` };
      if (source.target === "role")
        return { label: name(source.id), color: roles.get(source.id)?.color, overwrite: true, tone, title: `${verb} by this channel's ${name(source.id)} overwrite` };
      return { label: "Member", overwrite: true, tone, title: `${verb} by an overwrite for this member` };
    }
  }
}
function entrySection(entries, guildId, roles) {
  const byId = new Map(roles.map((r) => [r.id, r]));
  const first = entries[0]?.source;
  if (first?.kind === "owner" || first?.kind === "administrator") {
    return {
      notice: first.kind === "owner" ? "Server owner: has every permission, and channel overwrites don't apply." : `Administrator through the ${byId.get(first.roleId)?.name ?? "deleted"} role: has every permission, and channel overwrites don't apply.`,
      items: entries.map((e) => ({ key: e.key, name: e.name, state: "allow" }))
    };
  }
  return {
    items: entries.map((e) => ({
      key: e.key,
      name: e.name,
      state: e.granted ? "allow" : e.source.kind === "overwrite" ? "deny" : "none",
      chip: sourceChip(e.source, e.granted, guildId, byId)
    }))
  };
}
function roleSection(role) {
  const bits = toBits(role.permissions);
  return {
    notice: bits & ADMINISTRATOR ? "Administrator: this role has every permission and bypasses channel overwrites." : undefined,
    items: [
      ...PERMISSIONS.map((p) => ({ key: p.key, name: p.name, state: bits & p.flag ? "allow" : "none" })),
      ...permissionsIn(bits).filter((p) => p.key.startsWith("BIT_")).map((p) => ({ key: p.key, name: p.name, state: "allow" }))
    ]
  };
}
function memberSections(guildId, userId, channel) {
  const guild = getGuild(guildId);
  const roleIds = memberRoleIds(guildId, userId);
  if (!guild || !roleIds)
    return;
  const roles = guildRoles(guildId);
  const compute = (overwrites) => computePermissions({ guildId, ownerId: guild.ownerId, userId, memberRoleIds: roleIds, roles, overwrites }).entries;
  const sections = [];
  if (channel)
    sections.push({ key: "channel", label: `In ${channelLabel(channel)}`, ...entrySection(compute(overwritesOf(channel)), guildId, roles) });
  sections.push({ key: "server", label: "Server-wide", ...entrySection(compute(), guildId, roles) });
  return sections;
}
function viewMember(guildId, userId, channel) {
  const sections = memberSections(guildId, userId, channel);
  if (!sections)
    return false;
  const guildName = getGuild(guildId)?.name ?? "this server";
  const name = userName(guildId, userId);
  openDialog({
    title: name,
    subtitle: channel ? `Permissions in ${channelLabel(channel)} · ${guildName}` : `Permissions in ${guildName}`,
    image: attempt(() => store("UserStore")?.getUser?.(userId)?.getAvatarURL?.(guildId, 80)),
    glyph: [...name][0]?.toUpperCase() ?? "?"
  }, sections);
  return true;
}
function viewRole(guildId, role) {
  openDialog({
    title: role.name,
    subtitle: `Role permissions · ${getGuild(guildId)?.name ?? "this server"}`,
    glyph: "@",
    color: role.color
  }, [{ key: role.id, label: role.name, color: role.color, ...roleSection(role) }]);
}
function computeYou(guildId, userId, channel) {
  const guild = getGuild(guildId);
  return computePermissions({
    guildId,
    ownerId: guild?.ownerId,
    userId,
    memberRoleIds: memberRoleIds(guildId, userId) ?? [],
    roles: guildRoles(guildId),
    overwrites: channel ? overwritesOf(channel) : undefined
  }).entries;
}
function viewChannel(channel) {
  const guildId = channel.guild_id;
  const roles = guildRoles(guildId);
  const byId = new Map(roles.map((r) => [r.id, r]));
  const summaries = summarizeOverwrites(guildId, overwritesOf(channel), roles);
  const sections = [];
  const me = ownId();
  if (me && memberRoleIds(guildId, me))
    sections.push({ key: "you", label: "You", ...entrySection(computeYou(guildId, me, channel), guildId, roles) });
  for (const s of summaries) {
    const label = s.target === "member" ? userName(guildId, s.id) : byId.get(s.id)?.name ?? (s.target === "everyone" ? "@everyone" : "Deleted role");
    sections.push({
      key: s.id,
      label,
      color: s.target === "role" ? byId.get(s.id)?.color : undefined,
      group: "Overwrites",
      overwrite: true,
      notice: `${s.target === "member" ? "Member" : "Role"} overwrite: anything not listed is inherited from the server.`,
      items: [
        ...s.allowed.map((p) => ({ key: p.key, name: p.name, state: "allow" })),
        ...s.denied.map((p) => ({ key: p.key, name: p.name, state: "deny" }))
      ],
      empty: "This overwrite doesn't allow or deny anything, so everything is inherited from the server."
    });
  }
  if (!summaries.length)
    sections.push({ key: "none", label: "Overwrites", items: [], empty: "This channel has no overwrites, so everyone gets their server role permissions here." });
  const count = `${summaries.length} overwrite${summaries.length === 1 ? "" : "s"}`;
  openDialog({
    title: channelLabel(channel),
    subtitle: `Channel permissions · ${count} · ${getGuild(guildId)?.name ?? "this server"}`,
    glyph: "#"
  }, sections);
}
function viewGuild(guild) {
  const roles = guildRoles(guild.id);
  const sections = [];
  const me = ownId();
  if (me && memberRoleIds(guild.id, me))
    sections.push({ key: "you", label: "You", ...entrySection(computeYou(guild.id, me, undefined), guild.id, roles) });
  for (const role of roles)
    sections.push({ key: role.id, label: role.name, color: role.color, group: "Roles", ...roleSection(role) });
  openDialog({
    title: guild.name,
    subtitle: `Server permissions · ${roles.length} role${roles.length === 1 ? "" : "s"}`,
    image: attempt(() => guild.getIconURL?.(80, false)),
    glyph: [...guild.name ?? "?"][0]?.toUpperCase() ?? "?"
  }, sections);
}
var css = `
.evi-pv-scrim { position: fixed; inset: 0; z-index: 10000; display: grid; place-items: center; background: rgba(0,0,0,.7); }
.evi-pv-modal {
  --evi-pv-muted: var(--text-muted, #949ba4);
  --evi-pv-strong: var(--text-strong, var(--header-primary, #f2f3f5));
  --evi-pv-line: var(--border-subtle, rgba(255,255,255,.07));
  --evi-pv-hover: var(--background-modifier-hover, rgba(255,255,255,.05));
  --evi-pv-selected: var(--background-modifier-selected, rgba(255,255,255,.1));
  --evi-pv-well: color-mix(in srgb, currentColor 4%, transparent);
  --evi-pv-positive: var(--status-positive, #23a55a);
  --evi-pv-danger: var(--status-danger, #f23f43);
  --evi-pv-brand: var(--brand-500, #5865f2);
  --evi-pv-focus: var(--focus-primary, #00a8fc);
  width: min(760px, calc(100vw - 32px)); height: min(680px, calc(100vh - 64px)); display: flex; flex-direction: column; border-radius: 16px; overflow: hidden;
  background: var(--modal-background, var(--background-base-low, #313338)); color: var(--text-default, var(--text-normal, #dbdee1)); border: 1px solid var(--evi-pv-line);
  box-shadow: var(--shadow-high, 0 12px 40px rgba(0,0,0,.45)); outline: none; font-family: var(--font-primary); font-size: 14px; line-height: 20px;
}
.evi-pv-modal ::-webkit-scrollbar { width: 12px; height: 12px; }
.evi-pv-modal ::-webkit-scrollbar-track { background: transparent; }
.evi-pv-modal ::-webkit-scrollbar-thumb { background: var(--scrollbar-auto-thumb, rgba(255,255,255,.14)); border: 4px solid transparent; border-radius: 8px; background-clip: padding-box; min-height: 40px; }
.evi-pv-modal ::-webkit-scrollbar-corner { background: transparent; }

.evi-pv-head { display: flex; align-items: center; gap: 12px; padding: 16px 16px 16px 20px; border-bottom: 1px solid var(--evi-pv-line); }
.evi-pv-avatar { flex: none; width: 40px; height: 40px; border-radius: 50%; object-fit: cover; outline: 1px solid rgba(255,255,255,.08); outline-offset: -1px; }
.evi-pv-avatar[data-glyph] { --evi-pv-tint: var(--evi-pv-muted); display: grid; place-items: center; border-radius: 12px; outline: none; font-size: 18px; font-weight: 700;
  color: var(--evi-pv-tint); background: color-mix(in srgb, var(--evi-pv-tint) 16%, transparent); }
.evi-pv-titles { flex: 1; min-width: 0; }
.evi-pv-titles h2 { margin: 0; font-size: 18px; line-height: 22px; font-weight: 700; color: var(--evi-pv-strong); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.evi-pv-titles p { margin: 2px 0 0; font-size: 13px; line-height: 18px; color: var(--evi-pv-muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.evi-pv-close { flex: none; align-self: flex-start; display: grid; place-items: center; width: 32px; height: 32px; border: 0; border-radius: 8px; background: none; color: var(--interactive-normal, #b5bac1); cursor: pointer; transition: scale 200ms ease-out; }

.evi-pv-main { flex: 1; min-height: 0; display: flex; }
.evi-pv-nav { flex: none; width: 208px; overflow-y: auto; padding: 8px; border-inline-end: 1px solid var(--evi-pv-line); display: flex; flex-direction: column; gap: 2px; }
.evi-pv-nav-group { margin: 12px 10px 4px; font-size: 12px; line-height: 16px; font-weight: 600; text-transform: uppercase; letter-spacing: .02em; color: var(--evi-pv-muted); }
.evi-pv-tab { display: flex; align-items: center; gap: 8px; width: 100%; min-height: 32px; padding: 6px 10px; border: 0; border-radius: 8px; background: none;
  color: var(--interactive-normal, #b5bac1); font: inherit; text-align: start; cursor: pointer; }
.evi-pv-tab-label { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.evi-pv-tab[aria-current="true"] { background: var(--evi-pv-selected); color: var(--interactive-active, #fff); }
.evi-pv-tab-count { flex: none; display: flex; gap: 4px; font-size: 12px; color: var(--evi-pv-muted); font-variant-numeric: tabular-nums; }
.evi-pv-tab-count [data-state="allow"] { color: var(--evi-pv-positive); }
.evi-pv-tab-count [data-state="deny"] { color: var(--evi-pv-danger); }
.evi-pv-dot { flex: none; width: 10px; height: 10px; border-radius: 50%; }
.evi-pv-dot[data-empty] { background: var(--evi-pv-muted); opacity: .5; }

.evi-pv-body { flex: 1; min-width: 0; display: flex; flex-direction: column; }
.evi-pv-toolbar { flex: none; display: flex; align-items: center; gap: 8px; flex-wrap: wrap; padding: 12px 20px; border-bottom: 1px solid var(--evi-pv-line); }
.evi-pv-seg { display: inline-flex; gap: 2px; padding: 3px; border-radius: 10px; background: var(--evi-pv-well); }
.evi-pv-seg button { display: inline-flex; align-items: center; gap: 6px; min-height: 26px; padding: 3px 10px; border: 0; border-radius: 7px; background: none;
  color: var(--evi-pv-muted); font: inherit; font-size: 13px; font-weight: 500; white-space: nowrap; cursor: pointer; transition: scale 200ms ease-out; }
.evi-pv-seg button[aria-pressed="true"] { background: var(--evi-pv-selected); color: var(--evi-pv-strong); }
.evi-pv-seg-count { font-size: 12px; opacity: .7; font-variant-numeric: tabular-nums; }
.evi-pv-search { flex: 1 1 140px; max-width: 240px; margin-inline-start: auto; display: flex; align-items: center; gap: 8px; height: 32px; padding-inline: 10px;
  border-radius: 8px; border: 1px solid var(--evi-pv-line); background: var(--input-background, var(--evi-pv-well)); color: var(--evi-pv-muted); cursor: text; }
.evi-pv-search:focus-within { border-color: var(--evi-pv-focus); }
.evi-pv-search input { flex: 1; min-width: 0; padding: 0; border: 0; outline: none; background: none; color: var(--text-default, var(--text-normal, #dbdee1)); font: inherit; }
.evi-pv-search input::placeholder { color: var(--evi-pv-muted); }

.evi-pv-scroll { flex: 1; min-height: 0; overflow-y: auto; padding: 16px 20px 20px; display: flex; flex-direction: column; gap: 20px; }
.evi-pv-heading { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; margin: 0 0 8px; padding-inline: 4px; font-size: 12px; line-height: 16px;
  font-weight: 600; text-transform: uppercase; letter-spacing: .02em; color: var(--evi-pv-muted); }
.evi-pv-heading-count { font-weight: 500; text-transform: none; letter-spacing: 0; font-variant-numeric: tabular-nums; }
.evi-pv-list { list-style: none; margin: 0; padding: 4px; border-radius: 12px; background: var(--evi-pv-well); }
.evi-pv-row { display: flex; align-items: center; gap: 12px; min-height: 36px; padding: 6px 8px; border-radius: 8px; }
.evi-pv-name { flex: 1; min-width: 0; overflow-wrap: break-word; }
.evi-pv-row[data-state="none"] .evi-pv-name { color: var(--evi-pv-muted); }
.evi-pv-mark { flex: none; display: grid; place-items: center; width: 22px; height: 22px; border-radius: 50%; }
.evi-pv-row[data-state="allow"] .evi-pv-mark { color: var(--evi-pv-positive); background: color-mix(in srgb, var(--evi-pv-positive) 16%, transparent); }
.evi-pv-row[data-state="deny"] .evi-pv-mark { color: var(--evi-pv-danger); background: color-mix(in srgb, var(--evi-pv-danger) 16%, transparent); }
.evi-pv-row[data-state="none"] .evi-pv-mark { color: var(--evi-pv-muted); background: var(--evi-pv-well); }

.evi-pv-chip { flex: none; display: inline-flex; align-items: center; gap: 6px; max-width: 45%; padding: 2px 8px; border-radius: 999px; font-size: 12px; line-height: 16px;
  white-space: nowrap; color: var(--text-default, var(--text-normal, #dbdee1)); background: var(--evi-pv-selected); }
.evi-pv-chip .evi-pv-dot { width: 8px; height: 8px; }
.evi-pv-chip-label { min-width: 0; overflow: hidden; text-overflow: ellipsis; }
.evi-pv-chip-kind { flex: none; color: var(--evi-pv-muted); }
.evi-pv-chip[data-tone="quiet"] { padding-inline: 0; background: none; color: var(--evi-pv-muted); }
.evi-pv-chip[data-tone="deny"] { background: color-mix(in srgb, var(--evi-pv-danger) 16%, transparent); }
.evi-pv-chip[data-tone="deny"] .evi-pv-chip-kind { color: var(--evi-pv-danger); }

.evi-pv-notice { display: flex; align-items: flex-start; gap: 8px; margin: 0; padding: 10px 12px; border-radius: 10px; font-size: 13px; line-height: 18px; text-wrap: pretty;
  background: color-mix(in srgb, var(--evi-pv-brand) 12%, transparent); }
.evi-pv-notice svg { flex: none; margin-block-start: 1px; color: var(--evi-pv-brand); }
.evi-pv-empty { margin: auto; max-width: 320px; padding: 24px 0; text-align: center; color: var(--evi-pv-muted); text-wrap: pretty; }
.evi-pv-empty p { margin: 0 0 12px; }
.evi-pv-link { padding: 6px 12px; border: 0; border-radius: 8px; background: var(--evi-pv-selected); color: var(--evi-pv-strong); font: inherit; font-weight: 500; cursor: pointer; transition: scale 200ms ease-out; }
.evi-pv-sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }

.evi-pv-close:active, .evi-pv-seg button:active, .evi-pv-link:active { scale: .96; }
:is(.evi-pv-close, .evi-pv-seg button, .evi-pv-link):focus-visible { outline: 2px solid var(--evi-pv-focus); outline-offset: 2px; }
.evi-pv-tab:focus-visible { outline: 2px solid var(--evi-pv-focus); outline-offset: -2px; }
@media (hover: hover) {
  .evi-pv-close:hover { background: var(--evi-pv-hover); color: var(--interactive-hover, #dbdee1); }
  .evi-pv-tab:hover:not([aria-current="true"]) { background: var(--evi-pv-hover); color: var(--interactive-hover, #dbdee1); }
  .evi-pv-seg button:hover:not([aria-pressed="true"]) { color: var(--interactive-hover, #dbdee1); }
  .evi-pv-row:hover { background: var(--evi-pv-hover); }
}
@media (prefers-reduced-motion: no-preference) {
  .evi-pv-scrim { animation: evi-pv-fade 150ms ease-out; }
  .evi-pv-modal { animation: evi-pv-enter 200ms cubic-bezier(.2, .8, .2, 1); }
}
@keyframes evi-pv-fade { from { opacity: 0; } }
@keyframes evi-pv-enter { from { opacity: 0; scale: .96; } }
`;
var item = (id, action) => /* @__PURE__ */ jsx_runtime.jsx(import_api.Menu.Group, {
  children: /* @__PURE__ */ jsx_runtime.jsx(import_api.Menu.Item, {
    id,
    label: "View Permissions",
    action
  })
}, `${id}-group`);
var permissions_viewer_default = import_api.definePlugin({
  start(ctx) {
    ctx.addStyle(css);
    ctx.onDispose(() => closeOpen?.());
    const fail = () => ctx.toast("Couldn't read the permissions", { type: "failure" });
    ctx.contextMenu("user-context", (children, props) => {
      const userId = props.user?.id;
      const guildId = props.guildId ?? props.guild?.id ?? props.channel?.guild_id;
      if (!userId || !guildId || !memberRoleIds(guildId, userId))
        return;
      let channel = props.channel?.guild_id === guildId ? props.channel : undefined;
      if (!channel) {
        const viewed = getChannel(store("SelectedChannelStore")?.getChannelId?.());
        if (viewed?.guild_id === guildId)
          channel = viewed;
      }
      children.push(item("evi-pv-user", () => {
        try {
          if (!viewMember(guildId, userId, channel))
            fail();
        } catch (err) {
          ctx.logger.error("Viewing member permissions failed", err);
          fail();
        }
      }));
    });
    ctx.contextMenu(["dev-context", "guild-settings-role-context"], (children, props) => {
      const roleId = props.role?.id ?? props.id;
      const guildId = props.guild?.id ?? props.guildId ?? store("SelectedGuildStore")?.getGuildId?.();
      if (!roleId || !guildId)
        return;
      const role = guildRoles(guildId).find((r) => r.id === roleId);
      if (!role)
        return;
      children.push(item("evi-pv-role", () => {
        try {
          viewRole(guildId, role);
        } catch (err) {
          ctx.logger.error("Viewing role permissions failed", err);
          fail();
        }
      }));
    });
    ctx.contextMenu(["channel-context", "thread-context"], (children, props) => {
      const channel = props.channel;
      if (!channel?.guild_id)
        return;
      children.push(item("evi-pv-channel", () => {
        try {
          viewChannel(channel);
        } catch (err) {
          ctx.logger.error("Viewing channel permissions failed", err);
          fail();
        }
      }));
    });
    ctx.contextMenu("guild-context", (children, props) => {
      const guild = props.guild;
      if (!guild?.id)
        return;
      children.push(item("evi-pv-guild", () => {
        try {
          viewGuild(getGuild(guild.id) ?? guild);
        } catch (err) {
          ctx.logger.error("Viewing server permissions failed", err);
          fail();
        }
      }));
    });
  },
  stop() {
    closeOpen?.();
  }
});
