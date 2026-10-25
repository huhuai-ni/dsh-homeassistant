# 更新日志

## 0.2.1

- 修正 `dsh.client.inject`：改成与可正常显示设置页的插件一致的三件套，解决「设置里看不到家庭助理」
- 补全 README 与 docs

## 0.2.0

- 新增 `ha_light`：开关 + 亮度（1–255 或百分比）+ 色温
- 新增 `ha_all_off`：一键关闭某个域
- 新增口语名解析（`aliases` / 友好名称 / 实体 id 包含）
- 前端重做：按类型分页、亮度滑条、状态绿标、全部关闭按钮

## 0.1.0

- 首个版本：`ha_status` / `ha_entities` / `ha_state` / `ha_control` / `ha_service`
- 设置页：地址、长期令牌、设备表格、开关按钮
- 配置存 `~/.dsh/homeassistant/config.json`