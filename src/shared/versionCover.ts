/**
 * A version number drawn as a field of dots: the cover of a release, in the same dot language as the
 * blog's covers and the dotted "evi" on evi.rest. Every dot on a regular grid samples an intensity
 * field (0..1) and gets bigger and brighter with it.
 *
 * Shared by evi.rest (server/src/covers.ts draws /v1/releases/covers/<version>.svg for the releases
 * page), the site's blog cover script, and Evi, which draws a release's cover itself when it has none
 * bundled. Every version gets one without anyone adding it.
 */

export const COVER_W = 1200, COVER_H = 675;
const STEP = 15, UNIT = COVER_H / 2;
const LEVELS = 14;

export type Field = (x: number, y: number) => number;

export const clamp = (v: number, a = 0, b = 1) => Math.min(b, Math.max(a, v));

/* Signed distance functions, in units where 1 is half the cover's height */

export function box(x: number, y: number, cx: number, cy: number, hw: number, hh: number, r: number) {
    const qx = Math.abs(x - cx) - hw + r, qy = Math.abs(y - cy) - hh + r;
    return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r;
}

export function segment(x: number, y: number, ax: number, ay: number, bx: number, by: number) {
    const px = x - ax, py = y - ay, dx = bx - ax, dy = by - ay;
    const h = clamp((px * dx + py * dy) / (dx * dx + dy * dy));
    return Math.hypot(px - dx * h, py - dy * h);
}

/** Distance to the part of a circle between two angles (radians, clockwise from 3 o'clock, y down) */
export function arc(x: number, y: number, cx: number, cy: number, r: number, from: number, to: number) {
    const a = Math.atan2(y - cy, x - cx);
    if (a >= from && a <= to) return Math.abs(Math.hypot(x - cx, y - cy) - r);
    return Math.min(Math.hypot(x - cx - r * Math.cos(from), y - cy - r * Math.sin(from)), Math.hypot(x - cx - r * Math.cos(to), y - cy - r * Math.sin(to)));
}

const ring = (x: number, y: number, cx: number, cy: number, r: number) => Math.abs(Math.hypot(x - cx, y - cy) - r);

/** Snaps a coordinate to the dot grid, so symmetric shapes come out symmetric */
export const snap = (v: number) => (Math.round((v * UNIT) / STEP) * STEP) / UNIT;

/** Deterministic noise so the sparkles land in the same place on every run */
export function hash(x: number, y: number) {
    const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
    return s - Math.floor(s);
}

const WIDTHS: Record<string, number> = { "0": 0.42, "1": 0.24, "2": 0.38, "3": 0.38, "4": 0.44, "5": 0.38, "6": 0.4, "7": 0.38, "8": 0.4, "9": 0.4, ".": 0.12 };

/** A version number ("0.5.1") drawn in strokes. A prerelease's suffix ("-beta.1") isn't drawn. */
export function versionField(version: string): Field {
    const text = [...version.replace(/^v/, "").replace(/[-+].*$/, "")].filter(c => c in WIDTHS).join("");
    const t = 0.06, h = 0.36, glyphs: ((x: number, y: number) => number)[] = [];
    const gap = 0.13;
    let pen = -([...text].reduce((w, c) => w + WIDTHS[c], 0) + gap * (text.length - 1)) / 2;
    for (const c of text) {
        const cx = pen + WIDTHS[c] / 2;
        if (c === "0") glyphs.push((x, y) => Math.abs(box(x, y, cx, 0, 0.21, h, 0.21)) - t);
        if (c === ".") glyphs.push((x, y) => Math.hypot(x - cx, y - (h - t * 0.6)) - t * 1.25);
        if (c === "1") {
            // A stem with a short flag at the top, like the 1 in a monospace face
            const sx = snap(cx + 0.04);
            glyphs.push((x, y) => Math.min(segment(x, y, sx, -h + t, sx, h - t), segment(x, y, sx - 0.14, -h + 0.14, sx, -h + t)) - t);
        }
        if (c === "2") {
            // A hook over the top, a diagonal down to the left, a flat base
            const r = 0.19, ay = -h + r, end = Math.PI * 0.2;
            const ex = cx + r * Math.cos(end), ey = ay + r * Math.sin(end);
            glyphs.push((x, y) => Math.min(
                arc(x, y, cx, ay, r, -Math.PI * 0.9, end),
                segment(x, y, ex, ey, cx - r, h - t),
                segment(x, y, cx - r, h - t, cx + r, h - t),
            ) - t);
        }
        if (c === "3") {
            // Two bowls meeting in the middle, open to the left
            const r = h / 2, bx = cx - 0.02;
            glyphs.push((x, y) => Math.min(
                arc(x, y, bx, -r, r, -Math.PI * 0.85, Math.PI / 2),
                arc(x, y, bx, r, r, -Math.PI / 2, Math.PI * 0.85),
            ) - t);
        }
        if (c === "4") {
            // Closed 4: a full-height stem right of center, a diagonal from its top to the crossbar.
            // The stem's ends reach the rows the 0's and the 2's outer edges land on, so they end three
            // dots wide instead of tapering to one, and the diagonal is a touch heavier so every row
            // across it lights as many dots as the stem.
            const sx = snap(cx + 0.11), by = snap(h * 0.4), lx = cx - 0.24;
            const top = -h - 0.015, bottom = h - 0.025;
            glyphs.push((x, y) => Math.min(
                segment(x, y, sx, top, sx, bottom) - t,
                segment(x, y, sx, top, lx, by) - t * 1.12,
                segment(x, y, lx, by, cx + 0.2, by) - t,
            ));
        }
        if (c === "5") {
            // A flat top, a stem down the left, then a bowl open to the left
            const r = 0.2, by = h - r, lx = cx - 0.16, from = -Math.PI * 0.78, to = Math.PI * 0.8;
            const jx = cx + r * Math.cos(from), jy = by + r * Math.sin(from);
            glyphs.push((x, y) => Math.min(
                segment(x, y, lx, -h + t, cx + 0.19, -h + t),
                segment(x, y, lx, -h + t, jx, jy),
                arc(x, y, cx, by, r, from, to),
            ) - t);
        }
        if (c === "6") {
            // A round bowl at the bottom, its stem leaning up to the top right
            const r = 0.2, by = h - r;
            glyphs.push((x, y) => Math.min(ring(x, y, cx, by, r), segment(x, y, cx - r, by, cx + 0.12, -h + t * 0.5)) - t);
        }
        if (c === "7") {
            // A flat top and one diagonal down from its right end
            glyphs.push((x, y) => Math.min(segment(x, y, cx - 0.19, -h + t, cx + 0.19, -h + t), segment(x, y, cx + 0.19, -h + t, cx - 0.06, h - t * 0.5)) - t);
        }
        if (c === "8") {
            // A smaller bowl stacked on a bigger one
            const top = 0.16, bottom = 0.2;
            glyphs.push((x, y) => Math.min(ring(x, y, cx, -h + top, top), ring(x, y, cx, h - bottom, bottom)) - t);
        }
        if (c === "9") {
            // The 6 turned around: a bowl at the top, its stem leaning down to the bottom left
            const r = 0.2, ay = -h + r;
            glyphs.push((x, y) => Math.min(ring(x, y, cx, ay, r), segment(x, y, cx + r, ay, cx - 0.12, h - t * 0.5)) - t);
        }
        pen += WIDTHS[c] + gap;
    }
    return (x, y) => {
        const d = glyphs.length ? Math.min(...glyphs.map(g => g(x, y))) : Infinity;
        if (d < 0) return 1;
        const glow = Math.exp(-d * 11) * 0.45;
        const n = hash(Math.round(x * 50), Math.round(y * 50));
        const sparkle = n > 0.975 ? (n - 0.975) / 0.025 * 0.6 * Math.exp(-Math.hypot(x, y) * 0.7) : 0;
        return Math.max(glow, sparkle);
    };
}

/** A field as the cover's SVG: dots on the grid, sized and lit by the field, over the faint base grid */
export function renderCover(field: Field) {
    const levels: string[][] = Array.from({ length: LEVELS }, () => []);
    const floor = 0.06;
    // Grid centered on the cover, so a shape at (0, 0) sits on a dot
    const x0 = (COVER_W / 2) % STEP, y0 = (COVER_H / 2) % STEP;
    for (let py = y0; py < COVER_H; py += STEP) for (let px = x0; px < COVER_W; px += STEP) {
        const v = clamp(field((px - COVER_W / 2) / UNIT, (py - COVER_H / 2) / UNIT));
        if (v < floor) continue;
        levels[Math.min(LEVELS - 1, Math.floor(v * LEVELS))].push(`M${px} ${py}h0`);
    }

    // Each level is one path of round-capped zero-length strokes: a dot per subpath, a few bytes each
    const paths = levels.map((d, i) => {
        if (!d.length) return "";
        const t = (i + 0.5) / LEVELS;
        const size = ((0.14 + t * 0.44) * STEP).toFixed(2);
        const opacity = (0.14 + t ** 1.3 * 0.86).toFixed(3);
        return `<path d="${d.join("")}" stroke-width="${size}" stroke-opacity="${opacity}"/>`;
    }).join("");

    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${COVER_W} ${COVER_H}">`
        + `<defs>`
        + `<pattern id="g" width="${STEP}" height="${STEP}" patternUnits="userSpaceOnUse" x="${(COVER_W / 2) % STEP - STEP / 2}" y="${(COVER_H / 2) % STEP - STEP / 2}"><circle cx="${STEP / 2}" cy="${STEP / 2}" r="1.3" fill="#fff" fill-opacity=".08"/></pattern>`
        + `<radialGradient id="l" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#fff" stop-opacity=".07"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient>`
        + `<radialGradient id="v" cx=".5" cy=".5" r=".75"><stop offset=".45" stop-color="#0b0c0d" stop-opacity="0"/><stop offset="1" stop-color="#0b0c0d"/></radialGradient>`
        + `</defs>`
        + `<rect width="${COVER_W}" height="${COVER_H}" fill="#0b0c0d"/>`
        + `<rect width="${COVER_W}" height="${COVER_H}" fill="url(#g)"/>`
        + `<ellipse cx="${COVER_W / 2}" cy="${COVER_H / 2}" rx="${COVER_H * 0.75}" ry="${COVER_H * 0.6}" fill="url(#l)"/>`
        + `<g fill="none" stroke="#fff" stroke-linecap="round">${paths}</g>`
        + `<rect width="${COVER_W}" height="${COVER_H}" fill="url(#v)"/>`
        + `</svg>`;
}

/** A release's cover as SVG: its version in dots */
export const versionCover = (version: string) => renderCover(versionField(version));
