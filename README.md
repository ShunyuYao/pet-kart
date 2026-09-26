# 桌宠赛车 · Pet Kart

一个单文件 HTML 的 3D 卡丁车游戏，给「吐梨邦」桌宠的 HTML 作品能力做的。在桌宠里打开会自动带入你当前的桌宠形象当车手；通过桌宠「发送并一起玩」可以和同一局域网的朋友对战。

A single-file HTML 3D kart racer for the 吐梨邦 desktop pet. Opened inside the pet it races your current pet; "send and play together" gives a two-player LAN match.

交付文件：[`dist/桌宠赛车.html`](dist/桌宠赛车.html)（约 720 KB，three.js 与全部代码内联，无 CDN、无服务器）。

## 玩法

- 每场 3 辆车，3 圈：单人是你 + 2 个电脑；双人是 2 位玩家 + 1 个电脑（由房主模拟）。
- 键位：↑/W 油门 · ↓/S 刹车 · ←→ 转向 · 空格/Shift 漂移 · E/X 道具；支持手柄。
- 漂移蓄力松开得蓝 / 橙涡轮；倒数到「1」时踩油门是火箭起步；加速带。
- 道具箱：🍄 加速蘑菇 / 🍌 香蕉皮 / 🧶 追踪毛线球；落后者更容易抽到好道具；已有道具时再吃会重新抽取替换。
- 赛道：奶酪环岛（S 弯）、毛线八字桥（8 字立交）。
- 比赛结束后先在领奖台实时播放颁奖典礼：第 3、2、1 名依次落台，冠军落台时礼花与奖杯；播完自动出结算，可点「跳过」或按空格。Esc 是桌宠的「退出作品」键，会关闭游戏。

## 车手从哪里来

| 来源 | 结果 |
|---|---|
| 桌宠当前形象（自动，需授权「读取当前宠物形象」） | 2D 纸片人车手 |
| 宿主支持 `pet.character.getRealtime()` 且形象带 pet-ragdoll-renderer v2 实时数据 | 3D 布偶车手，零操作 |
| 手动导入角色包 ZIP / 文件夹（含 `realtime` v2 数据） | 3D 布偶车手 |
| 手动导入普通角色包或 PNG / WebP / JPG | 2D 车手 |
| 内置 | 奶酪鼠 / 橘子猫 / 棉花兔 |

`character.getRealtime` 已登记在 [pet-plugin-types](https://github.com/ShunyuYao/pet-plugin-types)，尚无已发布宿主支持；方法不存在时游戏自动回退 2D。导入的角色只保存在本作品的浏览器存储里，联机时经宿主的会话通道发给对方一次，不上传任何服务器。

## 联机

房主权威：房主运行规则（`game/room.cjs`、`game/sim.cjs`），客人只发操作意图；客人本地预测自己的车并向房主结果收敛，对手车延迟插值显示。使用宿主 `pet.sessions`（HTML 作品专用实验能力），遵守其限额。当前宿主一次邀请只能连 2 位真人。

## 开发

```sh
npm run build          # esbuild 打包成单个内联脚本（需要 esbuild，可用 PET_KART_ESBUILD 指定）
npm run test:rules     # 规则与联机协议（Node）
npm run test:browser   # 隐藏 Electron 打开最终 HTML，CDP 真实键盘
npm run test:host      # 两个真实桌宠宿主实例的局域网 E2E（需要宿主源码与本地角色包）
npm run test:installed # 已安装宿主 + 当前形象只读副本
```

浏览器与宿主 E2E 需要本地角色包夹具（带实时布偶数据的 `rat-doll-*.zip`，不随仓库发布）：用 `KART_DOLL_ZIP`、`KART_IMAGE`、`KART_PACKS_DIR`、`KART_HOST_ROOT`、`KART_CURRENT_PROFILE` 指定。

## 目录

- `game/`：纯规则（赛道、模拟、AI、房间、联机适配、单人驱动）。
- `src/`：three.js 场景、车手（3D 布偶坐姿 / 站姿、2D 立绘、玩具）、颁奖典礼、ZIP 读取、角色导入、合成音效、界面。
- `vendor/lib/`：three.js 0.164.1、cannon-es 0.20.0（MIT）。`vendor/doll/`：[pet-ragdoll-renderer](https://github.com/ShunyuYao/pet-ragdoll-renderer) 0.2.0（MIT），改动见其中 NOTICE。

所有声音运行时合成，没有录音素材；仓库不含任何头像、照片或角色贴图。

## License

MIT
