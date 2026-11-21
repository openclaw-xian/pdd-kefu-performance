// worker-kefu.mjs — 单店「客服绩效数据」日期选择 + 底部截图
const fs = await import("node:fs/promises");
const path = await import("node:path");

const JOB = globalThis.__JOB || {};
const t0 = Date.now();
const logs = [];
const log = (...a) => {
  const line = "[t=" + ((Date.now() - t0) / 1000).toFixed(1) + "s] " + a.map((x) => (typeof x === "string" ? x : JSON.stringify(x))).join(" ");
  logs.push(line); console.log(line);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ROOT = (JOB.root || "D:/pdd-bills").replace(/\\/g, "/").replace(/\/$/, "");
const PERIOD_DIR = ROOT + "/" + JOB.shop + "/" + JOB.periodDir;
let task = null;
let page = null;

const pad = (n) => String(n).padStart(2, "0");
function localStamp() {
  const d = new Date(Date.now() + 8 * 3600 * 1000);
  return d.toISOString().replace("T", " ").slice(0, 19) + " +08:00";
}
function monthNum(t) {
  const m = (t || "").match(/(\d{1,2})月/);
  return m ? Number(m[1]) : null;
}

async function writeResult(obj) {
  const out = { ...obj, shop: JOB.shop, from: JOB.from, to: JOB.to, elapsedSec: Number(((Date.now() - t0) / 1000).toFixed(1)) };
  if (JOB.resultPath) await fs.writeFile(JOB.resultPath, JSON.stringify(out, null, 1), "utf8").catch(() => {});
  if (JOB.logPath) await fs.writeFile(JOB.logPath, logs.join("\n"), "utf8").catch(() => {});
  return out;
}

async function newPageSafe() {
  const tabs = await task.tabs().catch(() => []);
  if (tabs.length >= 8) throw new Error("page_budget_full:请关闭多余标签页（当前 " + tabs.length + "/8）");
  return task.newPage();
}

async function readShopName() {
  return page.evaluate(() => {
    const vis = (e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
    const el = [...document.querySelectorAll(".user-name-text, .user-name-name")].find(vis);
    return el ? (el.innerText || "").trim() : "";
  }).catch(() => "");
}

async function createSpaceForProfile(profileName) {
  const ps = await profiles();
  const p = ps.find((x) => String(x.name || "") === String(profileName || ""));
  if (!p) return null;
  task = await taskSpace("pdd-kefu-" + profileName + "-" + Date.now(), { profileId: p.id });
  page = await newPageSafe();
  await page.goto("https://mms.pinduoduo.com/mms-chat/overview/merchant", { timeout: 60000 });
  await page.waitForLoadState("load", { timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(1200);
  return readShopName();
}

async function openShopSpace() {
  const spaces = await listTaskSpaces();
  let entry = spaces.find((s) => String(s.profileName || "") === String(JOB.profile || ""));
  if (!entry && JOB.shop) entry = spaces.find((s) => String(s.name || "") === JOB.shop);
  if (entry) {
    task = entry.ownership === "user" ? await claimTaskSpace(entry.id)
      : entry.ownership === "agentDelegatedToUser" ? await takeOverTaskSpace(entry.id)
      : await taskSpace(entry.id);
    page = await newPageSafe();
  } else {
    const shop = await createSpaceForProfile(JOB.profile);
    if (!shop) throw new Error("space_not_found_for:" + (JOB.profile || JOB.shop));
  }
  await page.goto("https://mms.pinduoduo.com/mms-chat/overview/merchant", { timeout: 60000 });
  await page.waitForLoadState("load", { timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(1200);
  const shop = await readShopName();
  log("shop", JOB.shop + " / actual=" + shop);
  if (shop && shop !== JOB.shop) throw new Error("shop_mismatch:" + shop + " expected=" + JOB.shop);
  return shop;
}

async function openPerformanceTab() {
  const hit = await page.evaluate(() => {
    const vis = (e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
    const txt = (e) => (e ? (e.innerText || "").trim() : "");
    const t = [...document.querySelectorAll("div,span,a,li")].filter((e) => vis(e) && txt(e) === "客服绩效数据");
    if (!t.length) return null;
    const el = t.sort((a, b) => a.getBoundingClientRect().y - b.getBoundingClientRect().y)[0];
    const b = el.getBoundingClientRect();
    return { x: Math.round(b.x + b.width / 2), y: Math.round(b.y + b.height / 2) };
  });
  if (!hit) throw new Error("performance_tab_not_found");
  await page.mouse.click(hit.x, hit.y, { label: "open performance tab" });
  await page.waitForTimeout(1200);
  const ok = await page.evaluate(() => (document.body.innerText || "").includes("客服绩效详情"));
  if (!ok) throw new Error("performance_tab_not_active");
}

async function hasPanel() {
  return page.evaluate(() => {
    const vis = (e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
    return [...document.querySelectorAll("div")].some((e) => vis(e) && /RPR_outerPickerWrapper/.test(String(e.className)));
  });
}

async function openPanel() {
  const dt = await page.evaluate(() => {
    const vis = (e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
    const i = [...document.querySelectorAll("input")].filter(vis).find((e) => (e.value || "").includes("~") || /开始时间/.test(e.placeholder || ""));
    if (!i) return null;
    const b = i.getBoundingClientRect();
    return { x: Math.round(b.x + b.width / 2), y: Math.round(b.y + b.height / 2) };
  });
  if (!dt) throw new Error("date_input_not_found");
  let ok = false;
  for (let i = 0; i < 6 && !ok; i++) {
    await page.mouse.click(dt.x, dt.y, { label: "open date picker" });
    await page.waitForTimeout(500);
    ok = await hasPanel();
  }
  return ok;
}

async function header() {
  return page.evaluate(() => {
    const vis = (e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
    const wrap = [...document.querySelectorAll("div")].filter(vis).find((e) => /RPR_outerPickerWrapper/.test(String(e.className)));
    if (!wrap) return [];
    return [...wrap.querySelectorAll("[class*='RPR_headerSelector']")].filter(vis).map((e) => (e.innerText || "").trim());
  });
}

async function arrows() {
  return page.evaluate(() => {
    const vis = (e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
    const cls = (e) => String(e.className && e.className.baseVal !== undefined ? e.className.baseVal : (e.className || ""));
    const prev = [], next = [];
    for (const e of document.querySelectorAll("svg")) {
      if (!vis(e) || !/RPR_iconPrevNext/.test(cls(e))) continue;
      const b = e.getBoundingClientRect();
      const it = { x: Math.round(b.x), y: Math.round(b.y + b.height / 2), right: /RPR_right/.test(cls(e)) };
      (it.right ? next : prev).push(it);
    }
    prev.sort((a, b) => a.x - b.x); next.sort((a, b) => a.x - b.x);
    return { prev, next };
  });
}

async function setPanel(side, target) {
  for (let step = 0; step < 24; step++) {
    let s = { open: await hasPanel(), headers: await header() };
    if (!s.open) { if (!(await openPanel())) throw new Error("panel_lost"); await sleep(400); s = { open: true, headers: await header() }; }
    if (s.headers.length < 2) { await sleep(400); continue; }
    const idx = side === "left" ? 0 : 1;
    const cur = monthNum(s.headers[idx]);
    if (cur === null) { await sleep(400); continue; }
    if (cur === target) return s;
    const a = await arrows();
    const c = side === "left" ? (cur < target ? a.next[0] : a.prev[0]) : (cur < target ? a.next[1] : a.prev[1]);
    if (!c) { await sleep(400); continue; }
    await page.mouse.click(c.x, c.y);
    await page.waitForTimeout(500);
  }
  throw new Error("month_switch_failed");
}

async function cellRect(tableIndex, day) {
  return page.evaluate(({ ti, d }) => {
    const vis = (e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
    const cls = (e) => String(e.className && e.className.baseVal !== undefined ? e.className.baseVal : (e.className || ""));
    const wrap = [...document.querySelectorAll("div")].filter(vis).find((e) => /RPR_outerPickerWrapper/.test(String(e.className)));
    if (!wrap) return null;
    const table = [...wrap.querySelectorAll("[class*='RPR_tableWrapper']")][ti];
    if (!table) return null;
    const cells = [...table.querySelectorAll("[class*='RPR_cell']")].filter((e) => vis(e) && (e.innerText || "").trim() === d && !/RPR_outOfMonth|RPR_disabled/.test(cls(e)));
    if (!cells.length) return null;
    const b = cells[0].getBoundingClientRect();
    return { x: Math.round(b.x + b.width / 2), y: Math.round(b.y + b.height / 2) };
  }, { ti: tableIndex, d: String(day) });
}

async function clickText(text) {
  const r = await page.evaluate((t) => {
    const vis = (e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && !e.disabled; };
    const txt = (e) => (e ? (e.innerText || "").trim() : "");
    const e = [...document.querySelectorAll("button,span,div,a")].filter((x) => vis(x) && txt(x) === t).sort((a, b) => b.getBoundingClientRect().y - a.getBoundingClientRect().y)[0];
    if (!e) return null;
    const b = e.getBoundingClientRect();
    return { x: Math.round(b.x + b.width / 2), y: Math.round(b.y + b.height / 2) };
  }, text);
  if (r) { await page.mouse.click(r.x, r.y); return true; }
  return false;
}

async function setDateRange() {
  const startMonth = Number(JOB.from.slice(5, 7));
  const startDay = Number(JOB.from.slice(8, 10));
  const endMonth = Number(JOB.to.slice(5, 7));
  const endDay = Number(JOB.to.slice(8, 10));
  const expected = JOB.from + " ~ " + JOB.to;
  for (let attempt = 1; attempt <= 3; attempt++) {
    if (!(await openPanel())) throw new Error("date_panel_not_open");
    await setPanel("left", startMonth);
    if (endMonth !== startMonth) await setPanel("right", endMonth);
    const sc = await cellRect(0, startDay);
    if (!sc) throw new Error("start_cell_not_found:" + startDay);
    await page.mouse.click(sc.x, sc.y);
    await page.waitForTimeout(350);
    const ec = await cellRect(endMonth === startMonth ? 0 : 1, endDay);
    if (!ec) throw new Error("end_cell_not_found:" + endDay);
    await page.mouse.click(ec.x, ec.y);
    await page.waitForTimeout(350);
    if (!(await hasPanel())) { if (!(await openPanel())) continue; }
    await clickText("确认");
    await page.waitForTimeout(800);
    const actual = await page.evaluate(() => {
      const vis = (e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
      const i = [...document.querySelectorAll("input")].filter(vis).find((e) => (e.value || "").includes("~"));
      return i ? i.value : "";
    });
    log("date_actual", actual);
    if (actual === expected) return actual;
    await page.waitForTimeout(1000);
  }
  throw new Error("date_not_applied:" + expected);
}

async function captureBottom() {
  await fs.mkdir(PERIOD_DIR, { recursive: true }).catch(() => {});
  await page.evaluate(() => {
    const sc = document.scrollingElement || document.documentElement;
    sc.scrollTop = sc.scrollHeight;
  });
  await page.waitForTimeout(600);
  const y = await page.evaluate(() => (document.scrollingElement || document.documentElement).scrollTop);
  const png = PERIOD_DIR + "/" + JOB.pngName;
  let data = null;
  try {
    const res = await page.cdp("Page.captureScreenshot", {
      format: "png",
      captureBeyondViewport: true,
      clip: { x: 0, y, width: 1908, height: 944, scale: 1 },
    });
    data = typeof res === "string" ? res : (res.data || res.result?.data);
  } catch (e) { log("cdp_screenshot_failed", String((e && e.message) || e)); }
  if (data) await fs.writeFile(png, Buffer.from(data, "base64"));
  else await page.screenshot({ path: png, fullPage: true });
  return png;
}

async function writeInfo(png, dateText) {
  const raw = await fs.readFile(png);
  const crypto = await import("node:crypto");
  const sha = crypto.createHash("sha256").update(raw).digest("hex");
  const md = [
    "# 客服绩效 · " + JOB.shop + " · " + JOB.label,
    "",
    "| 项 | 值 |",
    "|---|---|",
    "| 店铺 | " + JOB.shop + " |",
    "| 期间 | " + JOB.from + " ~ " + JOB.to + " |",
    "| 日期回读 | " + dateText + " |",
    "| 截图 | `" + JOB.pngName + "` |",
    "| 尺寸 | 1908×944（页面底部） |",
    "| 文件大小 | " + raw.length + " 字节 |",
    "| SHA-256 | " + sha + " |",
    "| 来源 | 客服数据 → 客服绩效数据 |",
    "| 采集时间 | " + localStamp() + " |",
  ].join("\n");
  await fs.writeFile(PERIOD_DIR + "/客服绩效.md", md, "utf8");
  return { sha, bytes: raw.length };
}

async function main() {
  await openShopSpace();
  await openPerformanceTab();
  const dateText = await setDateRange();
  const png = await captureBottom();
  const meta = await writeInfo(png, dateText);
  return { status: "done", orders: null, screenshot: png, dateText, sha256: meta.sha, bytes: meta.bytes };
}

let result;
try {
  result = await main();
  await writeResult({ ok: true, ...result });
} catch (e) {
  const msg = String((e && e.message) || e);
  log("ERROR", msg);
  result = { status: "failed", error: msg };
  if (msg.includes("page_budget_full")) {
    result.needs = { code: "page_budget_full", question: "空间标签页已满，请关闭多余标签页后重跑。" };
  }
  await writeResult({ ok: false, ...result });
} finally {
  const keep = JOB.keepOpen === true || (result && result.status === "failed");
  if (task && keep) console.log("PAGE_LEFT_OPEN=1");
  else { try { if (task) await task.finish({ keep: [] }); } catch (e) {} }
}
console.log("WORKER_RESULT=" + JSON.stringify({ shop: JOB.shop, status: result && result.status, dateText: result && result.dateText }));
