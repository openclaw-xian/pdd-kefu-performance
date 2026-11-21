---
name: pdd-kefu-performance
description: 拼多多多店铺「客服绩效数据」采集与留档。按店铺 × 期间打开商家后台「客服数据 → 客服绩效数据」，把日期选为用户指定区间（如整月），滚到页面底部截完整表格，存到 <账单根目录>\<店铺>\<期间>\<店铺>-客服绩效-<月>月.png，并生成 客服绩效.md。产物与货款账单、推广花费、订单导出放在同一店铺/期间目录。Use when 用户要截取/留档拼多多客服绩效数据、客服数据报表、按店铺按月归档客服绩效截图。
---

# pdd-kefu-performance — 客服绩效数据截图/留档

> 本 skill 只做 **客服数据 → 客服绩效数据**：选日期 + 底部完整表格截图 + 元数据。
> 不做导出、下载，不做服务数据/销售数据/催付数据/开场白数据。

## 前置条件

- Windows + ego-browser；各店 profile 已登录
- Node.js
- 账单根目录：默认 `D:/pdd-bills`，可配 `root`
- 店铺清单：`<root>/_stores.json` 或 config `shops`（建议显式给）

## 用法

```bash
node <skill目录>/run.mjs <config.json>
```

```json
{
  "from": "2026-10-01",
  "to": "2026-10-31",
  "root": "D:/pdd-bills",
  "concurrency": 3,
  "shops": [
    { "shop": "<店铺A>", "profile": "<profile-A>" }
  ]
}
```

- 日期：`from/to` 都含当天，**不 +1 天**（客服绩效页是日期区间）
- 整月标签：`<M>月`；非整月：`<M月D日-M月D日>`
- 店铺清单也可从 `<root>/_stores.json` 读取；支持 `only`

## 操作步骤

1. 打开商家后台「客服数据」页（`mms-chat/overview/merchant`）
2. 点「客服绩效数据」页签，确认出现「客服绩效详情」
3. 点日期输入，选起止日，点「确认」，回读输入值
4. 关右上角「新消息」弹窗
5. 滚到页面底部，按表格宽高截动态区域（宽 ≥1908、高 ≥944）
6. 写 `<店铺>-客服绩效-<label>.png` + `客服绩效.md`
7. 同数据重复跑会跳过覆盖；不同数据备份旧图

> 页面说明：前一日的客服绩效数据可能需要**今日 10:00 之后**才完全计算完成；刚过 0 点的前一天数据可能不全。

## 输出（与另外三个 skill 同目录）

```
<root>\<店铺>\<期间>\
├─ <店铺>-客服绩效-<月>月.png     # 页面底部完整表格；宽 ≥1908、高 ≥944，账号多更高
├─ 客服绩效.md                     # 期间/日期回读/尺寸/行数/哈希/店铺总计
├─ <店铺>-对账中心-<月>月.csv     # pdd-bills
├─ <店铺>-推广-<月>月.png         # pdd-promo-cost
└─ <店铺>-订单-<月>月.csv         # pdd-order-export
```

## 自检 doctor（只读，不截图）

```json
{ "doctor": true, "from": "2026-10-01", "to": "2026-10-31", "shops": [...] }
```

- 校验店铺、客服绩效页签、日期回读、表格行数
- 不写截图/客服绩效.md；输出 `DOCTOR_RESULT`

## 日期规则

- 打开日期输入（`开始时间 ~ 结束时间`）→ RPR 面板
- 翻月到起止月；同月时起止日都在左表；跨月时起日左、止日右
- 点起始日、结束日 → 点「确认」→ 回读输入 `YYYY-MM-DD ~ YYYY-MM-DD`
- 不一致重试最多 3 次；面板中途关闭会重开
- 结束日就是用户需要的最后一天，**不要自动加一天**
- **平台只保留最近 62 天**（2026-11-21 实测三家店一致：最早可选 **2026-09-20**；`from < 今天-62` 直接预检失败，`date_before_retention`）。更早日期无法选，不要硬选。
- 部分月份要和其他产物放同一个 `YYYY-MM` 目录时，用 `periodDir` + `label` 覆盖（例如 9/20–9/30 → `periodDir:"2026-09"`、`label:"9月20日-9月30日"`）。

## 截图规则

- **先关闭右上角「新消息」弹窗**（`ImportantList_close`），避免挡住表格
- 检测表格实际列宽/高度：宽度 ≥1908，高度 ≥944；账号多时输出更高，保证整表
- 先把页面滚到最底部
- 用 CDP `Page.captureScreenshot` 截动态区域（`captureBeyondViewport:true`），保证最右列和底部「共有 N 条」都在
- CDP 失败才回退 `fullPage`
- 文件命名 `<店铺>-客服绩效-<label>.png`
- 重复跑：日期/店铺总计相同 → 跳过覆盖（`重复截图: 是`）；不同 → 旧图备份 `.bak-<时间>.png`
- **表格 0 行也截图**，`客服绩效.md` 写「数据状态：无数据」；只有表格结构找不到才 `table_not_found`

## 配置字段

| 字段 | 默认 | 说明 |
|---|---|---|
| `from` / `to` | 必填 | `YYYY-MM-DD`，都含当天 |
| `root` | `D:/pdd-bills` | 账单根目录 |
| `shops` | — | `[{shop, profile}]` 或只写 shop |
| `storesConfig` | `<root>/_stores.json` | 清单路径 |
| `only` | — | 只跑指定店铺 |
| `periodDir` | 自动 | 覆盖期间目录（如 `2026-09`） |
| `label` | 自动 | 覆盖文件名标签（如 `9月20日-9月30日`） |
| `concurrency` | 1 | 并行店铺 1–6 |
| `retentionDays` | 62 | 平台保留天数；预检用 |
| `doctor` | false | 只读自检，不截图 |
| `keepOpen` | false | 成功也保留页面 |
| `jobTimeoutSec` | 180 | 单店超时 |
| `ego` / `worker` / `runtimeDir` / `allowC` | 自动 | 同其他 pdd skill |

## 失败条件

- 日期早于保留期 → `date_before_retention`（预检 exit 3，带最早可选日）
- 空间页数 8/8 → 先按 profile 重建空间；仍失败 `page_budget_full`（needs exit 4）
- 店铺名不匹配 → `shop_mismatch`
- 日期回读不一致 → `date_not_applied`
- 表格无数据 → 仍截图 + md 标「无数据」；只有表格结构找不到才 `table_not_found`
- 找不到客服绩效页签 → `performance_tab_not_found`
- 失败自动截图 + `failure-*.json`（URL/tabs/正文）
- 退出码：3 预检 / 4 needs / 5 failed

## 红线

1. 不导出、不下载客服数据
2. 日期不做 +1 天
3. 只截客服绩效数据，不切其他页签
4. 截图必须包含底部行和「共有 N 条」
5. 产物必须落在 `<店铺>/<期间>`，和其他三个 skill 同目录
