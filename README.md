# 桌宠赛车 · Pet Kart

一个单文件 HTML 的 3D 卡丁车游戏，给「吐梨邦」桌宠的 HTML 作品能力做的。在桌宠里打开会自动带入你当前的桌宠形象当车手；通过桌宠「发送并一起玩」可以和同一局域网的朋友对战，最多 4 人同局。

A single-file HTML 3D kart racer for the 吐梨邦 desktop pet. Opened inside the pet it races your current pet; "send and play together" starts a LAN room of up to 4 players; more friends join from the game window's "+ Invite" control.

交付文件：[`dist/桌宠赛车.html`](dist/桌宠赛车.html)（约 740 KB，three.js 与全部代码内联，无 CDN、无服务器）。

## 0.6 场景玩法

- 五图都有真实坡面跳台：向前加速通过自动起跳，青色跳台自动开伞；左右转向，刹车快速下降，稳定落地有短加速。空中不蓄漂移、不吃地面加速带。
- 奶酪环岛：小跳台与滚动奶酪；毛线桥：滑翔、上升风道与横穿毛线球；夜城：高架滑翔、机械路障与侧风。
- 雪山：局部冰面进一步降低抓地力、固定冰块和滚雪球，可提前绕行或滑翔越过；火山：喷口亮环预警后喷发，冷却时安全通过，热气流帮助滑翔。
- 机关不会封死整条赛道，电脑遵守同样规则并尝试绕行。环境以房主比赛时间计算，起跳、落地和伞状态同步给客端。新版游戏互动协议 v3，仍使用宿主 SDK v2，不与旧版游戏混局。

Original toy-world terrain: ramps, automatic gliders with steering and brake-to-descend, landing boosts, rolling obstacles, local ice patches, crosswinds and warning/active/cooldown lava vents. Host-clock hazards and airborne states are shared across LAN peers. Game protocol v3; host SDK remains v2.

## 玩法

- 3 圈。单人：你 + 2 个电脑。联机：4 辆车，真人不足 4 位时由房主模拟的电脑车手补满；发车格两排错位。
- 键位：↑/W 油门 · ↓/S 刹车 · ←→ 转向 · 空格/Shift 漂移 · E/X 道具；支持手柄。
- 漂移蓄力松开得蓝 / 橙涡轮；倒数到「1」时踩油门是火箭起步；加速带。
- 道具箱：🍄 加速蘑菇 / 🍌 香蕉皮 / 🧶 追踪毛线球；落后者更容易抽到好道具；已有道具时再吃会重新抽取替换。
- 赛道（难度由易到难）：

| 赛道 | 难度 | 长度 | 特点 |
|---|---|---|---|
| 奶酪环岛 | ★☆☆☆☆ 入门 | 0.7 km | 长直道 + 连续 S 弯 |
| 毛线八字桥 | ★★☆☆☆ 简单 | 0.8 km | 8 字立交 |
| 霓虹夜城 | ★★★☆☆ 进阶 | 1.8 km | 夜景街区：直角弯、窄小连续弯、一个发卡弯，高架从起跑线头顶飞过；路宽 14 m、护栏贴近 |
| 雪糕山道 | ★★★★☆ 困难 | 2.0 km | 冰面抓地力 80%、深雪出界更慢；谷底 S 弯，之字发卡弯爬上 52 m 山顶，再长下坡冲回谷底 |
| 熔岩火山 | ★★★★★ 极难 | 2.2 km | 路最窄（12 m），火山碎石抓地力 90%、出界最慢；东坡四个发卡弯上火山口，沿边缘绕行，西坡再三个发卡弯，俯冲飞越起跑线 |

  上坡会减速、下坡会带速度；弯道内侧护栏紧贴路肩，切弯要付出代价。
- 比赛结束后先在领奖台实时播放颁奖典礼：第 3、2、1 名依次落台，冠军落台时礼花与奖杯；播完自动出结算，可点「跳过」或按空格。Esc 是桌宠的「退出作品」键，会关闭游戏。

## 车手从哪里来

| 来源 | 结果 |
|---|---|
| 桌宠当前形象（自动，需授权「读取当前宠物形象」） | 2D 纸片人车手 |
| 宿主支持 `pet.character.getRealtime()` 且形象带 pet-ragdoll-renderer v2 实时数据 | 3D 布偶车手，零操作 |
| 手动导入角色包 ZIP / 文件夹（含 `realtime` v2 数据） | 3D 布偶车手 |
| 手动导入普通角色包或 PNG / WebP / JPG | 2D 车手 |
| 内置 | 奶酪鼠 / 橘子猫 / 棉花兔 |

`character.getRealtime` 已登记在 [pet-plugin-types](https://github.com/ShunyuYao/pet-plugin-types)；支持该能力且形象带实时数据的宿主可自动使用 3D，方法不存在时游戏自动回退 2D。导入的角色只保存在本作品的浏览器存储里，联机时经宿主的会话通道发给对方一次，不上传任何服务器。

## 联机

1. 在桌宠聊天里把这份 HTML「发送并一起玩」给一位朋友，双方核对设备、同意后进入大厅。
2. 想再拉人：点游戏窗口顶部控制栏的「＋ 邀请 n/4」，选同一局域网里的另一台桌宠。游戏窗口不会重开，已在大厅里的人不受影响。一次等一位回应。
3. 比赛进行中加入的朋友先观战，本局结算后顶替一位电脑车手上场；中途离开的人，座位在结算后还给电脑。
4. 房主关窗或离开，整局结束。

房主权威：房主运行规则（`game/room.cjs`、`game/sim.cjs`），客人只发操作意图；客人本地预测自己的车并向房主结果收敛，其他车按房主比赛时间延迟 150 ms 插值显示，短暂缺包最多外推 100 ms；退出、换赛道、重开和颁奖会清空旧轨迹。星形拓扑：客人之间不直连，房主用 `to` / `from` 区分客人，并把每位车手的形象转发给其他人。使用宿主 `pet.sessions`（HTML 作品专用实验能力，协议 `pet-kart` v3，声明 `players: 4`），每位客人一条会话，分别遵守其限额。

需要支持多人房间（`players` 3–4）的宿主：吐梨邦测试版 0.26.0-internal.6 起支持，正式版暂不支持。旧宿主只接受 2 人声明，会拒绝整份作品：0.4 在旧宿主上连单人模式也打不开。旧宿主请用 [v0.3.0](https://github.com/ShunyuYao/pet-kart/tree/v0.3.0)（2 人版）。0.3 与 0.4 协议不同，不能混玩。

## 开发

```sh
npm run build          # esbuild 打包成单个内联脚本（需要 esbuild，可用 PET_KART_ESBUILD 指定）
npm run test:rules     # 规则与联机协议（Node）
npm run test:terrain:e2e # 隐藏 Electron 真实键盘：五图起跳/滑翔/落地、冰面和火山喷口
npm run test:browser   # 隐藏 Electron 打开最终 HTML，CDP 真实键盘
npm run test:remote-motion # 两个真实宿主：开车时观察对方车，覆盖正常与成批收包
npm run test:remote-motion:3d # 同一路径使用 3D 布偶
npm run test:integration # 联机验收门槛：两种形象的平滑度与三人完整比赛
npm run test:host      # 三个真实桌宠宿主实例的局域网 E2E：聊天发送 + 控制栏邀请，3 人同局（需要宿主源码与本地角色包）
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

Remote cars use host simulation timestamps with a 150 ms presentation buffer and at most 100 ms of extrapolation. The real-host integration gate checks movement while both players drive, including batched SDK delivery; race changes and disconnects clear stale motion. This changes presentation only; the host still decides collisions and results.
