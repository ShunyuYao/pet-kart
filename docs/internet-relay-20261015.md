# 桌宠赛车互联网中转联机（2026-10-15）

默认`dist/桌宠赛车.html`声明`transport:auto`，由宿主按好友来源选LAN或relay。另提供`dist/桌宠赛车-LAN.html`及`build-lan.json`。游戏不连接第三方网络地址，不接触账号token，不改宿主SDK、权限或服务器。双方需要同一作品摘要，断线沿原通道重连。

玩法沿用原版4人房间与裁定；赛车继续本地驾驶预测、原始时间插值与房主裁定。协议以`game/net.js`和构建回执为准，不能从文件名或版本号推断兼容。

## 可复跑入口

设置`KART_HOST_ROOT`为已构建React、已下载LFS素材的隔离宿主；`KART_PACKS_DIR`为本机3D形象夹具目录。赛车完整多人测试另设`KART_EXPECT_3D=1`。构建指定`PET_KART_ESBUILD`（宿主的esbuild模块绝对路径）。不要读取或修改日常userData。 隔离worktree的`test:browser`另显式设置`KART_DOLL_ZIP`（3D包）和`KART_IMAGE`（2D帧）；多人`KART_PACKS_DIR`不替代这两项。

- `test:artifact`：auto/LAN与实际协议、vendor、摘要、大小和JavaScript语法一致。
- `test:host`：三人生产LAN完整比赛、自己的桌宠形象、真实输入、结算、再战和离场。
- `test:relay` / `test:mixed`：四人生产中转或混合网络；真实socket中断后相同房间恢复，四人的完整比赛与离场。这里是本机多实例，不是实体公网。
- `test:internet`：产物及受影响的网络聚合；`test:delivery`保留原规则、浏览器及相邻回归。
- `test:physical`：必须显式提供`PET_GAMES_ACCEPTANCE_ROOT`（游戏侧独立acceptance工作区）、`PET_HOST_ROOT`（目录含当前游戏）、`PET_GAME_REMOTE_DEPS`（另一Mac的匹配node_modules）、`PET_GAME_TEST_OTP_FILE`（当前用户的0600 Test开发码文件）。编排只使用明确的Test开发短信环境；不得把验证码、手机号或token写入报告/截图。实际玩法断言在本仓库`tests/public-relay-scenario.cjs`。`test:internet:full`聚合本机与实体路径，缺依赖应失败，不算通过。

只通过本机四人不能声称四台实体跨公网；两台实体的公网对局不能代替Windows或弱网长时验证。全过程隐藏首帧、CDP真实键盘和后台截图，记录实际进程退出与账号清理。

## 本轮发现及结果
以下保留失败到修复的追溯，最终候选以末尾验收表为准。

### 早期候选与纯中转验收
0.6.0 / pet-kart协议2，auto成品SHA256 `bd0bc66a91ec4e5ad19c3d917ce6220e0bad59c992df74367df3126e8e75cc97`，742730字节，pet-kit 0.3.0。
四人`test:relay`：2026-10-15T04-46-34-658Z OK。每屏真实2D/3D形象、4/4容量、3秒实际socket中断原房恢复、四路真实键盘、道具、完整比赛与相同颁奖/四份排名、客人离开电脑补位、剩余所有客人再战与房主关闭均通过，零renderer异常。四个拥有进程首帧隐藏并实际退出。
首轮测试曾有自动截图5秒超时、运行中测试源码变化被摘要守卫拒绝，以及四人扩展部分仍按三人写缓存/断言的问题；保留失败报告后固定源码、分开显式截图、按实际人数逐一检查。并发两套四人时第四份文件45秒接收超时，最终验收逐组执行，不将这些失败记录删除。

### 短断网可重放故障
四人mixed 05-03-38-579Z完成比赛但b出现peer_offline错误栏。原guestSend只重试backpressure，发送早于poll发现断线时有竞态。既有net.test先红复现，再使用与host/素材上传相同的TRANSIENT分类；最新输入与ready状态下一tick重试，永久权限错误仍必须上报。当前最终auto候选SHA256 `048a5ae00640aaa1cb8ea65fa9e1d8266f1081456fda38814e686c099b1fb86d`，742718字节；旧bd0绿灯仅作历史。

最终048a5ae0四人mixed：2026-10-15T05-13-23-860Z OK，22项检查、零异常/失败，原错误栏故障路径已消失；整场、四份排名、再战与关闭通过。

赛车最终048a5ae0四人纯relay 05-18-59-077Z OK，21项检查、零异常/失败；四人身份/素材/真实输入、短断网恢复、四屏颁奖与相同排名、电脑补位/全部剩余人再战/房主关闭均通过。此轮未恰好抽到可用道具，四人mixed已通过实际使用道具的独立断言，未把可选采样算作本轮道具证据。

## 双机赛车离场断言校正
Agent/公网实体验收05-26-49-324Z：真实登录/好友/Vibe投递/两端输入/完整比赛与相同排名/再战均过，随后断言“再战倒数时客人离开立即变CPU”超时。原README及room.depart明确：比赛开始后保留该车、本局断开，结算后释放；四人既有路径验证的是结算界面离开、立即补CPU。两者条件不同。保留产品语义与失败记录，实体场景改为逐项断言房主看到connected:false、原车不被CPU劫持、房主房间继续、离开者自己会话关闭；重新跑完整同一公网路径。不是给产品新增立即接管规则，也不把前一失败记成通过。

双机赛车05-31-52-780Z再次跑到同排名后，真实按钮工具拒绝聚焦隐藏的again。失败的两端results截图实际仍是颁奖画面：mode短暂读到results并不能证明异步颁奖已结束；同一公网测试此前偶然等到了稳定结果，不代表条件足够。未修改产品；实体场景采用既有四人验收的真实ceremony.active/ready/t>4600条件，逐屏记录颁奖、比较实际领奖演员顺序，再等待可见results-panel与可用again按钮。保留真实焦点断言，未改成直接调用handler或忽略失败；修正后完整重放。

赛车05-37-27-152Z在实际可见结果/再战通过后，仍未观察到离场。快速双机countdown探针05-43-49-463Z保留前后15份状态：b仍为race而不是title，header按钮焦点已被刷新清除；所以未执行游戏leave，不能归因中转丢消息。renderMenus每次onView在race都会blur按钮，远端CDP的focus与Enter间隔足以被50ms刷新打断。原探针仅用于定位，已退役；本轮不扩展修改比赛键盘焦点行为（不属于互联网传输改动，普通鼠标退出未证实受影响）。公网整局后用宿主既有控制条的真实退出入口关闭客人，断言target销毁、房主收到离场且不劫持本局席位；游戏内header退出的中转SDK路径已有四人结算界面验收，不能把比赛中的键盘聚焦说成已修复。共享编排为场景提供通用closeWork，并在其余关闭路径逐一断言target消失；变更后两游戏公网分别重跑，不沿用旧脚本绿灯。

赛车048a5ae0最终双实体Mac公网 05-46-40-964Z OK，18项、零异常/失败；两端LAN关闭，真实Test账号/好友/Vibe跨磁盘/SDK许可，真实键盘完整比赛、实际颁奖演员顺序和相同最终排名、再战、宿主控制条关闭客人后原席位断开且房主继续，首帧隐藏、实际PID退出、服务器登出均通过。两端比赛及结果截图后台目视复核。
中转运动检查05-49-37-044Z OK：正式048a5ae0的临时只读探针副本，3D形象与两路真实驾驶，正常411帧/180ms成批401帧；holdRatio 1.95%/7.23%，reverseRatio均0，p95SpeedRatio 1.014/1.028；保留原阈值及退出传播断言。正式HTML无探针，不声称完全无单帧尖峰。

## 最终验收表

最终成品为0.6.0 / pet-kart协议2 / pet-kit 0.3.0，SHA256 `048a5ae00640aaa1cb8ea65fa9e1d8266f1081456fda38814e686c099b1fb86d`，742718字节；显式LAN版另见build-lan.json。

| 入口 | 本候选证据 | 结果 |
| --- | --- | --- |
| test:rules / test:artifact | 48条规则/网络（含临时发送拒绝与永久错误）、双产物契约 | 通过，无跳过 |
| test:browser | 最终成品、真实2D/3D导入和驾驶、两整场/颁奖/跳过/再战及五赛道检查，report 46项 | 通过，240.18秒 |
| test:relay | host-e2e/2026-10-15T05-18-59-077Z | 四人通过 |
| test:mixed | host-e2e/2026-10-15T05-13-23-860Z | 四人通过 |
| test:remote-motion:relay | host-e2e/2026-10-15T05-49-37-044Z | 正常与180ms成批收包通过 |
| test:physical | acceptance/artifacts/physical/kart/2026-10-15T05-46-40-964Z | 两实体Mac禁LAN公网通过，18项 |

聚合入口有登记，本轮按相同输入去重逐项执行，没有机械重跑test:delivery。未重复三人纯LAN整场，四人mixed覆盖实际LAN，三人规则/网络及离场由原测试保护；未验证Windows、四实体公网和长时弱网。比赛中header按钮的远端键盘聚焦限制仍是未修项目，公网离场使用宿主控制条，不能写成该焦点问题已解决。测试数据/截图/验证码不提交。宿主SDK未变，类型、脚手架、市场无需同步；成品接入宿主Test，不等于安装包已发布。

Final candidate: 0.6.0, protocol 2, host-selected LAN or internet relay. Four local peers passed relay and mixed-network games; two physical Macs passed the public Test relay with LAN disabled, real driving, actual podiums, matching standings, rematch and exit through the host controls. The remote keyboard-focus limitation of the in-race header exit remains documented. Windows, four physical peers and prolonged poor networks were not tested. No host installer was published.
