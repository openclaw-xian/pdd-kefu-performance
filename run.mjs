// run.mjs — 多店「客服绩效数据」日期选择 + 底部截图（普通 Node）
import fs from "node:fs/promises";
import { existsSync } from "node:fs";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import os from "node:os";
import path from "node:path";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function addDays(iso, n) {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
const CFG_PATH = process.argv[2];
if (!CFG_PATH) { console.error("用法: node run.mjs <config.json>"); process.exit(2); }
const CFG = JSON.parse(await fs.readFile(CFG_PATH, "utf8"));

const SELF_DIR = path.dirname(fileURLToPath(import.meta.url));
const WORKER = String(CFG.worker || path.join(SELF_DIR, "worker-kefu.mjs")).replace(/\\/g, "/");
const HOME = os.homedir();
function findEgo() {
  for (const x of [
    path.join(HOME, ".local", "share", "ego", "active_version_dir", "ego-browser.exe"),
    path.join(HOME, ".local", "bin", "ego-browser.exe"),
  ]) if (existsSync(x)) return x;
  return "ego-browser";
}
const ROOT = String(CFG.root || process.env.PDD_BILLS_ROOT || path.join(process.cwd(), "pdd-bills")).replace(/\\/g, "/").replace(/\/$/, "");
const EGO = String(CFG.ego || process.env.PDD_EGO_BROWSER || findEgo()).replace(/\\/g, "/");
const STORES_CFG = String(CFG.storesConfig || path.join(ROOT, "_stores.json")).replace(/\\/g, "/");
const RUNTIME = String(CFG.runtimeDir || path.join(os.tmpdir(), "pdd-kefu-runtime")).replace(/\\/g, "/").replace(/\/$/, "");
const RUN_ID = "kefu-" + new Date().toISOString().replace(/[-:T]/g, "").slice(0, 14);
const RUN_DIR = path.join(ROOT, "_runs", RUN_ID);
const RESULT_DIR = path.join(RUN_DIR, "results");
const LOG_DIR = path.join(RUN_DIR, "logs");
const CONCURRENCY = Math.max(1, Math.min(6, Number(CFG.concurrency || 1)));
const DOCTOR = !!CFG.doctor || CFG.mode === "doctor";
const RETENTION_DAYS = Math.max(1, Math.min(365, Number(CFG.retentionDays || 62)));

const from = String(CFG.from || "");
const to = String(CFG.to || "");
const today = new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 10);
const issues = [];
const addIssue = (code, q, extra = {}) => issues.push({ code, question: q, ...extra });
if (!/^20\d\d-\d\d-\d\d$/.test(from) || !/^20\d\d-\d\d-\d\d$/.test(to)) addIssue("range_invalid", "from/to 必须是 YYYY-MM-DD", { from, to });
else if (from > to) addIssue("range_reversed", "起始日晚于结束日", { from, to });
else if (to > today) addIssue("range_in_future", "结束日在未来（今天 " + today + "）", { to });
else {
  const earliest = addDays(today, -RETENTION_DAYS);
  if (from < earliest) addIssue("date_before_retention", "客服绩效只保留最近约 " + RETENTION_DAYS + " 天；最早可选 " + earliest + "，当前 from=" + from, { from, earliest, retentionDays: RETENTION_DAYS });
}

const rootOnC = /^[A-Za-z]:/.test(ROOT) && ROOT[0].toUpperCase() === "C" && !CFG.allowC;
if (!existsSync(ROOT)) {
  if (rootOnC) addIssue("root_on_c_drive", "根目录在 C 盘：" + ROOT, { root: ROOT });
  else {
    try { await fs.mkdir(ROOT, { recursive: true }); console.log("ROOT_AUTO_CREATED=" + ROOT); }
    catch (e) { addIssue("root_create_failed", "无法创建根目录：" + ROOT, { root: ROOT }); }
  }
}
if (EGO !== "ego-browser" && !existsSync(EGO)) addIssue("ego_not_found", "ego-browser 不可用：" + EGO, { ego: EGO });

let stores = [];
if (CFG.shops && CFG.shops.length) {
  stores = CFG.shops.map((s) => (typeof s === "string" ? { shop: s } : s)).filter((s) => s && s.shop);
} else if (existsSync(STORES_CFG)) {
  try {
    const reg = JSON.parse(await fs.readFile(STORES_CFG, "utf8"));
    stores = (reg.stores || []).filter((s) => s.enabled !== false && s.shop);
  } catch (e) { addIssue("stores_config_invalid", "店铺清单不是合法 JSON：" + STORES_CFG, { path: STORES_CFG }); }
}
if (CFG.only && CFG.only.length) stores = stores.filter((s) => CFG.only.includes(s.shop));
if (!stores.length && !issues.some((i) => i.code === "stores_config_invalid")) {
  addIssue("stores_config_missing", "没有可跑店铺：请在 config 里给 shops 或提供 " + STORES_CFG, { path: STORES_CFG });
}
if (issues.length) {
  console.log("PREFLIGHT=needs_user_input");
  console.log(JSON.stringify({ status: "needs_user_input", runId: RUN_ID, root: ROOT, issues }, null, 1));
  process.exit(3);
}

const f = from.split("-").map(Number);
const t = to.split("-").map(Number);
const monthEnd = new Date(t[0], t[1], 0).getDate();
const isWholeMonth = f[1] === t[1] && f[2] === 1 && t[2] === monthEnd;
const periodDir = CFG.periodDir ? String(CFG.periodDir) : (isWholeMonth ? from.slice(0, 7) : from + "_" + to);
const label = CFG.label ? String(CFG.label) : (isWholeMonth ? String(t[1]) + "月" : f[1] + "月" + f[2] + "日-" + t[1] + "月" + t[2] + "日");
await fs.mkdir(RESULT_DIR, { recursive: true });
await fs.mkdir(LOG_DIR, { recursive: true });
await fs.mkdir(RUNTIME + "/" + RUN_ID, { recursive: true });

async function runOne(store, i, mode = "run") {
  const job = {
    shop: store.shop,
    profile: store.profile || null,
    from, to, root: ROOT,
    periodDir, label,
    pngName: store.shop + "-客服绩效-" + label + ".png",
    resultPath: mode === "doctor" ? path.join(os.tmpdir(), "pdd-kefu-doctor-" + RUN_ID + "-" + i + ".json") : path.join(RESULT_DIR, store.shop + ".json"),
    logPath: path.join(LOG_DIR, store.shop + ".log"),
    keepOpen: !!CFG.keepOpen,
    mode,
  };
  const wrapper = RUNTIME + "/" + RUN_ID + "/job-" + i + ".mjs";
  await fs.writeFile(wrapper, "globalThis.__JOB = " + JSON.stringify(job) + ";\nawait import('file:///" + WORKER + "');\n", "utf8");
  const started = Date.now();
  const child = spawn(EGO, ["nodejs", "-e", "await import('file:///" + wrapper + "')"], { stdio: "ignore", windowsHide: true });
  const timer = setTimeout(() => { try { child.kill(); } catch (e) {} }, Number(CFG.jobTimeoutSec || 180) * 1000);
  await new Promise((res) => child.on("exit", res));
  clearTimeout(timer);
  let result = null;
  for (let k = 0; k < 12 && !result; k++) { try { result = JSON.parse(await fs.readFile(job.resultPath, "utf8")); } catch (e) { await sleep(300); } }
  if (!result) result = { ok: false, status: "failed", error: "no_result_file" };
  return { shop: store.shop, result, wallSec: Number(((Date.now() - started) / 1000).toFixed(1)) };
}

if (DOCTOR) {
  const rs = [];
  for (let i = 0; i < stores.length; i++) {
    const r = await runOne(stores[i], i, "doctor");
    rs.push(r);
    console.log("DOCTOR " + r.shop + " " + (r.result.status || "?") + " rows=" + (r.result.tableRows === undefined ? "-" : r.result.tableRows) + " date=" + (r.result.dateText || "-") + " wall=" + r.wallSec + "s");
  }
  const ok = rs.every((r) => r.result && r.result.ok);
  console.log("\nDOCTOR_RESULT=" + JSON.stringify({ ok, from, to, stores: rs }, null, 1));
  process.exit(ok ? 0 : 1);
}

const completed = new Array(stores.length);
const queue = stores.map((s, i) => ({ s, i }));
async function pool() {
  while (queue.length) {
    const it = queue.shift();
    const r = await runOne(it.s, it.i);
    completed[it.i] = r;
    const x = r.result || {};
    console.log("DONE " + r.shop + " status=" + (x.status || "?") + " date=" + (x.dateText || "-") + " wall=" + r.wallSec + "s" + (x.error ? " err=" + x.error : ""));
  }
}
await Promise.all(Array.from({ length: Math.min(CONCURRENCY, stores.length) }, () => pool()));

const report = {
  runId: RUN_ID, from, to, periodDir, label,
  createdAt: new Date().toISOString(),
  stores: completed.map((c) => ({
    shop: c.shop,
    status: c.result.status || "failed",
    ok: !!c.result.ok,
    screenshot: c.result.screenshot,
    dateText: c.result.dateText,
    sha256: c.result.sha256,
    bytes: c.result.bytes,
    noData: c.result.noData,
    width: c.result.width,
    height: c.result.height,
    tableRows: c.result.tableRows,
    totals: c.result.totals,
    backup: c.result.backup,
    error: c.result.error,
    needs: c.result.needs,
    wallSec: c.wallSec,
  })),
};
await fs.writeFile(path.join(RUN_DIR, "report.json"), JSON.stringify(report, null, 1), "utf8");
const lines = ["run=" + RUN_ID + " from=" + from + " to=" + to];
for (const s of report.stores) lines.push([s.shop.padEnd(10), s.status.padEnd(9), s.dateText || "-", "wall=" + s.wallSec + "s", s.error || ""].join(" "));
await fs.writeFile(path.join(RUN_DIR, "summary.txt"), lines.join("\n"), "utf8");
console.log("\n" + lines.join("\n"));
console.log("REPORT=" + path.join(RUN_DIR, "report.json"));
if (report.stores.some((s) => s.needs)) process.exit(4);
if (report.stores.some((s) => s.status === "failed")) process.exit(5);
