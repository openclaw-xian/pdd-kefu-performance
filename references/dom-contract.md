# DOM 契约（客服绩效数据）

## 页面

- 入口 URL：`https://mms.pinduoduo.com/mms-chat/overview/merchant`
- 标题：`客服数据`
- 店铺名：`.user-name-text` / `.user-name-name`
- 页签：服务数据 / 销售数据 / **客服绩效数据** / 催付数据 / 开场白数据

## 切换页签

- 页签文本：`客服绩效数据`
- 切成功后正文出现 `客服绩效详情`
- 不切换的话默认在「服务数据」

## 日期控件

- 输入：`input[placeholder="开始时间  ~  结束时间"]`（只读，RPR）
- 当前值格式：`YYYY-MM-DD ~ YYYY-MM-DD`
- 打开：真实鼠标点输入框；检测 `div[class*='RPR_outerPickerWrapper']`
- 快捷项：近1天 / 近7天 / 近30天
- 双月：`RPR_headerSelector`（如 `10月` `11月`）
- 箭头：`svg[class*='RPR_iconPrevNext']`（`RPR_right` 右）
- 日期格：`div[class*='RPR_cell']`；排除 `RPR_outOfMonth` / `RPR_disabled`
- 同月：起止日都在左表；跨月：起日左、止日右
- 确认：文本 `确认`；点后输入回读，面板关闭、数据刷新

## 日期语义

- 客服绩效页是**日期区间**，起止都含当天
- 目标 10 月：`2026-10-01 ~ 2026-10-31`，不要 +1 天
- **平台只保留最近 62 天**：2026-11-21 实测最早可选 9/20；9/1–9/19 的格子带 `RPR_disabled`，点不动
- 选不到起始日时应报 `start_date_unavailable`，不要静默改日期

## 通知弹窗

- 右上角可能出现 `新消息 (N)` 卡片，容器 `ImportantList_msgbox__...`
- 关闭：`i[class*='ImportantList_close']`（约 32×32），鼠标点中心
- 位置可能盖住表格右侧；截图前必须关闭

## 截图

- 先滚到 `document.scrollingElement.scrollTop = scrollHeight`
- CDP `Page.captureScreenshot`：
  - `captureBeyondViewport: true`
  - `clip: { x:0, y:scrollY, width:1908, height:944, scale:1 }`
- 截图应包含：
  - 最右列（评分≤3订单数）
  - 底部最后一行
  - 右下「共有 N 条」
- CDP 失败再 `page.screenshot({ fullPage:true })`
