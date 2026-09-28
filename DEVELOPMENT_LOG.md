# 分阶段执行记录

依据 [`DEVELOPMENT_PLAN.md`](DEVELOPMENT_PLAN.md) 顺序实现。每阶段完成后通过对应测试，再继续下一阶段；阶段 7 最后运行全量测试。交付后追加的阶段 8～12 沿用同一方式。

| 阶段 | 实现与演示路线 | 阶段测试 | 尚需用户在自己电脑操作 |
| --- | --- | --- | --- |
| 0 规则 | `RULES.md` 定稿金币、零点、跨模块和导入规则 | `tests/stage0.rules.test.mjs` | 无 |
| 1 骨架与启动 | 模块导航，离线静态文件本机服务，Windows 双击启动 | `tests/stage1.*.test.mjs` | 首次双击启动脚本确认浏览器弹出 |
| 2 本地数据 | IndexedDB、存储状态、备忘与风格持久化、跨标签通知 | `tests/stage2.persistence.test.mjs` | 无 |
| 3 任务与计时 | 一次性和重复任务、编辑／取消、日期查看、计时重开恢复 | `tests/stage3.tasks.test.mjs` | 无 |
| 4 金币 | 事务打卡、到期补算、零点截断、流水与兑换 | `tests/stage4.coins.test.mjs` | 无 |
| 5 生活记录 | 餐次费用、娱乐实际分钟、打球训练记录与汇总 | `tests/stage5.life.test.mjs` | 无 |
| 6 总览与备份 | 首页真实摘要、累计统计、完整备份和整体恢复 | `tests/stage6.backup.test.mjs` | 建议保留一份自己的 JSON 备份 |
| 7 验收交付 | 边界日期、真实浏览器跨零点、重复规则调整、说明文档 | `tests/stage7.boundaries.test.mjs` 和全量测试 | 电脑物理重启后的手工路线需用户按下文完成 |
| 8 首页职责收敛 | 余额只在顶部显示一次，首页不再重复展示 | `tests/stage8.overview.test.mjs` | 无 |
| 9 备忘录 | 新增按日期保存／查看的备忘录页面并进入顶部导航 | `tests/stage9.memo.test.mjs` | 无 |
| 10 月历选日 | 今日计划、饮食、娱乐、羽毛球改用月历选择日期 | `tests/stage10.calendar.test.mjs` | 无 |
| 11 品牌更名 | 应用更名为「闹之钟」，标题、品牌区与说明同步 | `tests/stage11.brand.test.mjs` | 无 |
| 12 壁纸 | 导航右侧弹窗导入壁纸、调整不透明度、清除，覆盖全部页面 | `tests/stage12.wallpaper.test.mjs` | 无 |
| 首页排版 | 左侧今日计划不动，右侧 2×2 四张卡片一起缩小、间距拉大到 48px，外沿仍与左侧齐平 | `tests/stage15.home-cards.test.mjs` | 无 |
| 首页配色 | 游戏娱乐卡片标题／正文／入口文字统一为插画同色系靛蓝 `--fun-ink`，替换原近黑与白色 | `tests/stage15.home-cards.test.mjs` | 无 |
| 运动卡片 | 运动健康卡片文字整体上移 10px（桌面 92→82px，窄屏 82→80px），避开蓝天落在草坡 | `tests/stage15.home-cards.test.mjs` | 无 |
| 右列右移 | 右侧 2×2 组合整体右移 8px（左列 `calc()` 收窄 8px、右列相应变宽），版心与右外沿不变 | `tests/stage15.home-cards.test.mjs` | 无 |
| 等高修复 | 右列改用 `.home-col-side` 网格行拉伸，去掉 `height:100%` 百分比链，两侧重新等高 | `tests/stage15.home-cards.test.mjs` | 无 |
| 测试稳定性 | stage7 去除子进程 ANSI 颜色码干扰；stage1 端口被占用时给出明确提示 | 全量测试 | 无 |
| 对齐断言 | stage15 间距改从实际渲染位置量取（页面有 zoom，CSS 值与 rect 像素不同尺度） | `tests/stage15.home-cards.test.mjs` | 无 |
| 列位断言 | stage15 区分左右列：memo/fun 在左列，只有 food/ball 与版心右缘齐平 | `tests/stage15.home-cards.test.mjs` | 无 |
| 运动文字对比 | 运动健康白字压在插画上最亮处仅约 1.1:1，改为多层深色阴影压暗底，并加测试守住 | `tests/stage15.home-cards.test.mjs` | 无 |

手工路线：建计划 → 开始并暂停计时 → 部分打卡 → 留一个任务跨零点 → 关闭浏览器并重启电脑 → 从固定地址打开，核对补算和余额 → 通过足够金币兑换风格 → 导入一张壁纸并调整不透明度 → 在备忘录按日期保存一条内容 → 导出备份 → 恢复并核对备忘、任务、生活记录、壁纸与流水。自动测试已覆盖浏览器关闭重开、时钟跨零点、壁纸导入清除和备份恢复；程序无法自动替用户重启这台电脑。

阶段 8～12 完成后已重新运行全量测试：25 项全部通过；`npm.cmd run build` 通过类型检查并成功构建。
