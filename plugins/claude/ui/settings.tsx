// The plugin's settings: Evi renders the schema (see index.tsx); this adds the default folder, the model
// login status, and the tips list under it.
import { useEffect, useState } from "react";
import { Components } from "@evi/api";
import { N } from "./native";
import { kv } from "./kv";
import { TIPS } from "./tips";

/** Evi's settings panel (Ctrl+Shift+D), where the Claude plugin's settings live */
export function openPluginSettings() {
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "D", code: "KeyD", ctrlKey: true, shiftKey: true, bubbles: true }));
}

export function SettingsPanel() {
    const Button = Components.Button as any;
    const [cwd, setCwd] = useState<string | null>(() => kv.get<string | null>("lastCwd", null));
    const [claude, setClaude] = useState<string>("");
    useEffect(() => {
        N()
            .agents.env()
            .then(
                env => setClaude(env.claude),
                () => {},
            );
    }, []);
    const pick = async () => {
        const p = await N().agents.pickFolder();
        if (p) {
            kv.set("lastCwd", p);
            setCwd(p);
        }
    };
    return (
        <div className="evi-claude-settings">
            <div className="evi-claude-settings-row">
                <div>
                    <div className="evi-claude-settings-title">Default folder</div>
                    <div className="evi-claude-settings-note">{cwd ?? "Asked the first time you start a session"}</div>
                </div>
                {Button ? (
                    <Button size="small" onClick={pick}>
                        Choose…
                    </Button>
                ) : (
                    <button onClick={pick}>Choose…</button>
                )}
            </div>
            {claude && (
                <div className="evi-claude-settings-row">
                    <div>
                        <div className="evi-claude-settings-title">Claude Code</div>
                        <div className="evi-claude-settings-note">{claude}. Sessions run on your own Claude login.</div>
                    </div>
                </div>
            )}
            <div className="evi-claude-settings-title" style={{ marginTop: 16 }}>
                Tips
            </div>
            {TIPS.map(t => (
                <div key={t.title} className="evi-claude-settings-tip">
                    <div className="evi-claude-settings-title">{t.title}</div>
                    <div className="evi-claude-settings-note">{t.body}</div>
                </div>
            ))}
        </div>
    );
}
