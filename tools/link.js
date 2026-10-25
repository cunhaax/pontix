#!/usr/bin/env node
// Decode / encode Pontix share links (shares codec.js with the page: JSON -> deflate-raw -> base64url).
//
//   node tools/link.js decode '<url or fragment>'      prints the state as JSON
//   node tools/link.js encode state.json [baseUrl]     prints a share link ("-" reads stdin)
//
// `encode` sets the state's `t` to now so the new link wins over data saved on the device.
// Never commit decoded states or generated links: they hold a child's data.
const { encode, decode } = require("../codec.js");
const fs = require("fs");

const DEFAULT_BASE = "https://cunhaax.github.io/pontix/";

const [cmd, arg, base = DEFAULT_BASE] = process.argv.slice(2);
if (cmd === "decode" && arg) {
  const frag = arg.includes("#") ? arg.slice(arg.indexOf("#") + 1) : arg;
  decode(frag).then((s) => console.log(JSON.stringify(s, null, 2)));
} else if (cmd === "encode" && arg) {
  const state = JSON.parse(fs.readFileSync(arg === "-" ? 0 : arg, "utf8"));
  if (state.v !== 1 || !Array.isArray(state.tasks) || !Array.isArray(state.rewards)) {
    console.error("Not a valid Pontix state (needs v:1, tasks[], rewards[])."); process.exit(1);
  }
  state.t = Date.now();
  encode(state).then((enc) => console.log(base + "#" + enc));
} else {
  console.error("Usage: link.js decode <url|fragment>  |  link.js encode <state.json|-> [baseUrl]");
  process.exit(1);
}
