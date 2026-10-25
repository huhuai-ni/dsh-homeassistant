# 疑难排查

按「你现在卡在哪一步」找。

---

## 一、Docker 相关

### `docker info` 报 `failed to connect ... dockerDesktopLinuxEngine`

Docker Desktop 没启动。

- 开始菜单搜 **Docker Desktop** → 打开
- 等托盘鲸鱼图标不再转圈（1–2 分钟）
- 第一次启动可能要管理员权限或重启电脑

### `docker pull` 卡住不动

`ghcr.io` 在国内经常被限速。换镜像站：

```bash
docker pull ghcr.nju.edu.cn/home-assistant/home-assistant:stable
```

三个源轮流试：`ghcr.nju.edu.cn` → `ghcr.dockerproxy.com` → `docker.m.daocloud.io`。

### 容器起了但 8123 打不开

```bash
docker ps                 # 看 STATUS 是不是 Up
docker logs --tail 50 homeassistant   # 看有没有报错
```

常见原因：

- 还在初始化（首次启动 1–3 分钟，日志里会一直刷）
- 端口被占用：`netstat -ano | findstr 8123`

### 想重来

```bash
docker rm -f homeassistant
docker run -d ... （重新执行启动命令）
```

配置目录 `F:\deepseek\ha` 不清的话，账号和设备都还在。

---

## 二、Xiaomi Miot 集成

### 设置 → 添加集成 里搜不到 `Xiaomi Miot`

检查三件事：

1. 目录对不对：`F:\deepseek\ha\custom_components\xiaomi_miot\manifest.json` 必须存在
2. 有没有重启：`docker restart homeassistant`
3. 日志里有没有加载失败：

```bash
docker logs homeassistant 2>&1 | findstr -i xiaomi
```

### 加账号时报 `MiCloudAccessDenied`

这是**插件作者早期踩过的同一个坑**：第三方库 `micloud` 的登录接口被小米改了，密码对也登不上。

**但 HA 的 Xiaomi Miot 用的是自己的登录实现**，正常情况下不会有这个问题。

如果仍然报错，通常是：

- 账号密码打错（去 account.xiaomi.com 网页验证一次）
- 账号开了二次验证，集成版本太老不支
 
处理：把 `custom_components/xiaomi_miot` 更新到最新（重新下一遍 master），重启。

### 设备出来了但状态是 `unavailable`

- 设备断电 / 断网
- 小米账号在 HA 里掉线：**设置 → 设备与服务 → Xiaomi Miot → 重新加载**
- 设备只支持云端：在集成选项里把「本地局域网」关掉，走云端

### 空调、风扇只出现一个「红外遥控」实体

那是红外遥控器，不是设备本体。用 `climate` / `fan` 域去控制：

```json
{ "domain": "climate", "service": "turn_on", "data": { "entity_id": "climate.xxx" } }
```

---

## 三、插件相关

### 设置里看不到「家庭助理」

1. 确认插件装上了：`C:\Users\<你>\.dsh\profiles\desktop\node_modules\dsh-homeassistant\package.json` 存在
2. 确认在 bundles 里：同目录 `package.json` 的 `dsh.profile.bundles` 含 `dsh-homeassistant`
3. **重启 DSH**（插件在启动时加载）
4. 还是不行就看 `package.json` 里的 `dsh.client.inject` 是不是这三件套：

```json
["@deepseek-ai/dsh-client-runtime",
 "@deepseek-ai/dsh-client-ui-settings",
 "@deepseek-ai/dsh-client-ui-settings-plugins"]
```

### 测试连接报 401

令牌不对。重新生成：

HA → 左下角用户名 → 安全 → 长期访问令牌 → 创建。

### 报「连不上 HA：ECONNREFUSED」

- HA 没起（`docker ps`）
- 地址写错（默认 `http://localhost:8123`）
- 端口被改过（启动命令里的 `-p 8123:8123`）

### 工具能调，但 AI 说「没找到这个设备」

实体名不匹配。先用 `ha_entities` 看清楚实体 id，或者在配置里加别名：

```json
{ "aliases": { "卧室灯": "light.yeelink_mbulb3_92ae_light" } }
```

---

## 四、其他

### 令牌泄露了怎么办

1. HA → 安全 → 找到那个令牌 → **删除**
2. 重新创建一个
3. 在插件设置里换成新的

### 想删掉整套东西

```bash
docker rm -f homeassistant          # 删容器
docker rmi ghcr.nju.edu.cn/home-assistant/home-assistant:stable   # 删镜像
```

再删掉 `F:\deepseek\ha`（HA 配置）和 `~/.dsh/homeassistant`（插件配置）。