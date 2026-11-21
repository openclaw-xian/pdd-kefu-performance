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
    try {
      page = await newPageSafe();
    } catch (e) {
      if (!/page_budget_full/.test(String(e.message || e))) throw e;
      log("page_budget_recreate_space");
      try { await task.finish({ keep: [] }); } catch (e2) {}
      task = null; page = null;
      const shop = await createSpaceForProfile(JOB.profile);
      if (!shop) throw e;
    }
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

async function dismissNotifications() {
  for (let i = 0; i < 3; i++) {
    const close = await page.evaluate(() => {
      const vis = (e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
      const cls = (e) => String(e.className && e.className.baseVal !== undefined ? e.className.baseVal : (e.className || ""));
      const el = [...document.querySelectorAll("i,span,div,button,s")].filter((e) => vis(e) && /ImportantList_close/.test(cls(e)))[0];
      if (!el) return null;
      const b = el.getBoundingClientRect();
      return { x: Math.round(b.x + b.width / 2), y: Math.round(b.y + b.height / 2) };
    }).catch(() => null);
    if (!close) return false;
    log("dismiss_notification");
    await page.mouse.click(close.x, close.y, { label: "close notification" });
    await page.waitForTimeout(500);
  }
  return true;
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
    for (const e of document.querySelectorAll("i,svg")) {
      if (!vis(e) || !/RPR_iconPrevNext/.test(cls(e))) continue;
      const b = e.getBoundingClientRect();
      const right = /RPR_right|ICN_type-right/.test(cls(e));
      const it = { x: Math.round(b.x + b.width / 2), y: Math.round(b.y + b.height / 2), right };
      (right ? next : prev).push(it);
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
    log("date_headers", JSON.stringify(await header()));
    const sc = await cellRect(0, startDay);
    if (!sc) {
      const first = await page.evaluate(() => {
        const vis = (e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
        const cls = (e) => String(e.className && e.className.baseVal !== undefined ? e.className.baseVal : (e.className || ""));
        const wrap = [...document.querySelectorAll("div")].filter(vis).find((e) => /RPR_outerPickerWrapper/.test(cls(e)));
        if (!wrap) return "";
        const table = [...wrap.querySelectorAll("[class*='RPR_tableWrapper']")][0];
        const days = [...table.querySelectorAll("[class*='RPR_cell']")].filter((e) => vis(e) && !/RPR_disabled|RPR_outOfMonth/.test(cls(e))).map((e) => (e.innerText || "").trim()).filter((x) => /^\d+$/.test(x));
        return days.length ? days[0] : "";
      });
      throw new Error("start_date_unavailable:" + JOB.from + (first ? " 最早可选=" + first : ""));
    }
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

async function tableInfo() {
  return page.evaluate(() => {
    const vis = (e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
    const txt = (e) => (e ? (e.innerText || "").replace(/\s+/g, " ").trim() : "");
    const tables = [...document.querySelectorAll("table")].filter(vis);
    let table = tables.find((t) => (t.innerText || "").includes("客服账号"));
    if (!table && tables.length) table = tables.sort((a, b) => b.getBoundingClientRect().width - a.getBoundingClientRect().width)[0];
    if (!table) {
      const el = [...document.querySelectorAll("div")].filter(vis).find((e) => txt(e).includes("客服账号") && txt(e).includes("店铺总计"));
      if (!el) return null;
      table = el;
    }
    const r = table.getBoundingClientRect();
    const sc = document.scrollingElement || document.documentElement;
    const allRows = [...table.querySelectorAll("tr")].filter(vis);
    let headerCells = [...table.querySelectorAll("thead th, thead td")].map((e) => txt(e));
    let dataRows;
    if (headerCells.length && headerCells.some((h) => h.includes("客服账号"))) {
      dataRows = allRows.slice(1).map((tr) => [...tr.querySelectorAll("td")].map((td) => txt(td)));
    } else {
      const firstCells = allRows.length ? [...allRows[0].querySelectorAll("td,th")].map((e) => txt(e)) : [];
      headerCells = firstCells;
      dataRows = allRows.slice(1).map((tr) => [...tr.querySelectorAll("td")].map((td) => txt(td)));
    }
    const first = dataRows[0] || [];
    const totals = {};
    headerCells.forEach((h, i) => { if (i < first.length) totals[h] = first[i]; });
    return {
      headers: headerCells,
      rowCount: dataRows.length,
      totals,
      tableRight: Math.round(r.right + sc.scrollLeft),
      tableTop: Math.round(r.top + sc.scrollTop),
      tableHeight: Math.round(r.height),
      docWidth: Math.round(Math.max(sc.scrollWidth, document.documentElement.scrollWidth)),
      docHeight: Math.round(Math.max(sc.scrollHeight, document.documentElement.scrollHeight)),
      scrollY: Math.round(sc.scrollTop),
    };
  });
}

async function priorDataMatches(dateText, totals) {
  try {
    const md = await fs.readFile(PERIOD_DIR + "/客服绩效.md", "utf8");
    const m = md.match(/\| 日期回读 \| ([^|]+) \|/);
    if (!m || m[1].trim() !== dateText) return false;
    for (const [k, v] of Object.entries(totals || {})) {
      if (!md.includes("- " + k + ": " + v)) return false;
    }
    return true;
  } catch (e) { return false; }
}

async function captureBottom(dateText) {
  await fs.mkdir(PERIOD_DIR, { recursive: true }).catch(() => {});
  // 检测表格实际宽/高；0 行也截图，md 标记无数据
  await dismissNotifications();
  const info = await tableInfo();
  if (!info) throw new Error("table_not_found:客服绩效表格未找到");
  const noData = info.rowCount === 0;
  await page.evaluate(() => {
    const sc = document.scrollingElement || document.documentElement;
    sc.scrollTop = sc.scrollHeight;
  });
  await page.waitForTimeout(600);
  const width = Math.max(1908, info.tableRight + 24, info.docWidth);
  const y = Math.max(0, info.tableTop - 120);
  const height = Math.max(944, info.tableHeight + 220);
  const tmp = PERIOD_DIR + "/." + JOB.pngName + ".tmp-" + Date.now() + ".png";
  let data = null;
  try {
    const res = await page.cdp("Page.captureScreenshot", {
      format: "png",
      captureBeyondViewport: true,
      clip: { x: 0, y, width, height, scale: 1 },
    });
    data = typeof res === "string" ? res : (res.data || res.result?.data);
  } catch (e) { log("cdp_screenshot_failed", String((e && e.message) || e)); }
  if (data) await fs.writeFile(tmp, Buffer.from(data, "base64"));
  else await page.screenshot({ path: tmp, fullPage: true });
  const crypto = await import("node:crypto");
  const sha = crypto.createHash("sha256").update(await fs.readFile(tmp)).digest("hex");
  const target = PERIOD_DIR + "/" + JOB.pngName;
  let backup = null;
  let existingSame = false;
  try {
    const old = await fs.readFile(target);
    const oldSha = crypto.createHash("sha256").update(old).digest("hex");
    existingSame = oldSha === sha;
  } catch (e) {}
  if (!existingSame && await priorDataMatches(dateText, info.totals)) existingSame = true;
  if (existingSame) {
    await fs.unlink(tmp).catch(() => {});
  } else {
    try { await fs.access(target); backup = target.replace(/\.png$/i, ".bak-" + new Date().toISOString().replace(/[-:T]/g, "").slice(4, 14) + ".png"); await fs.rename(target, backup); } catch (e) {}
    await fs.rename(tmp, target);
  }
  return { png: target, sha, bytes: (await fs.stat(target)).size, width, height, tableRows: info.rowCount, totals: info.totals, noData, backup, existingSame };
}

async function writeInfo(cap, dateText) {
  const raw = await fs.readFile(cap.png);
  const lines = [
    "# 客服绩效 · " + JOB.shop + " · " + JOB.label,
    "",
    "| 项 | 值 |",
    "|---|---|",
    "| 店铺 | " + JOB.shop + " |",
    "| 期间 | " + JOB.from + " ~ " + JOB.to + " |",
    "| 日期回读 | " + dateText + " |",
    "| 截图 | `" + path.basename(cap.png) + "` |",
    "| 尺寸 | " + cap.width + "×" + cap.height + "（页面底部完整表格） |",
    "| 表格行数 | " + cap.tableRows + " |",
    "| 数据状态 | " + (cap.noData ? "无数据（0 行，仍保留空表截图）" : "有数据") + " |",
    "| 文件大小 | " + raw.length + " 字节 |",
    "| SHA-256 | " + cap.sha + " |",
    "| 重复截图 | " + (cap.existingSame ? "是（已跳过覆盖）" : "否") + " |",
  ];
  if (cap.backup) lines.push("| 旧图备份 | `" + path.basename(cap.backup) + "` |");
  lines.push("| 来源 | 客服数据 → 客服绩效数据 |", "| 采集时间 | " + localStamp() + " |");
  if (cap.totals && Object.keys(cap.totals).length) {
    lines.push("", "## 店铺总计", ...Object.entries(cap.totals).map(([k, v]) => "- " + k + ": " + v));
  }
  if (cap.noData) lines.push("", "## 数据状态", "- 无数据：该期间客服绩效表格 0 行，已保留空表截图。");
  await fs.writeFile(PERIOD_DIR + "/客服绩效.md", lines.join("\n"), "utf8");
  return { sha: cap.sha, bytes: raw.length };
}

async function saveFailureEvidence(msg) {
  if (!page || !JOB.logPath) return null;
  const dir = path.dirname(JOB.logPath);
  const stamp = new Date().toISOString().replace(/[-:T]/g, "").slice(0, 14);
  const base = path.join(dir, JOB.shop + "-failure-" + stamp);
  const out = { error: msg, at: localStamp(), url: "", body: "", tabs: [] };
  try { out.url = await page.evaluate(() => location.href); } catch (e) {}
  try { out.body = await page.evaluate(() => (document.body.innerText || "").replace(/\s+/g, " ").slice(0, 1200)); } catch (e) {}
  try { if (task) out.tabs = (await task.tabs()).map((t) => String(t.url || "").slice(0, 120)); } catch (e) {}
  try { await page.screenshot({ path: base + ".png" }); out.screenshot = base + ".png"; } catch (e) {}
  await fs.writeFile(base + ".json", JSON.stringify(out, null, 1), "utf8").catch(() => {});
  return base + ".png";
}

async function doctor() {
  await openShopSpace();
  await dismissNotifications();
  await openPerformanceTab();
  await dismissNotifications();
  const dateText = await setDateRange();
  const info = await tableInfo();
  if (!info) throw new Error("table_not_found:客服绩效表格未找到");
  return { status: "doctor_ok", dateText, tableRows: info.rowCount, totals: info.totals, noData: info.rowCount === 0 };
}

async function main() {
  await openShopSpace();
  await dismissNotifications();
  await openPerformanceTab();
  await dismissNotifications();
  const dateText = await setDateRange();
  await dismissNotifications();
  const cap = await captureBottom(dateText);
  const meta = await writeInfo(cap, dateText);
  return {
    status: "done", orders: null, screenshot: cap.png, dateText,
    sha256: meta.sha, bytes: meta.bytes, width: cap.width, height: cap.height,
    tableRows: cap.tableRows, totals: cap.totals, noData: cap.noData, backup: cap.backup, existingSame: cap.existingSame,
  };
}

let result;
try {
  result = JOB.mode === "doctor" ? await doctor() : await main();
  await writeResult({ ok: true, ...result });
} catch (e) {
  const msg = String((e && e.message) || e);
  log("ERROR", msg);
  const evidence = await saveFailureEvidence(msg);
  result = { status: "failed", error: msg, evidence };
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
