"use strict";

// Share-link codec, loaded by the page (index.html) and by tools/link.js.
// ---------- encoding (JSON -> [deflate] -> base64url) ----------

function toB64(bytes) {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function fromB64(str) {
  const bin = atob(str.replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}
async function pipe(bytes, stream) {
  const out = new Blob([bytes]).stream().pipeThrough(stream);
  return new Uint8Array(await new Response(out).arrayBuffer());
}

// Prefix "z" = deflate-compressed, "j" = plain.
async function encode(s) {
  const raw = new TextEncoder().encode(JSON.stringify(s));
  if (typeof CompressionStream !== "undefined") {
    try { return "z" + toB64(await pipe(raw, new CompressionStream("deflate-raw"))); } catch (e) { /* fall through */ }
  }
  return "j" + toB64(raw);
}
async function decode(str) {
  const bytes = fromB64(str.slice(1));
  const raw = str[0] === "z" ? await pipe(bytes, new DecompressionStream("deflate-raw")) : bytes;
  return JSON.parse(new TextDecoder().decode(raw));
}

if (typeof module !== "undefined") module.exports = { encode, decode };
