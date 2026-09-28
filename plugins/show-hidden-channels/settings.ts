import { t } from "./strings";

export const settings = {
    showMode: {
        type: "select",
        get label() { return t("settings.showMode"); },
        get description() { return t("settings.showMode.description"); },
        default: "lock",
        options: [
            { get label() { return t("settings.showMode.lock"); }, value: "lock" },
            { get label() { return t("settings.showMode.muted"); }, value: "muted" },
        ],
    },
    hideUnreads: {
        type: "boolean",
        get label() { return t("settings.hideUnreads"); },
        get description() { return t("settings.hideUnreads.description"); },
        default: true,
    },
    showAllowedByDefault: {
        type: "boolean",
        get label() { return t("settings.showAllowed"); },
        get description() { return t("settings.showAllowed.description"); },
        default: true,
    },
} as const;
