/**
 * Linking this install to an Evi account on evi.rest. Evi gets a short code and opens the website to
 * confirm it with Discord; meanwhile this checks every few seconds until the link shows up. Linked
 * installs share their stars, and the dashboard lists them.
 */
import type { AccountUser } from "@shared/account";

import { Native } from "../native";
import { React } from "../webpack/common";
import { Button, Section, Status, Text } from "./components";

const POLL_MS = 3000;
const CODE_TTL_MS = 10 * 60 * 1000;

type State =
    | { kind: "loading"; }
    | { kind: "offline"; error: string; }
    | { kind: "idle"; note?: string; }
    | { kind: "starting"; }
    | { kind: "waiting"; code: string; since: number; }
    | { kind: "linked"; user: AccountUser; };

const avatarUrl = (u: AccountUser) => u.avatar
    ? `https://cdn.discordapp.com/avatars/${u.id}/${u.avatar}.${u.avatar.startsWith("a_") ? "gif" : "png"}?size=80`
    : `https://cdn.discordapp.com/embed/avatars/${Number((BigInt(u.id) >> 22n) % 6n)}.png`;

export function AccountTab() {
    const [state, setState] = React.useState<State>({ kind: "loading" });

    const check = React.useCallback(async () => {
        const res = await Native.accountStatus();
        if (!res.ok) setState({ kind: "offline", error: res.error });
        else setState(res.user ? { kind: "linked", user: res.user } : { kind: "idle" });
    }, []);

    React.useEffect(() => void check(), [check]);

    // While a code is out, check for the link to land
    React.useEffect(() => {
        if (state.kind !== "waiting") return;
        const timer = setInterval(async () => {
            if (Date.now() - state.since > CODE_TTL_MS) {
                setState({ kind: "idle", note: "That code expired. Get a new one to try again." });
                return;
            }
            const res = await Native.accountStatus();
            if (res.ok && res.user) setState({ kind: "linked", user: res.user });
        }, POLL_MS);
        return () => clearInterval(timer);
    }, [state]);

    const start = async () => {
        setState({ kind: "starting" });
        const res = await Native.linkAccount();
        setState(res.ok ? { kind: "waiting", code: res.code, since: Date.now() } : { kind: "idle", note: res.error });
    };

    return (
        <Section
            title="Evi account"
            description="Link this install to your Discord account on evi.rest. Your stars follow you to every PC you link, and your dashboard shows them all."
        >
            <div className="dl-account-card" aria-live="polite">
                {state.kind === "loading" && <Text variant="text-sm/normal" color="text-muted">Checking…</Text>}

                {state.kind === "offline" && (
                    <>
                        <div className="dl-account-text">
                            <Text variant="text-md/semibold" color="text-strong">Couldn’t reach evi.rest</Text>
                            <Status tone="danger">{state.error}</Status>
                        </div>
                        <Button onClick={() => { setState({ kind: "loading" }); check(); }}>Try again</Button>
                    </>
                )}

                {(state.kind === "idle" || state.kind === "starting") && (
                    <>
                        <div className="dl-account-text">
                            <Text variant="text-md/semibold" color="text-strong">This install isn’t linked</Text>
                            <Text variant="text-sm/normal" color="text-subtle">Your browser opens evi.rest, where you log in with Discord and confirm.</Text>
                            {state.kind === "idle" && state.note && <Status tone="danger">{state.note}</Status>}
                        </div>
                        <Button variant="accent" icon="link" onClick={start} disabled={state.kind === "starting"}>
                            {state.kind === "starting" ? "Opening evi.rest…" : "Link to your account"}
                        </Button>
                    </>
                )}

                {state.kind === "waiting" && (
                    <div className="dl-account-waiting">
                        <Text variant="text-sm/normal" color="text-subtle">Confirm this code on evi.rest. Log in with Discord there if it asks.</Text>
                        <span className="dl-account-code">{state.code}</span>
                        <Status tone="muted">Waiting for you to confirm…</Status>
                        <div className="dl-account-actions">
                            <Button onClick={start}>Get a new code</Button>
                            <Button onClick={() => setState({ kind: "idle" })}>Cancel</Button>
                        </div>
                    </div>
                )}

                {state.kind === "linked" && (
                    <>
                        <img className="dl-account-avatar" src={avatarUrl(state.user)} alt="" width={40} height={40} />
                        <div className="dl-account-text">
                            <Text variant="text-md/semibold" color="text-strong">{state.user.globalName || state.user.username}</Text>
                            <Status tone="success" quiet>{`Linked as @${state.user.username}`}</Status>
                        </div>
                        <Button onClick={() => Native.openDashboard()}>Open dashboard</Button>
                    </>
                )}
            </div>
        </Section>
    );
}
