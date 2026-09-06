# 更新记录 · Changelog

## v1.3.0 — 2026-09-07

### 中文

- 新增橙色爆破弹、蓝色加长板、紫色缩短板和金色金刚球，保留绿色三倍球。颜色、符号、音效各有区分；好道具加分，坏道具扣分。
- 加长/缩短板持续 12 秒，金刚球持续 8 秒；暂停时不消耗。金刚球可真正击破内墙，但外边框始终不可破坏，普通球不能穿墙，爆破弹不炸墙。
- 首次游玩设置游戏名字，本机记住；从封面菜单改名、自由选关或查看榜单，无需注册或 GitHub 账号。
- 新增五关连续的一命闯关，以及逐关街机式结算：砖块分、道具加减分、通关奖励、速度奖励和累计总分。自由选关只参与单关榜。
- 接入 Cloudflare Workers + D1 共享积分榜，每关与总榜各展示前 10 名、每位玩家的个人最高分。昵称与成绩公开；联网失败不影响游戏，待上传成绩暂存在本机。
- 加星仅为封面和结算页的自愿链接：不自动加星、不弹窗、不绑定奖励，不影响任何关卡或排行榜。
- 保留挡板下方的空白拖动区；更新离线缓存与版本标记，安装版和原网页入口共用新版本。

计分：每块砖 10 分；好道具 +100，缩短板 −100；通关 +500；通关速度奖励 `max(0, 1800 − floor(用时秒数) × 10)`；单关总分最低为 0。一命闯关结束后，将本次各关得分相加计入总榜。换手机或清除网站数据会生成新的玩家身份。本榜为休闲交流用途，并非强防作弊的竞赛系统。

### English

- Added orange bombs, blue wide paddles, purple short paddles, and gold hard balls alongside green ×3 pickups. Each has a distinct color, symbol and sound; helpful items award points and harmful items deduct points.
- Paddle effects last 12 active seconds; gold balls last 8. Pausing freezes timers. Gold balls visibly break internal walls, while the outer boundary stays indestructible. Ordinary balls and bombs cannot destroy walls.
- Added a remembered nickname, cover-only name editing, free stage selection and leaderboards. No registration or GitHub account is needed.
- Added a five-stage, one-credit campaign with arcade-style stage settlement: brick points, item bonuses/penalties, clear bonuses, speed bonuses and cumulative totals. Practice attempts enter stage boards only.
- Added shared Cloudflare Workers + D1 top-10 boards for each stage and complete attempts, showing each player's personal best. Nicknames and scores are public. Offline results are queued locally without interrupting play.
- GitHub support links appear only on the cover and settlement screens. Starring is voluntary: no automatic stars, popups, rewards, or restrictions on gameplay or rankings.
- Preserved the clear drag area below the paddle and updated versioned offline assets. The existing web URL and installed PWA receive the same release.

Scoring: 10 per brick; +100 per helpful pickup; −100 per short-paddle pickup; +500 for a clear; successful speed bonus `max(0, 1800 − floor(seconds) × 10)`. Stage totals cannot be negative. A finished campaign adds its stage totals to the overall board. Switching devices or clearing website data creates a new player identity. Rankings are for casual play, not cheat-proof competitions.
