/**
 * Builds plugins/claude/styles.css from styles/source.css: Tailwind compiles the utility classes the UI uses,
 * and the theme there maps them onto Discord's CSS variables. Run after changing class names in the UI:
 *
 *     bun plugins/claude/styles/build.ts
 */
import { join } from "path";

const here = import.meta.dir;
const proc = Bun.spawn(["bunx", "tailwindcss", "-i", join(here, "source.css"), "-o", join(here, "..", "styles.css"), "--minify"], { stdout: "inherit", stderr: "inherit", cwd: join(here, "..", "..", "..") });
process.exit(await proc.exited);
