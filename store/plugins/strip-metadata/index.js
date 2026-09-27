var __defProp = Object.defineProperty;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __hasOwnProp = Object.prototype.hasOwnProperty;
function __accessProp(key) {
  return this[key];
}
var __toCommonJS = (from) => {
  var entry = (__moduleCache ??= new WeakMap).get(from), desc;
  if (entry)
    return entry;
  entry = __defProp({}, "__esModule", { value: true });
  if (from && typeof from === "object" || typeof from === "function") {
    for (var key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(entry, key))
        __defProp(entry, key, {
          get: __accessProp.bind(from, key),
          enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable
        });
  }
  __moduleCache.set(from, entry);
  return entry;
};
var __moduleCache;
var __returnValue = (v) => v;
function __exportSetter(name, newValue) {
  this[name] = __returnValue.bind(null, newValue);
}
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, {
      get: all[name],
      enumerable: true,
      configurable: true,
      set: __exportSetter.bind(all, name)
    });
};

// plugins/strip-metadata/index.ts
var exports_strip_metadata = {};
__export(exports_strip_metadata, {
  default: () => strip_metadata_default
});
module.exports = __toCommonJS(exports_strip_metadata);
var import_api = require("@evi/api");

// plugins/strip-metadata/strip.ts
var PNG_SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10];
var PNG_DROP = new Set(["tEXt", "iTXt", "zTXt", "eXIf", "tIME"]);
var WEBP_DROP = new Set(["EXIF", "XMP "]);
var ascii = (b, start, len) => String.fromCharCode(...b.subarray(start, start + len));
function detectImage(b) {
  if (b.length >= 3 && b[0] === 255 && b[1] === 216 && b[2] === 255)
    return "jpeg";
  if (b.length >= 8 && PNG_SIGNATURE.every((v, i) => b[i] === v))
    return "png";
  if (b.length >= 12 && ascii(b, 0, 4) === "RIFF" && ascii(b, 8, 4) === "WEBP")
    return "webp";
  return null;
}
function stripMetadata(data) {
  const kind = detectImage(data);
  const out = kind === "jpeg" ? stripJpeg(data) : kind === "png" ? stripPng(data) : kind === "webp" ? stripWebp(data) : null;
  return out ? { data: out, changed: true, kind } : { data, changed: false, kind };
}
function concat(parts) {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let offset = 0;
  for (const p of parts) {
    out.set(p, offset);
    offset += p.length;
  }
  return out;
}
function readExifOrientation(seg) {
  if (seg.length < 14 || ascii(seg, 0, 6) !== "Exif\x00\x00")
    return;
  const tiff = seg.subarray(6);
  const order = ascii(tiff, 0, 2);
  if (order !== "II" && order !== "MM")
    return;
  const view = new DataView(tiff.buffer, tiff.byteOffset, tiff.byteLength);
  const le = order === "II";
  if (view.getUint16(2, le) !== 42)
    return;
  const ifd = view.getUint32(4, le);
  if (ifd + 2 > tiff.length)
    return;
  const count = view.getUint16(ifd, le);
  for (let i = 0;i < count; i++) {
    const entry = ifd + 2 + i * 12;
    if (entry + 12 > tiff.length)
      return;
    if (view.getUint16(entry, le) === 274) {
      const value = view.getUint16(entry + 8, le);
      return value >= 1 && value <= 8 ? value : undefined;
    }
  }
}
function orientationSegment(orientation) {
  const payload = [
    ...[69, 120, 105, 102, 0, 0],
    77,
    77,
    0,
    42,
    0,
    0,
    0,
    8,
    0,
    1,
    1,
    18,
    0,
    3,
    0,
    0,
    0,
    1,
    0,
    orientation,
    0,
    0,
    0,
    0,
    0,
    0
  ];
  const len = payload.length + 2;
  return new Uint8Array([255, 225, len >> 8, len & 255, ...payload]);
}
function keepJpegSegment(marker, payload) {
  if (marker === 224)
    return true;
  if (marker === 226)
    return ascii(payload, 0, 12) === "ICC_PROFILE\x00";
  if (marker === 238)
    return ascii(payload, 0, 5) === "Adobe";
  return false;
}
function stripJpeg(b) {
  const parts = [b.subarray(0, 2)];
  let orientation;
  let removed = false;
  let i = 2;
  while (i < b.length) {
    if (b[i] !== 255)
      return null;
    let markerAt = i;
    while (b[markerAt + 1] === 255)
      markerAt++;
    const marker = b[markerAt + 1];
    if (marker === undefined)
      return null;
    if (marker === 218 || marker === 217) {
      parts.push(b.subarray(markerAt));
      break;
    }
    if (marker === 1 || marker >= 208 && marker <= 215) {
      parts.push(b.subarray(markerAt, markerAt + 2));
      i = markerAt + 2;
      continue;
    }
    if (markerAt + 4 > b.length)
      return null;
    const len = b[markerAt + 2] << 8 | b[markerAt + 3];
    const end = markerAt + 2 + len;
    if (len < 2 || end > b.length)
      return null;
    const payload = b.subarray(markerAt + 4, end);
    const isMeta = marker >= 224 && marker <= 239 || marker === 254;
    if (isMeta && !keepJpegSegment(marker, payload)) {
      if (marker === 225)
        orientation ??= readExifOrientation(payload);
      removed = true;
    } else {
      parts.push(b.subarray(markerAt, end));
    }
    i = end;
  }
  if (!removed)
    return null;
  if (orientation && orientation !== 1) {
    const at = parts.length > 1 && parts[1][1] === 224 ? 2 : 1;
    parts.splice(at, 0, orientationSegment(orientation));
  }
  return concat(parts);
}
function stripPng(b) {
  const view = new DataView(b.buffer, b.byteOffset, b.byteLength);
  const parts = [b.subarray(0, 8)];
  let removed = false;
  let i = 8;
  while (i < b.length) {
    if (i + 12 > b.length)
      return null;
    const len = view.getUint32(i);
    const type = ascii(b, i + 4, 4);
    const end = i + 12 + len;
    if (end > b.length)
      return null;
    if (PNG_DROP.has(type))
      removed = true;
    else
      parts.push(b.subarray(i, end));
    i = end;
    if (type === "IEND") {
      if (i < b.length)
        removed = true;
      break;
    }
  }
  return removed ? concat(parts) : null;
}
function stripWebp(b) {
  const view = new DataView(b.buffer, b.byteOffset, b.byteLength);
  const riffEnd = Math.min(b.length, 8 + view.getUint32(4, true));
  const parts = [];
  let removed = false;
  let i = 12;
  while (i + 8 <= riffEnd) {
    const type = ascii(b, i, 4);
    const size = view.getUint32(i + 4, true);
    const end = i + 8 + size + (size & 1);
    if (i + 8 + size > riffEnd)
      return null;
    if (WEBP_DROP.has(type)) {
      removed = true;
    } else if (type === "VP8X" && size >= 1) {
      const chunk = b.slice(i, Math.min(end, riffEnd));
      chunk[8] &= ~(8 | 4);
      parts.push(chunk);
    } else {
      parts.push(b.subarray(i, Math.min(end, riffEnd)));
    }
    i = end;
  }
  if (!removed)
    return null;
  const body = concat(parts);
  const header = new Uint8Array(12);
  header.set(b.subarray(0, 12));
  new DataView(header.buffer).setUint32(4, body.length + 4, true);
  return concat([header, body]);
}
function randomFileName(name, random = Math.random) {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let base = "";
  for (let i = 0;i < 12; i++)
    base += chars[Math.floor(random() * chars.length) % chars.length];
  const match = /\.([A-Za-z0-9]{1,10})$/.exec(name);
  return match && match.index > 0 ? `${base}.${match[1]}` : base;
}

// plugins/strip-metadata/index.ts
var settings = {
  stripImages: {
    type: "boolean",
    label: "Strip image metadata",
    description: "Remove EXIF (camera, GPS location, dates), XMP and text chunks from JPEG, PNG and WebP images.",
    default: true
  },
  randomNames: {
    type: "boolean",
    label: "Random file names",
    description: "Upload files with a random name, keeping the extension.",
    default: true
  }
};
var MAX_IMAGE_BYTES = 100 * 1024 * 1024;
var IMAGE_NAME = /\.(jpe?g|jfif|png|apng|webp)$/i;
var METHODS = ["addFiles", "addFile", "setFile"];
var uploadActions = import_api.filters.byProps("addFiles", "clearAll");
var uploadEntry = import_api.filters.byCode("INSTANT_UPLOAD", "requireConfirm");
var context;
var cleaned = new WeakSet;
async function cleanFile(file) {
  const ctx = context;
  if (!ctx || cleaned.has(file))
    return file;
  const strip = ctx.settings.get("stripImages");
  const rename = ctx.settings.get("randomNames");
  let parts = [file];
  let name = file.name;
  if (strip && file.size <= MAX_IMAGE_BYTES && (file.type.startsWith("image/") || IMAGE_NAME.test(file.name))) {
    const result = stripMetadata(new Uint8Array(await file.arrayBuffer()));
    if (result.changed)
      parts = [result.data];
  }
  if (rename)
    name = randomFileName(file.name);
  if (parts[0] === file && name === file.name)
    return file;
  const clean = new File(parts, name, { type: file.type, lastModified: Date.now() });
  cleaned.add(clean);
  return clean;
}
function collectFiles(value, found, depth = 0) {
  if (!value || typeof value !== "object" || depth > 4)
    return;
  const entries = Array.isArray(value) ? value.map((v, i) => [i, v]) : Object.entries(value);
  for (const [key, v] of entries) {
    if (v instanceof File)
      found.push({ owner: value, key, file: v });
    else if (v && typeof v === "object" && (Array.isArray(v) || Object.getPrototypeOf(v) === Object.prototype))
      collectFiles(v, found, depth + 1);
  }
}
async function cleanArgs(args) {
  const found = [];
  collectFiles(args, found);
  await Promise.all(found.map(async ({ owner, key, file }) => {
    try {
      const clean = await cleanFile(file);
      if (clean === file)
        return;
      owner[key] = clean;
      for (const prop of ["name", "filename"]) {
        if (!Array.isArray(owner) && owner[prop] === file.name)
          owner[prop] = clean.name;
      }
    } catch (err) {
      context?.logger.error("Couldn't clean", file.name, err);
    }
  }));
}
function hasFiles(args) {
  const found = [];
  collectFiles(args, found);
  return found.some((f) => !cleaned.has(f.file));
}
function interceptEntry(call) {
  const ctx = context;
  const [files, ...rest] = call.args;
  const list = files && typeof files === "object" && typeof files.length === "number" ? Array.from(files) : [];
  if (!ctx || !ctx.settings.get("stripImages") && !ctx.settings.get("randomNames") || !list.some((f) => f instanceof File && !cleaned.has(f))) {
    return call.callOriginal(...call.args);
  }
  const clean = list.map((f) => f instanceof File ? cleanFile(f).catch((err) => {
    context?.logger.error("Couldn't clean", f.name, err);
    return f;
  }) : f);
  return Promise.all(clean).then((files2) => call.callOriginal(files2, ...rest));
}
function interceptUpload(call) {
  const ctx = context;
  if (!ctx || !ctx.settings.get("stripImages") && !ctx.settings.get("randomNames") || !hasFiles(call.args)) {
    return call.callOriginal(...call.args);
  }
  return cleanArgs(call.args).then(() => call.callOriginal(...call.args));
}
var strip_metadata_default = import_api.definePlugin({
  settings,
  start(ctx) {
    context = ctx;
    ctx.onDispose(() => void (context = undefined));
    ctx.hookExport("instead", uploadEntry, interceptEntry);
    ctx.waitFor(uploadActions, (actions) => {
      for (const method of METHODS) {
        if (typeof actions[method] === "function")
          ctx.hook.instead(actions, method, interceptUpload);
      }
    });
  }
});
