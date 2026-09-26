import { hook, HookCallback, HookKind } from "../patching/hooks";
import { Filter, waitFor } from "../webpack/find";

/**
 * One hook on a Discord export shared by every plugin using a toolkit API. Installed when the first
 * user acquires it (as soon as the export exists, even if its module is lazy), removed with the last.
 */
export class SharedHook {
    private users = 0;
    private cancel: (() => void) | undefined;
    /** Whether the export was found and is currently hooked */
    installed = false;

    constructor(private readonly filter: Filter, private readonly kind: HookKind, private readonly callback: HookCallback) { }

    /** Returns a release function, safe to call more than once */
    acquire() {
        if (this.users++ === 0) this.install();
        let released = false;
        return () => {
            if (released) return;
            released = true;
            if (--this.users === 0) this.uninstall();
        };
    }

    private install() {
        let unhook: (() => void) | undefined;
        let active = true;
        const stopWaiting = waitFor(this.filter, (_, found) => {
            if (!active || found.key === undefined) return;
            unhook = hook(found.exports, found.key, this.kind, this.callback, "delight");
            this.installed = true;
        });
        this.cancel = () => {
            active = false;
            stopWaiting();
            unhook?.();
            this.installed = false;
        };
    }

    private uninstall() {
        this.cancel?.();
        this.cancel = undefined;
    }
}

/** A filter that only looks at modules whose source contains every snippet */
export function inModulesWith(code: string[], filter: (value: any) => boolean): Filter {
    return Object.assign(filter, { $code: code });
}
