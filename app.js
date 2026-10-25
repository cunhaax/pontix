"use strict";

const STORAGE_KEY = "pontix.state";
const LANG_KEY = "pontix.lang";

// ---------- helpers ----------

const $ = (id) => document.getElementById(id);
const uid = () => Math.random().toString(36).slice(2, 8);

function pad(n) { return String(n).padStart(2, "0"); }
function isoDate(d) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }
function parseDate(s) { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); }

// Monday of the week containing `d`, in the device's local time zone.
function mondayOf(d) {
  const r = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  r.setDate(r.getDate() - ((r.getDay() + 6) % 7));
  return r;
}

function sumWeek(week) {
  let s = 0;
  for (const id in week) for (const v of week[id]) s += v;
  return s;
}

// ---------- state ----------
// { v, t (last change, ms), ws (Monday of the current week, ISO date),
//   tasks:[{id,n,p (points per tap)}], rewards:[{id,n,c}],
//   cur / prev: { taskId: [7 ints, Mon..Sun] },
//   kid (child name), th ("blue"|"pink"|"green"|"yellow"),
//   base (points older than two weeks), spent (points spent on rewards) }

function emptyState() {
  return {
    v: 1, t: 0, ws: isoDate(mondayOf(new Date())),
    kid: "", th: "blue", md: "system", tasks: [], rewards: [], cur: {}, prev: {}, base: 0, spent: 0,
  };
}

function validState(s) {
  return s && s.v === 1 && Array.isArray(s.tasks) && Array.isArray(s.rewards)
    && s.cur && s.prev && typeof s.ws === "string";
}

// Move finished weeks into the accumulated total.
function rollover(s) {
  const weeks = Math.round((mondayOf(new Date()) - parseDate(s.ws)) / (7 * 864e5));
  if (weeks <= 0) return false;
  if (weeks === 1) {
    s.base += sumWeek(s.prev);
    s.prev = s.cur;
  } else {
    s.base += sumWeek(s.prev) + sumWeek(s.cur);
    s.prev = {};
  }
  s.cur = {};
  s.ws = isoDate(mondayOf(new Date()));
  // Drop data of removed tasks once it's no longer in the visible weeks.
  const live = new Set(s.tasks.map((t) => t.id));
  for (const id in s.prev) if (!live.has(id) && s.prev[id].every((v) => v === 0)) delete s.prev[id];
  return true;
}

function balance(s) {
  return s.base + sumWeek(s.prev) + sumWeek(s.cur) - s.spent;
}

let state = emptyState();

// ---------- persistence ----------

let saveSeq = 0;
async function persist(touch = true) {
  if (touch) state.t = Date.now();
  const seq = ++saveSeq;
  const enc = await encode(state);
  if (seq !== saveSeq) return; // a newer change superseded this one
  try { localStorage.setItem(STORAGE_KEY, enc); } catch (e) { /* storage unavailable */ }
  history.replaceState(null, "", "#" + enc);
}

function change(fn) {
  fn(state);
  render();
  persist();
}

async function loadInitial() {
  let local = null, linked = null;
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) local = await decode(saved);
  } catch (e) { local = null; }
  try {
    const hash = location.hash.slice(1);
    if (hash) linked = await decode(hash);
  } catch (e) { linked = null; }
  if (!validState(local)) local = null;
  if (!validState(linked)) linked = null;

  let chosen = linked || local || emptyState();
  if (linked && local && linked.t !== local.t && local.t > linked.t && !confirm(t("conflict"))) {
    chosen = local;
  }
  state = chosen;
  rollover(state);
  render();
  persist(false);
}

// ---------- i18n ----------

let lang = "en";
function t(key, params) {
  let s = (I18N[lang] && I18N[lang][key]) || I18N.en[key] || key;
  for (const k in params || {}) s = s.replace(`{${k}}`, params[k]);
  return s;
}
function detectLang() {
  try { const l = localStorage.getItem(LANG_KEY); if (I18N[l]) return l; } catch (e) { /* ignore */ }
  return (navigator.language || "en").toLowerCase().startsWith("pt") ? "pt" : "en";
}
function applyStatic() {
  document.documentElement.lang = lang === "pt" ? "pt-PT" : "en";
  $("lang").value = lang;
  document.querySelectorAll("[data-i18n]").forEach((el) => { el.textContent = t(el.dataset.i18n); });
  document.querySelectorAll("[data-i18n-aria]").forEach((el) => { el.ariaLabel = t(el.dataset.i18nAria); });
  document.querySelectorAll("[data-i18n-ph]").forEach((el) => { el.placeholder = t(el.dataset.i18nPh); });
}

// ---------- rendering ----------

// Weekday names and day-of-month numbers for the week `weeksBack` before the current one.
function weekDays(weeksBack = 0) {
  const mon = parseDate(state.ws);
  mon.setDate(mon.getDate() - 7 * weeksBack);
  return [...Array(7)].map((_, i) => { const d = new Date(mon); d.setDate(mon.getDate() + i); return d.getDate(); });
}

function weekdayLabels() {
  const fmt = new Intl.DateTimeFormat(lang === "pt" ? "pt-PT" : "en", { weekday: "short" });
  const mon = parseDate(state.ws);
  return [...Array(7)].map((_, i) => {
    const d = new Date(mon); d.setDate(mon.getDate() + i);
    return fmt.format(d).replace(".", "").slice(0, 3);
  });
}

function el(tag, props, ...kids) {
  const e = document.createElement(tag);
  Object.assign(e, props || {});
  for (const k of kids) e.append(k);
  return e;
}

function numSpan(v) {
  return el("span", { className: "n " + (v > 0 ? "pos" : v < 0 ? "neg" : ""), textContent: v === 0 ? "" : (v > 0 ? "+" : "") + v });
}

function renderGrid(container, weekKey, editable) {
  const week = state[weekKey];
  container.replaceChildren();
  container.className = "grid-wrap" + (editable ? "" : " ro");
  if (!state.tasks.length) {
    container.append(el("p", { className: "empty", textContent: t("empty") }));
    return;
  }
  const labels = weekdayLabels();
  const todayIdx = weekKey === "cur" ? (new Date().getDay() + 6) % 7 : -1;

  const head = el("tr", null, el("th", { textContent: t("task") }));
  const nums = weekDays(weekKey === "cur" ? 0 : 1);
  labels.forEach((l, i) => head.append(el("th", { className: i === todayIdx ? "today" : "" },
    l, el("div", { className: "dnum", textContent: nums[i] }))));
  const tbody = el("tbody");

  for (const task of state.tasks) {
    const days = week[task.id] || (week[task.id] = Array(7).fill(0));
    const step = taskPts(task);
    const tot = days.reduce((a, b) => a + b, 0);
    const tr = el("tr", null, el("td", null, el("div", { className: "tname", textContent: task.n }),
      el("div", { className: "tpts", textContent: `+${step}/tap · ${t("total")} ` },
        el("b", { className: tot < 0 ? "neg" : "", textContent: tot }))));
    days.forEach((v, i) => {
      const cell = el("div", { className: "cell" },
        el("button", { textContent: "+", ariaLabel: t("plus"), onclick: () => adjust(weekKey, task.id, i, step) }),
        numSpan(v),
        el("button", { textContent: "−", ariaLabel: t("minus"), onclick: () => adjust(weekKey, task.id, i, -step) }));
      tr.append(el("td", { className: i === todayIdx ? "today" : "" }, cell));
    });
    tbody.append(tr);
  }
  container.append(el("table", null, el("thead", null, head), tbody));
}

function taskPts(task) { return task.p > 0 ? task.p : 1; }

function adjust(weekKey, id, day, delta) {
  change((s) => {
    const days = s[weekKey][id] || (s[weekKey][id] = Array(7).fill(0));
    days[day] += delta;
  });
}

function dayTotals(week) {
  const out = Array(7).fill(0);
  for (const id in week) week[id].forEach((v, i) => { out[i] += v; });
  return out;
}

// Drop the leading emoji of a label (SVG text renders it poorly).
const plain = (str) => str.replace(/^\S+\s/, "");

function renderChart() {
  const vals = [...dayTotals(state.prev), ...dayTotals(state.cur)];
  const W = 340, H = 170, top = 18, bottom = 30, left = 4, right = 4;
  const max = Math.max(1, ...vals), min = Math.min(0, ...vals);
  const plotH = H - top - bottom;
  const y = (v) => top + (max - v) / (max - min) * plotH;
  const bw = (W - left - right) / 14;
  const NS = "http://www.w3.org/2000/svg";
  const mk = (tag, attrs, text) => {
    const n = document.createElementNS(NS, tag);
    for (const k in attrs) n.setAttribute(k, attrs[k]);
    if (text !== undefined) n.textContent = text;
    return n;
  };
  const svg = mk("svg", { viewBox: `0 0 ${W} ${H}`, role: "img", "aria-label": t("chartTitle") });
  const letters = weekdayLabels().map((l) => l.slice(0, 1).toUpperCase());
  vals.forEach((v, i) => {
    const x = left + i * bw;
    const y0 = y(0), y1 = y(v);
    svg.append(mk("rect", {
      x: x + 2, width: bw - 4, y: Math.min(y0, y1), height: Math.max(Math.abs(y1 - y0), v === 0 ? 0 : 1),
      class: v < 0 ? "bar-neg" : "bar-pos", rx: 2,
    }));
    if (v !== 0) {
      svg.append(mk("text", { x: x + bw / 2, y: v > 0 ? y1 - 3 : y1 + 10, "text-anchor": "middle" }, v));
    }
    svg.append(mk("text", { x: x + bw / 2, y: H - 14, "text-anchor": "middle" }, letters[i % 7]));
  });
  svg.append(mk("line", { class: "axis", x1: left, x2: W - right, y1: y(0), y2: y(0) }));
  svg.append(mk("line", { class: "sep", x1: left + 7 * bw, x2: left + 7 * bw, y1: top, y2: H - bottom }));
  svg.append(mk("text", { x: left + 3.5 * bw, y: H - 2, "text-anchor": "middle" }, plain(t("lastWeek"))));
  svg.append(mk("text", { x: left + 10.5 * bw, y: H - 2, "text-anchor": "middle" }, plain(t("thisWeek"))));
  $("chart").replaceChildren(svg);
}

function renderRewards() {
  const bal = balance(state);
  const ul = $("rewards");
  ul.replaceChildren();
  if (!state.rewards.length) { ul.append(el("li", { className: "empty", textContent: t("noRewards") })); return; }
  for (const r of state.rewards) {
    const btn = el("button", {
      textContent: t("redeem"), disabled: bal < r.c, title: bal < r.c ? t("notEnough") : "",
      onclick: () => {
        if (!confirm(t("redeemConfirm", { name: r.n, cost: r.c }))) return;
        change((s) => { s.spent += r.c; });
        toast(t("redeemed", { name: r.n }));
      },
    });
    ul.append(el("li", null,
      el("span", { className: "name", textContent: (/^\p{Extended_Pictographic}/u.test(r.n) ? "" : "🎁 ") + r.n }),
      el("span", { className: "cost", textContent: `${r.c} ${t("points")}` }), btn));
  }
}

function renderEditors() {
  // Skip rebuilding while the user is typing in one of these inputs.
  if (document.activeElement && document.activeElement.closest("#edit-tasks, #edit-rewards")) return;
  const tl = $("edit-tasks"), rl = $("edit-rewards");
  tl.replaceChildren(); rl.replaceChildren();
  for (const task of state.tasks) {
    tl.append(el("li", null,
      el("input", { type: "text", value: task.n, maxLength: 60, onchange: (e) => rename(task.id, e.target.value) }),
      el("input", { type: "number", value: taskPts(task), min: 1, step: 1, inputMode: "numeric", className: "cost",
        ariaLabel: t("pointsPerTap"), onchange: (e) => editTask(task.id, { p: Math.max(1, parseInt(e.target.value, 10) || taskPts(task)) }) }),
      el("button", { textContent: "✕", ariaLabel: t("remove"), onclick: () => removeTask(task) })));
  }
  for (const r of state.rewards) {
    rl.append(el("li", null,
      el("input", { type: "text", value: r.n, maxLength: 60, onchange: (e) => editReward(r.id, { n: e.target.value.trim() || r.n }) }),
      el("input", { type: "number", value: r.c, min: 1, step: 1, inputMode: "numeric", className: "cost",
        onchange: (e) => editReward(r.id, { c: Math.max(1, parseInt(e.target.value, 10) || r.c) }) }),
      el("button", { textContent: "✕", ariaLabel: t("remove"), onclick: () => removeReward(r) })));
  }
}

function rename(id, name) {
  change((s) => { const x = s.tasks.find((k) => k.id === id); if (x && name.trim()) x.n = name.trim(); });
}
function editTask(id, patch) {
  change((s) => Object.assign(s.tasks.find((k) => k.id === id) || {}, patch));
}
function editReward(id, patch) {
  change((s) => Object.assign(s.rewards.find((k) => k.id === id) || {}, patch));
}
// Removing a task keeps its recorded points in the balance and the chart.
function removeTask(task) {
  if (confirm(t("removeTaskConfirm", { name: task.n }))) change((s) => { s.tasks = s.tasks.filter((k) => k.id !== task.id); });
}
function removeReward(r) {
  if (confirm(t("removeRewardConfirm", { name: r.n }))) change((s) => { s.rewards = s.rewards.filter((k) => k.id !== r.id); });
}

const darkQuery = window.matchMedia("(prefers-color-scheme: dark)");
function applyScheme() {
  const dark = state.md === "dark" || (state.md !== "light" && darkQuery.matches);
  document.documentElement.dataset.scheme = dark ? "dark" : "light";
}
darkQuery.addEventListener("change", applyScheme);

const THEME_COLORS = { blue: "#2563eb", pink: "#db2777", green: "#15803d", yellow: "#a16207" };

function render() {
  applyStatic();
  showSettings(inSettings);
  const bal = balance(state);
  const th = THEME_COLORS[state.th] ? state.th : "blue";
  document.documentElement.dataset.theme = th;
  document.querySelector('meta[name="theme-color"]').content = THEME_COLORS[th];
  $("balance-label").textContent = state.kid ? t("balanceOf", { name: state.kid }) : t("balance");
  $("kid").placeholder = t("childName");
  if (document.activeElement !== $("kid")) $("kid").value = state.kid || "";
  applyScheme();
  document.querySelectorAll("#modes button").forEach((btn) => btn.setAttribute("aria-pressed", btn.dataset.md === (state.md || "system")));
  document.querySelectorAll("#themes button").forEach((btn) => btn.setAttribute("aria-pressed", btn.dataset.th === (THEME_COLORS[state.th] ? state.th : "blue")));
  const b = $("balance");
  b.textContent = bal;
  b.className = bal < 0 ? "neg" : "";
  const fresh = !state.tasks.length;
  $("welcome").hidden = !fresh;
  document.querySelectorAll("#view-main .data").forEach((sec) => { sec.hidden = fresh; });
  document.querySelector("footer").hidden = fresh;
  document.querySelectorAll(".langs button").forEach((b) => b.setAttribute("aria-pressed", b.dataset.lang === lang));
  renderGrid($("grid-cur"), "cur", true);
  renderGrid($("grid-prev"), "prev", true);
  renderChart();
  renderRewards();
  renderEditors();
}

// ---------- sharing & events ----------

let toastTimer;
function toast(msg) {
  const el_ = $("toast");
  el_.textContent = msg;
  el_.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el_.classList.remove("show"), 2000);
}

async function share() {
  await persist(false);
  const url = location.href;
  if (navigator.share) {
    try { await navigator.share({ title: "Pontix", url }); return; } catch (e) { if (e.name === "AbortError") return; }
  }
  try { await navigator.clipboard.writeText(url); toast(t("copied")); } catch (e) { prompt(t("share"), url); }
}

let inSettings = false;
function showSettings(on) {
  inSettings = on;
  $("view-main").hidden = on;
  $("view-settings").hidden = !on;
  $("title").textContent = on ? t("settings") : "🚀 Pontix";
  $("gear").textContent = on ? t("done") : "⚙";
  $("gear").ariaLabel = on ? t("done") : t("settings");
  $("gear").classList.toggle("text", on);
}
$("gear").addEventListener("click", () => { showSettings(!inSettings); window.scrollTo(0, 0); render(); });

$("share").addEventListener("click", share);
function setLang(l) {
  lang = l;
  try { localStorage.setItem(LANG_KEY, lang); } catch (err) { /* ignore */ }
  render();
}
$("lang").addEventListener("change", (e) => setLang(e.target.value));
document.querySelectorAll(".langs button").forEach((b) => b.addEventListener("click", () => setLang(b.dataset.lang)));
$("add-task").addEventListener("submit", (e) => {
  e.preventDefault();
  const n = e.target.n.value.trim(), p = parseInt(e.target.p.value, 10) || 1;
  if (!n) return;
  change((s) => s.tasks.push({ id: uid(), n, p: Math.max(1, p) }));
  e.target.reset();
});
$("add-reward").addEventListener("submit", (e) => {
  e.preventDefault();
  const n = e.target.n.value.trim(), c = parseInt(e.target.c.value, 10);
  if (!n || !(c > 0)) return;
  change((s) => s.rewards.push({ id: uid(), n, c }));
  e.target.reset();
});
$("kid").addEventListener("input", (e) => change((s) => { s.kid = e.target.value.trim().slice(0, 30); }));
document.querySelectorAll("#themes button").forEach((btn) =>
  btn.addEventListener("click", () => change((s) => { s.th = btn.dataset.th; })));
document.querySelectorAll("#modes button").forEach((btn) =>
  btn.addEventListener("click", () => change((s) => { s.md = btn.dataset.md; })));
// ---------- printable checklist ----------

// Fill #print-sheet with a blank, date-free black-and-white checklist (reusable week after week).
function buildSheet() {
  const locale = lang === "pt" ? "pt-PT" : "en";
  const wd = new Intl.DateTimeFormat(locale, { weekday: "short" });
  const title = `⭐ ${state.kid ? t("sheetOf", { name: state.kid }) : t("sheetMine")} ⭐`;

  const head = el("tr", null, el("th", { textContent: `📋 ${t("sheetTasks")}` }));
  for (let i = 0; i < 7; i++) {
    // 2024-01-01 was a Monday; only the weekday name is used.
    head.append(el("th", { textContent: wd.format(new Date(2024, 0, 1 + i)).replace(".", "").slice(0, 3) }));
  }
  const tbody = el("tbody");
  for (const task of state.tasks) {
    const tr = el("tr", null, el("td", { className: "sname" }, task.n, el("span", { textContent: ` · ${taskPts(task)} ${t("points")}` })));
    for (let i = 0; i < 7; i++) tr.append(el("td", null, el("span", { className: "box" })));
    tbody.append(tr);
  }
  const sheet = $("print-sheet");
  sheet.replaceChildren(
    el("h1", { textContent: title }),
    el("p", { className: "srange", textContent: t("sheetPencil") }),
    el("table", null, el("thead", null, head), tbody),
    el("p", { className: "stotal", textContent: `⭐ ${t("sheetTotal")}: ` }, el("span", { className: "line" })),
    el("p", { className: "cheer", textContent: t("sheetCheer") }));
  if (state.rewards.length) {
    sheet.append(el("h2", { textContent: `🏆 ${t("sheetRewards")}` }),
      el("ul", null, ...state.rewards.map((r) => el("li", { textContent: `🎁 ${r.n} — ${r.c} ${t("points")}` }))));
  }
}

$("print").addEventListener("click", () => {
  buildSheet();
  window.print();
});

document.querySelectorAll('[data-action="examples"]').forEach((b) => b.addEventListener("click", () => {
  const ex = I18N[lang];
  change((s) => {
    ex.exTasks.forEach(([n, p]) => s.tasks.push({ id: uid(), n, p }));
    ex.exRewards.forEach(([n, c]) => s.rewards.push({ id: uid(), n, c }));
  });
  window.scrollTo(0, 0);
}));
document.querySelectorAll('[data-action="scratch"]').forEach((b) => b.addEventListener("click", () => {
  showSettings(true); window.scrollTo(0, 0);
}));
$("reset").addEventListener("click", () => {
  if (confirm(t("resetConfirm"))) change((s) => Object.assign(s, emptyState()));
});
// Keep the week boundaries right if the page stays open across midnight.
document.addEventListener("visibilitychange", () => {
  if (!document.hidden && rollover(state)) { render(); persist(false); }
});
// Opening a different link in an already-open tab.
window.addEventListener("hashchange", async () => {
  try {
    const next = await decode(location.hash.slice(1));
    if (validState(next) && next.t !== state.t) { state = next; rollover(state); render(); persist(false); }
  } catch (e) { /* ignore malformed fragments */ }
});

lang = detectLang();
applyStatic();
loadInitial();
