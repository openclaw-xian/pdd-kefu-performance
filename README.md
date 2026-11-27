# pdd-kefu-performance

拼多多多店铺「客服绩效数据」截图留档——DeepSeek Harness (DSH) skill。

按店铺 × 期间打开「客服数据 → 客服绩效数据」，日期选用户指定区间（起止都含当天），滚到页面底部截完整表格（宽 ≥1908、高 ≥944，账号多时更高），存到 `<账单根目录>/<店铺>/<期间>/<店铺>-客服绩效-<月>月.png`，并生成 `客服绩效.md`。产物与 pdd-bills / pdd-promo-cost / pdd-order-export 放在同一目录。

## 安装

复制/联接到 `~/.agents/skills/pdd-kefu-performance`。

## 前置

- Windows + ego-browser（各店 profile 已登录）
- Node.js
- 账单根目录（默认 `<记账根目录>`，可配 `root`）
- 店铺清单：config `shops` 或 `<root>/_stores.json`

## 用法

```bash
node run.mjs kefu-config.json
```

```json
{
  "from": "2026-10-01",
  "to": "2026-10-31",
  "root": "<记账根目录>",
  "concurrency": 3,
  "shops": [{ "shop": "<店铺A>", "profile": "<profile-A>" }]
}
```

## 输出

```
<root>/<店铺>/<期间>/
├─ <店铺>-客服绩效-<月>月.png
└─ 客服绩效.md
```

日期不做 +1 天；平台只保留最近 **62 天**（更早日期预检失败）。支持 `doctor` 只读自检；部分月份可用 `periodDir`/`label` 落到同一个月目录。只截客服绩效，不导出/不下载。详细见 [SKILL.md](SKILL.md)。
