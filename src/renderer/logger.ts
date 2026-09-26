export class Logger {
    constructor(public readonly name: string, public readonly color = "#c792ea") { }

    private print(level: "log" | "info" | "warn" | "error" | "debug", args: unknown[]) {
        console[level](
            `%c Evi %c ${this.name} `,
            "background:#ff6fae;color:#1b0b14;font-weight:700;border-radius:4px 0 0 4px",
            `background:${this.color};color:#1b0b14;border-radius:0 4px 4px 0`,
            ...args,
        );
    }

    log(...args: unknown[]) { this.print("log", args); }
    info(...args: unknown[]) { this.print("info", args); }
    warn(...args: unknown[]) { this.print("warn", args); }
    error(...args: unknown[]) { this.print("error", args); }
    debug(...args: unknown[]) { this.print("debug", args); }
}
