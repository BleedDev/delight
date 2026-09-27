/**
 * Prints a version's release notes, from its entry in src/shared/changelog.ts, as the markdown the
 * GitHub release gets. Fails when there's no entry: every release says what changed.
 *
 *   bun scripts/release-notes.ts 0.5.3 > notes.md
 */
import { RELEASES, releaseMarkdown } from "../src/shared/changelog";

const version = process.argv[2]?.replace(/^v/, "");
const release = RELEASES.find(r => r.version === version);
if (!release) {
    console.error(`✗ No entry for ${version ?? "(no version given)"} in src/shared/changelog.ts. Add one, with what changed, before releasing.`);
    process.exit(1);
}
process.stdout.write(releaseMarkdown(release));
