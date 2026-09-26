import { app } from "electron";
import { mkdirSync } from "fs";
import { join } from "path";

export const DATA_DIR = process.env.DELIGHT_DATA_DIR ?? join(app.getPath("appData"), "Delight");
export const PLUGINS_DIR = join(DATA_DIR, "plugins");
export const SETTINGS_FILE = join(DATA_DIR, "settings.json");
export const THEMES_DIR = join(DATA_DIR, "themes");
export const QUICK_CSS_FILE = join(DATA_DIR, "quick.css");

mkdirSync(PLUGINS_DIR, { recursive: true });
mkdirSync(THEMES_DIR, { recursive: true });
