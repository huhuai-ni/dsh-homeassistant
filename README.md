# dsh-homeassistant · 米家 / 小米智能家居控制

> 让 DSH 里的 AI 伙伴直接控制你**米家 App 里的设备**：灯、空调、风扇、红外遥控器。
> 不靠手机、不靠模拟点击，一条 HTTP 请求打到底。

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Xiaomi](https://img.shields.io/badge/%E7%B1%B3%E5%AE%B6-Xiaomi%20MIoT-orange)](https://github.com/al-one/hass-xiaomi-miot)

---

## 这是什么

一个 **DSH 插件**，两半：

| 半边 | 干什么 |
|---|---|
| **后端**（`index.js`） | 注册 `ha_*` 工具，转发请求到 Home Assistant 的 REST API；同时提供 `/api/ha/*` 给设置页用 |
| **前端**（`client.js`） | 在 DSH 的 **设置 → 插件** 里加一栏「家庭助理」：填地址、填令牌、看设备列表、直接开关、拖亮度 |

配好之后，你可以直接说：

```
「把卧室的灯关了」
「灯调暗一点」
「空调调到 26 度」
「现在有啥设备开着」
```

AI 就会调 `ha_control` / `ha_light` / `ha_service`，真的把灯关掉。

---

## 米家（Xiaomi MIoT）适配说明

这个插件**不直接对接米家**，而是通过 Home Assistant 的 **Xiaomi Miot Auto** 集成间接控制。原因写在下一节，这里只说清楚它覆盖了什么：

| 米家里的东西 | 能不能控 | 说明 |
|---|---|---|
| 米家台灯 / 吸顶灯 / 灯泡 | ✅ | 开关、亮度、色温都能调 |
| 米家插座 / 开关面板 | ✅ | 开关 |
| 空调（含米家空调伴侣 / 红外遥控） | ✅ | `climate` 实体，开关、温度、模式 |
| 风扇（含红外遥控款） | ✅ | `fan` 实体，开关、档位 |
| 窗帘电机 | ✅ | `cover` 实体，开/关 |
| 米家场景 / 自动化 | ✅ | 通过 `ha_service` 触发 scene / script |
| 小爱音箱 | ⚠️ 部分 | 能开关、调音量（`media_player`）；**不能让它开口说话** |
| 门锁 / 摄像头 | ❌ 不碰 | 安全和隐私考虑，本插件不提供相关操作 |

**账号要求**：一个能登录米家 App 的小米账号（手机号或邮箱都行）。密码只填在 HA 里，本插件不保存。

**为什么不做直连**：米家没有对个人开放的 API，第三方库（`python-miio` + `micloud`）的登录流程已经被小米改掉，会返回 `MiCloudAccessDenied`——**密码对也登不上**。Xiaomi Miot Auto 自己维护登录，是目前唯一稳定的路子。
---

## 为什么要绕 Home Assistant 这一道

这是本项目最需要解释的地方。

### 米家原生接口走不通了

理论上，控制米家设备有两条「直连」路：

1. **miIO 协议**（局域网直连）——需要每个设备的 `token`
2. **小米云 API**（云端）——需要登录账号

问题是：

- **token 只能通过小米云登录才能拿到**，而主流的第三方库（`python-miio` + `micloud`）用的登录流程已经被小米改掉，实测会返回
  `MiCloudAccessDenied: Access denied. Did you set the correct api key and/or username?`
  ——**密码对也没用**，是接口对不上，不是用户的问题。
- 换 token 的老办法（抓包、root 读数据库）门槛很高，普通用户根本走不通。
- 官方 MIoT 开放平台只对企业开放，个人拿不到。

### Home Assistant 的 Xiaomi Miot 集成能过

Home Assistant（下称 HA）有一个社区集成叫 **Xiaomi Miot Auto**，它**自己维护登录流程**，跟着小米接口的变化更新。实测：

- 账号密码能登上
- 灯、空调、风扇、红外遥控器都能认出来
- 实体状态实时同步

于是架构就变成：

```
DSH 插件  ──HTTP──▶  Home Assistant  ──Xiaomi Miot──▶  小米云 / 局域网  ──▶  设备
   ▲
   └── 设置页（client.js）
```

**代价**：多一个 Docker 容器、约 1.5 GB 镜像、首次配置十几分钟。
**收益**：真的能控制，而且以后换设备、加设备，都在 HA 里点两下就行，插件不用改。

---

## 架构

```
┌──────────────────────────── DSH ────────────────────────────┐
│                                                             │
│  设置 → 插件 → 家庭助理          AI 对话                     │
│  ┌─────────────────────┐        ┌──────────────────────┐    │
│  │ client.js (React)   │        │ ha_status            │    │
│  │  · 地址 / 令牌       │        │ ha_entities          │    │
│  │  · 设备表格          │        │ ha_state             │    │
│  │  · 亮度滑条          │        │ ha_control           │    │
│  │  · 全部关闭          │        │ ha_light             │    │
│  └─────────┬───────────┘        │ ha_all_off           │    │
│            │ /api/ha/*          │ ha_service           │    │
│            ▼                    └──────────┬───────────┘    │
│  ┌──────────────────────────────────────┐   │                │
│  │        index.js（宿主半端）           │◀──┘                │
│  │  · HTTP 路由  · 工具注册  · 配置读写   │                    │
│  └──────────────────┬───────────────────┘                    │
└─────────────────────┼────────────────────────────────────────┘
                      │ Authorization: Bearer <长期令牌>
                      ▼
        ┌─────────────────────────────┐
        │ Home Assistant :8123        │
        │  · Xiaomi Miot 集成          │
        └──────────────┬──────────────┘
                       ▼
              小米云 / 局域网设备
```

---

## 安装

### 前置

- Windows / macOS / Linux 都行（本项目在 Windows 上开发测试）
- Docker
- DSH（桌面版或 Web 版）
- Node 22+

### 一、装 Docker

到 [docker.com](https://www.docker.com/products/docker-desktop/) 下载 Docker Desktop，安装后启动，等托盘图标稳定。

验证：

```bash
docker info --format "{{.ServerVersion}}"
```

### 二、拉 Home Assistant 镜像

官方源 `ghcr.io` 在国内经常拉不动（实测卡住十几分钟无进展）。用镜像站：

```bash
# 南京大学镜像（推荐，实测可用）
docker pull ghcr.nju.edu.cn/home-assistant/home-assistant:stable

# 备选
docker pull ghcr.dockerproxy.com/home-assistant/home-assistant:stable
docker pull docker.m.daocloud.io/ghcr.io/home-assistant/home-assistant:stable
```

### 三、起容器

```bash
mkdir -p F:/deepseek/ha

docker run -d \
  --name homeassistant \
  --restart=unless-stopped \
  -v F:/deepseek/ha:/config \
  -e TZ=Asia/Shanghai \
  -p 8123:8123 \
  ghcr.nju.edu.cn/home-assistant/home-assistant:stable
```

Windows PowerShell 版本：

```powershell
New-Item -ItemType Directory -Force -Path F:\deepseek\ha
docker run -d --name homeassistant --restart=unless-stopped `
  -v F:\deepseek\ha:/config -e TZ=Asia/Shanghai -p 8123:8123 `
  ghcr.nju.edu.cn/home-assistant/home-assistant:stable
```

等 1–3 分钟，浏览器打开 <http://localhost:8123>，创建管理员账号。

### 四、装 Xiaomi Miot 集成

**方式 A：手动放（推荐，不依赖 HACS）**

```bash
# 下载（GitHub 直连可能失败，见 docs/troubleshooting.md）
curl -L -o xiaomi_miot.zip \
  https://github.com/al-one/hass-xiaomi-miot/archive/refs/heads/master.zip

unzip xiaomi_miot.zip -d tmp
mkdir -p F:/deepseek/ha/custom_components
cp -r tmp/hass-xiaomi-miot-master/custom_components/xiaomi_miot \
      F:/deepseek/ha/custom_components/

docker restart homeassistant
```

放完检查一下：`F:\deepseek\ha\custom_components\xiaomi_miot\manifest.json` 存在就对了。

**方式 B：HACS**

装 HACS → 集成里搜 `Xiaomi Miot Auto` → 下载 → 重启 HA。

### 五、绑定小米账号

1. HA → **设置** → **设备与服务**
2. 右下角 **添加集成**
3. 搜 `Xiaomi Miot`
4. 选「添加小米账号」，填账号密码
5. 等它把设备拉出来（灯、空调、红外遥控都能认）

### 六、拿长期令牌

1. HA 左下角点自己的用户名
2. 切到 **安全** 标签
3. 最下面「长期访问令牌」→ **创建令牌**
4. 名字随便填（如 `dsh`），复制 `eyJ...` 那串

> 令牌等于家里设备的钥匙，别贴群里、别发截图。

### 七、装插件

```bash
dsh plugin --profile desktop add dsh-homeassistant
```

或者本地开发：

```bash
dsh plugin --profile desktop add link:F:/deepseek/dsh-homeassistant
```

### 八、在设置里填

**设置 → 插件 → 家庭助理**

```
HA 地址    http://localhost:8123
长期令牌   eyJ...
```

点 **保存** → **测试连接**。成功会显示 `HA 版本 / 实体数量`，下面出现设备表格。

---

## 使用

### 前端（设置页）

| 区域 | 能干什么 |
|---|---|
| 顶部 | 改地址、换令牌、保存、测试连接、刷新、**全部关闭** |
| 分页 | 全部 / 灯 / 开关 / 风扇 / 空调 / 窗帘（带数量） |
| 表格 | 名称、实体 id、状态（开=绿）、亮度百分比、温度 |
| 操作 | 开 / 关；灯还有**亮度滑条**，拖一下立刻生效 |

### 工具（对话里）

| 工具 | 说明 | 例子 |
|---|---|---|
| `ha_status` | 检查连通性 | `ha_status {}` |
| `ha_entities` | 列可控实体 | `ha_entities { domain: "light" }` |
| `ha_state` | 查状态 | `ha_state { entity: "灯" }` |
| `ha_control` | 开 / 关 / 切换 | `ha_control { entity: "灯", action: "off" }` |
| `ha_light` | 开关 + 亮度 + 色温 | `ha_light { entity: "灯", brightness: 60 }` |
| `ha_all_off` | 一键全关 | `ha_all_off {}` |
| `ha_service` | 任意 HA 服务 | `ha_service { domain:"climate", service:"set_temperature", data:{...} }` |

### 口语名

工具都支持直接说「灯」「空调」，解析顺序：

1. `aliases` 配置里的别名
2. 完整实体 id
3. 实体「友好名称」包含
4. 实体 id 包含

想固定映射，编辑 `~/.dsh/homeassistant/config.json`：

```json
{
  "url": "http://localhost:8123",
  "token": "eyJ...",
  "aliases": {
    "卧室灯": "light.yeelink_mbulb3_92ae_light",
    "客厅灯": "light.xxx"
  }
}
```

---

## 配置存哪

```
~/.dsh/homeassistant/config.json     # 地址、令牌、别名
```

- 只在**本机**
- 不上传、不写日志
- 删掉这个文件等于清空配置

---

## 工作原理（想改代码的人看这里）

### 后端

`apply(ctx)` 做两件事：

1. **注册工具**：每个工具执行时读配置 → 拼 REST 请求 → 返回 JSON
2. **挂 HTTP 路由**：`ctx.webServer.register({ kind: 'prefix', path: '/api/ha' })`，给前端用

REST 调用统一走 `request()`：

```
GET  /api/                          版本信息
GET  /api/states                    所有实体状态
GET  /api/states/<entity_id>        单个实体
POST /api/services/<domain>/<svc>   调用服务（turn_on / turn_off / toggle ...）
```

### 前端

`client.js` 用 `window.__ModuleLoader__.load({ id, factory })` 自注册，`factory` 里拿 React，
然后往 `settings.section` 插一个面板：

```js
slots.inject('settings.section', () => slots.register(
  { name: 'settings.section', id: 'homeassistant', order: 46, label: '家庭助理' },
  () => h(Panel),
))
```

面板通过 `fetch('/api/ha/*')` 跟后端说话，不直接碰 HA。

### 为什么配置不用 schemastery

配置存在自己的 JSON 文件里，不走 DSH 的 settings store——因为前端要能**改完立刻生效**，
而且令牌这种敏感字段不适合进统一配置。

---

## 常见问题

见 [docs/troubleshooting.md](docs/troubleshooting.md)。

几个高频的：

| 现象 | 原因 | 处理 |
|---|---|---|
| 8123 打不开 | 容器没起 | `docker ps` / `docker logs homeassistant` |
| 集成搜不到 Xiaomi Miot | 目录放错 / 没重启 | 检查 `custom_components/xiaomi_miot/manifest.json`，`docker restart homeassistant` |
| 测试连接 401 | 令牌无效 | 重新创建长期令牌 |
| 实体 `unavailable` | 设备离线或账号掉线 | HA 里重新加载集成 |
| 空调/风扇只有红外 | 红外遥控实体 | 用 `climate` / `fan` 域，不要用 `light` |

---

## 安全说明

- HA 只监听本机 `8123`，没有暴露公网
- 令牌存本机文件，权限跟随用户目录
- 插件不收集任何数据，不发外部请求（只打你的 HA）
- 建议定期轮换令牌

---

## 路线图

- [ ] 支持 HA 的「区域」分组（按房间分页）
- [ ] 场景 / 脚本一键触发按钮
- [ ] 定时任务（晚上 23:00 自动关灯）
- [ ] 实体收藏置顶
- [ ] 深色/浅色主题适配

---

## 许可

MIT，见 [LICENSE](LICENSE)。

## 致谢

- [Home Assistant](https://www.home-assistant.io/)
- [hass-xiaomi-miot](https://github.com/al-one/hass-xiaomi-miot)
- DeepSeek Harness 插件系统
