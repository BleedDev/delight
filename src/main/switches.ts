import { LIST_SWITCHES, mergeSwitchList } from "@shared/chromiumSwitches";
import { app } from "electron";

/**
 * Makes every later appendSwitch of a feature list add to what's there instead of replacing it,
 * Discord's and Sentry's included. Runs before anything appends one.
 */
export function mergeListSwitches() {
    const commandLine = app.commandLine;
    const append = commandLine.appendSwitch.bind(commandLine);
    commandLine.appendSwitch = (name: string, value?: string) => {
        if (value !== undefined && LIST_SWITCHES.has(name) && commandLine.hasSwitch(name)) {
            value = mergeSwitchList(commandLine.getSwitchValue(name), String(value));
        }
        append(name, value);
    };
}
