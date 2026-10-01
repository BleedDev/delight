/**
 * Quick Markup's drawing: a list of marks over the picture, drawn in order on a canvas at the
 * picture's own size. Blur pixelates what's under it at that point, so a box drawn after it shows
 * on top. Crop is kept apart: the last one wins, and it's applied when saving.
 */

export interface Point { x: number; y: number; }
export interface Rect { x: number; y: number; w: number; h: number; }

export type Mark =
    | { kind: "blur"; rect: Rect; }
    | { kind: "box"; rect: Rect; color: string; width: number; }
    | { kind: "arrow"; from: Point; to: Point; color: string; width: number; }
    | { kind: "pen"; points: Point[]; color: string; width: number; };

export type Tool = "crop" | Mark["kind"];

/** A rectangle between two corners, in either direction, clamped to the picture */
export function rectFrom(a: Point, b: Point, size: { w: number; h: number; }): Rect {
    const x1 = clamp(Math.min(a.x, b.x), 0, size.w), y1 = clamp(Math.min(a.y, b.y), 0, size.h);
    const x2 = clamp(Math.max(a.x, b.x), 0, size.w), y2 = clamp(Math.max(a.y, b.y), 0, size.h);
    return { x: Math.round(x1), y: Math.round(y1), w: Math.round(x2 - x1), h: Math.round(y2 - y1) };
}

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

/** Too small to mean anything: a click rather than a drag */
export const isTiny = (r: Rect) => r.w < 4 || r.h < 4;

/** Line width that reads the same on a phone screenshot and a 4K one */
export const strokeFor = (size: { w: number; h: number; }) => Math.max(3, Math.round(Math.max(size.w, size.h) / 250));

/** Blocks big enough that the text under them can't be read back */
export const blockFor = (r: Rect) => Math.max(8, Math.round(Math.min(r.w, r.h) / 6));

/** The arrow head's two side points, for a head `len` long */
export function arrowHead(from: Point, to: Point, len: number): [Point, Point] {
    const angle = Math.atan2(to.y - from.y, to.x - from.x);
    const spread = Math.PI / 7;
    return [
        { x: to.x - len * Math.cos(angle - spread), y: to.y - len * Math.sin(angle - spread) },
        { x: to.x - len * Math.cos(angle + spread), y: to.y - len * Math.sin(angle + spread) },
    ];
}

export function drawMark(ctx: CanvasRenderingContext2D, mark: Mark) {
    ctx.save();
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    switch (mark.kind) {
        case "blur": {
            const { x, y, w, h } = mark.rect;
            if (w < 1 || h < 1) break;
            const block = blockFor(mark.rect);
            const small = document.createElement("canvas");
            small.width = Math.max(1, Math.ceil(w / block));
            small.height = Math.max(1, Math.ceil(h / block));
            const s = small.getContext("2d")!;
            s.imageSmoothingEnabled = true;
            s.drawImage(ctx.canvas, x, y, w, h, 0, 0, small.width, small.height);
            ctx.imageSmoothingEnabled = false;
            ctx.drawImage(small, 0, 0, small.width, small.height, x, y, w, h);
            break;
        }
        case "box":
            ctx.strokeStyle = mark.color;
            ctx.lineWidth = mark.width;
            ctx.strokeRect(mark.rect.x, mark.rect.y, mark.rect.w, mark.rect.h);
            break;
        case "arrow": {
            ctx.strokeStyle = ctx.fillStyle = mark.color;
            ctx.lineWidth = mark.width;
            const [l, r] = arrowHead(mark.from, mark.to, mark.width * 4);
            ctx.beginPath();
            ctx.moveTo(mark.from.x, mark.from.y);
            ctx.lineTo(mark.to.x, mark.to.y);
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(mark.to.x, mark.to.y);
            ctx.lineTo(l.x, l.y);
            ctx.lineTo(r.x, r.y);
            ctx.closePath();
            ctx.fill();
            break;
        }
        case "pen":
            if (mark.points.length < 2) break;
            ctx.strokeStyle = mark.color;
            ctx.lineWidth = mark.width;
            ctx.beginPath();
            ctx.moveTo(mark.points[0].x, mark.points[0].y);
            for (const p of mark.points.slice(1)) ctx.lineTo(p.x, p.y);
            ctx.stroke();
            break;
    }
    ctx.restore();
}

/** The picture with every mark, at full size */
export function render(canvas: HTMLCanvasElement, image: CanvasImageSource, size: { w: number; h: number; }, marks: Mark[]) {
    canvas.width = size.w;
    canvas.height = size.h;
    const ctx = canvas.getContext("2d")!;
    ctx.drawImage(image, 0, 0, size.w, size.h);
    for (const mark of marks) drawMark(ctx, mark);
}

/** What the saved file is: PNG stays PNG, JPEG and WebP keep their type, anything else becomes PNG */
export function outputType(type: string, name: string): { type: string; name: string; } {
    if (type === "image/jpeg" || type === "image/webp") return { type, name };
    return { type: "image/png", name: /\.png$/i.test(name) ? name : name.replace(/\.[^.]*$/, "") + ".png" };
}

/** Images Quick Markup can open: still pictures the canvas can read (not GIFs, which would lose their motion) */
export const canMarkUp = (file: { type: string; name: string; }) =>
    /^image\/(png|jpeg|webp|bmp)$/.test(file.type) || /\.(png|jpe?g|jfif|webp|bmp)$/i.test(file.name);
