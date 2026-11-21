# 实现说明（pdd-kefu-performance）

## 结构

```
run.mjs           普通 Node 调度器：预检 → 逐店（可并发）spawn worker → 汇总
worker-kefu.mjs   ego 内：找店 → 客服绩效页签 → 选日期 → 滚到底 → 宽截图 → 客服绩效.md
```

## 调度器

1. 读 `from/to/root/shops|_stores.json/concurrency`
2. 预检日期/根目录/ego/店铺清单；**from < 今天-62 天 → `date_before_retention`**（三家店实测最早 9/20）；问题 → `PREFLIGHT`，exit 3
3. 期间目录：整月 `YYYY-MM`，区间 `from_to`
4. 标签：整月 `<M>月`；区间 `<M月D日-M月D日>`
5. 并行 `concurrency`（1–6）跑店；每店一个 worker 进程
6. 汇总 `report.json` / `summary.txt`；needs → exit 4，failed → exit 5

## worker

1. **找店**：按 profile 找已有 space；没有则 `profiles()` + profileId 建新 space；打开客服数据页；读 `.user-name-text` 校验店铺名
2. **切页签**：点 `客服绩效数据`，校验正文含 `客服绩效详情`
3. **日期**：
   - 打开 RPR；`setPanel` 翻月（箭头会关面板 → 重开回读）
   - 点起日/止日 → `确认` → 回读 `YYYY-MM-DD ~ YYYY-MM-DD`
   - 最多 3 次；面板中途关闭会重开
4. **截图**：
   - 检测表格实际宽高（宽度 ≥1908、高度 ≥944；账号多时更高）
   - 0 行也截图，md 标记「数据状态：无数据」；表格结构找不到才失败
   - 滚到底；CDP `Page.captureScreenshot` + `captureBeyondViewport` 动态裁剪
   - 同日期/同店铺总计 → 跳过覆盖（`重复截图=是`）；不同 → 旧图 `.bak-<时间>.png`
   - 失败回退 fullPage
5. **元数据**：`客服绩效.md`（期间/日期回读/尺寸/行数/文件/哈希/重复截图/旧图备份 + **店铺总计**）
6. 成功 `finish({keep:[]})`；失败保留页面 + `failure-*.png/json`

## doctor（只读）

- `doctor:true`：打开页/页签/日期回读/表格行数校验；不截图、不写 md。
- 退出码：通过 0，失败 1。

## 维护点

| 变的东西 | 改哪里 |
|---|---|
| 页面 URL | `worker-kefu.mjs` 的 `mms-chat/overview/merchant` |
| 页签文本 | `openPerformanceTab` |
| 日期输入/选择器 | `openPanel/header/arrows/setPanel/cellRect` |
| 确认按钮 | `clickText("确认")` |
| 截图尺寸/裁剪 | `captureBottom` 的动态宽高（≥1908×944，账号多更高） |
| 输出命名 | runner 的 `pngName` |
