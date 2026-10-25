/**
 * dsh-homeassistant —— 通过 Home Assistant 的 REST API 控制家里的设备
 * ============================================================================
 * 后端：ha_* 工具 + /api/ha/* 接口
 * 前端：设置 → 插件 → 家庭助理（地址/令牌、实体表格、亮度、全部关灯）
 *
 * 配置：~/.dsh/homeassistant/config.json  { url, token, aliases: { "灯": "light.xxx" } }
 * ============================================================================
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'
import http from 'node:http'
import https from 'node:https'

export const name = 'homeassistant'
export const inject = ['tools', 'webServer']

const DSH_HOME = process.env.DSH_HOME || join(homedir(), '.dsh')
const DIR = join(DSH_HOME, 'homeassistant')
const CONF = join(DIR, 'config.json')

const DOMAINS = ['light', 'switch', 'fan', 'climate', 'cover', 'media_player', 'scene', 'script', 'input_boolean']

const SERVICE = {
  light: { on: 'turn_on', off: 'turn_off', toggle: 'toggle' },
  switch: { on: 'turn_on', off: 'turn_off', toggle: 'toggle' },
  fan: { on: 'turn_on', off: 'turn_off', toggle: 'toggle' },
  input_boolean: { on: 'turn_on', off: 'turn_off', toggle: 'toggle' },
  climate: { on: 'turn_on', off: 'turn_off' },
  cover: { on: 'open_cover', off: 'close_cover' },
  scene: { on: 'turn_on' },
  script: { on: 'turn_on' },
  media_player: { on: 'turn_on', off: 'turn_off' },
}

function readConf() {
  try { return JSON.parse(readFileSync(CONF, 'utf8')) } catch { return {} }
}
function writeConf(o) {
  mkdirSync(DIR, { recursive: true })
  writeFileSync(CONF, JSON.stringify(o, null, 2), 'utf8')
}

function request(cfg, method, path, body) {
  return new Promise((resolve) => {
    const base = (cfg.url || 'http://localhost:8123').replace(/\/+$/, '')
    const u = new URL(base + path)
    const mod = u.protocol === 'https:' ? https : http
    const payload = body ? JSON.stringify(body) : null
    const req = mod.request({
      hostname: u.hostname,
      port: u.port || (u.protocol === 'https:' ? 443 : 80),
      path: u.pathname + u.search,
      method,
      timeout: 15000,
      headers: {
        Authorization: 'Bearer ' + (cfg.token || ''),
        'Content-Type': 'application/json',
        ...(payload ? { 'Content-Length': Buffer.byteLength(payload) } : {}),
      },
    }, (res) => {
      let raw = ''
      res.setEncoding('utf8')
      res.on('data', (d) => { raw += d })
      res.on('end', () => {
        let data
        try { data = JSON.parse(raw) } catch { data = raw }
        if (res.statusCode >= 200 && res.statusCode < 300) resolve({ ok: true, data })
        else resolve({ ok: false, status: res.statusCode, error: typeof data === 'string' ? data.slice(0, 300) : (data.message || JSON.stringify(data).slice(0, 300)) })
      })
    })
    req.on('timeout', () => req.destroy(new Error('超时')))
    req.on('error', (e) => resolve({ ok: false, error: '连不上 HA：' + (e.code || e.message) }))
    if (payload) req.write(payload)
    req.end()
  })
}

/** 把「灯」「卧室灯」这类口语名解析成实体 id */
function resolveEntity(key, cfg, states) {
  const k = String(key || '').trim()
  if (!k) return null
  const aliases = cfg.aliases || {}
  if (aliases[k]) return aliases[k]
  if (states.find((s) => s.entity_id === k)) return k
  const byName = states.find((s) => (s.attributes?.friendly_name || '').includes(k))
  if (byName) return byName.entity_id
  const byId = states.find((s) => s.entity_id.includes(k))
  return byId ? byId.entity_id : null
}

const textOutput = {
  schema: { type: 'object', properties: {}, additionalProperties: true },
  render: (_a, v) => [{ type: 'text', text: typeof v === 'string' ? v : JSON.stringify(v, null, 2) }],
}
const defineTool = (o) => o
const sendJson = (res, code, obj) => {
  res.statusCode = code
  res.setHeader('content-type', 'application/json; charset=utf-8')
  res.end(JSON.stringify(obj))
}
const readBody = (req) => new Promise((r) => {
  let b = ''
  req.on('data', (d) => { b += d })
  req.on('end', () => { try { r(JSON.parse(b || '{}')) } catch { r({}) } })
})

export function apply(ctx) {
  const tool = (spec) => ctx.tools.register(defineTool({
    ...spec,
    output: textOutput,
    async execute(args) {
      try { return await spec.execute(args || {}) } catch (e) { return { ok: false, error: String(e?.message || e) } }
    },
  }))

  const needConf = () => {
    const c = readConf()
    if (!c.url || !c.token) return { error: '还没配置：设置 → 插件 → 家庭助理' }
    return { cfg: c }
  }

  const allStates = async (cfg) => {
    const r = await request(cfg, 'GET', '/api/states')
    return r.ok && Array.isArray(r.data) ? r.data : []
  }

  tool({
    name: 'ha_status',
    description: '检查 Home Assistant 是否连得上（返回版本、实体数量）。',
    parameters: { type: 'object', properties: {}, additionalProperties: false },
    async execute() {
      const { cfg, error } = needConf()
      if (error) return { ok: false, error }
      const api = await request(cfg, 'GET', '/api/')
      if (!api.ok) return api
      const states = await allStates(cfg)
      return { ok: true, ha: api.data, states: states.length }
    },
  })

  tool({
    name: 'ha_entities',
    description: '列出可控实体。domain 可选：light / switch / fan / climate / cover（默认全部）。',
    parameters: {
      type: 'object',
      properties: { domain: { type: 'string', description: '按域过滤，如 light' } },
      additionalProperties: false,
    },
    async execute({ domain }) {
      const { cfg, error } = needConf()
      if (error) return { ok: false, error }
      const states = await allStates(cfg)
      const list = states
        .filter((s) => DOMAINS.includes(String(s.entity_id).split('.')[0]))
        .filter((s) => !domain || String(s.entity_id).startsWith(domain + '.'))
        .map((s) => ({
          entity_id: s.entity_id,
          name: s.attributes?.friendly_name || s.entity_id,
          state: s.state,
          domain: String(s.entity_id).split('.')[0],
          brightness: s.attributes?.brightness,
          temperature: s.attributes?.temperature,
        }))
      return { ok: true, count: list.length, entities: list }
    },
  })

  tool({
    name: 'ha_state',
    description: '看某个实体当前状态，例如 ha_state { entity: "灯" } 或完整实体 id。',
    parameters: { type: 'object', properties: { entity: { type: 'string' } }, required: ['entity'], additionalProperties: false },
    async execute({ entity }) {
      const { cfg, error } = needConf()
      if (error) return { ok: false, error }
      const states = await allStates(cfg)
      const id = resolveEntity(entity, cfg, states)
      if (!id) return { ok: false, error: '没找到这个设备：' + entity }
      const r = await request(cfg, 'GET', '/api/states/' + encodeURIComponent(id))
      if (!r.ok) return r
      const d = r.data || {}
      return { ok: true, entity_id: d.entity_id, state: d.state, name: d.attributes?.friendly_name, attributes: d.attributes }
    },
  })

  tool({
    name: 'ha_control',
    description: '开关实体。entity 可填口语名或实体 id，action 填 on / off / toggle。例：ha_control { entity:"灯", action:"off" }',
    parameters: {
      type: 'object',
      properties: {
        entity: { type: 'string', description: '口语名（灯/空调）或实体 id' },
        action: { type: 'string', enum: ['on', 'off', 'toggle'] },
      },
      required: ['entity', 'action'],
      additionalProperties: false,
    },
    async execute({ entity, action }) {
      const { cfg, error } = needConf()
      if (error) return { ok: false, error }
      const states = await allStates(cfg)
      const id = resolveEntity(entity, cfg, states)
      if (!id) return { ok: false, error: '没找到这个设备：' + entity }
      const [domain] = id.split('.')
      const service = SERVICE[domain]?.[action]
      if (!service) return { ok: false, error: `不支持：${domain} / ${action}` }
      const r = await request(cfg, 'POST', `/api/services/${domain}/${service}`, { entity_id: id })
      return r.ok ? { ok: true, entity: id, action } : r
    },
  })

  tool({
    name: 'ha_light',
    description: '调灯：开关、亮度（1-255 或百分比）、色温。例：ha_light { entity:"灯", brightness: 40 }',
    parameters: {
      type: 'object',
      properties: {
        entity: { type: 'string', description: '口语名或实体 id' },
        on: { type: 'boolean', description: '要不要开' },
        brightness: { type: 'number', description: '亮度 1-255，或直接给百分比 1-100（会自动换算）' },
        color_temp: { type: 'number', description: '色温开尔文，如 2700-6500' },
      },
      required: ['entity'],
      additionalProperties: false,
    },
    async execute({ entity, on, brightness, color_temp }) {
      const { cfg, error } = needConf()
      if (error) return { ok: false, error }
      const states = await allStates(cfg)
      const id = resolveEntity(entity, cfg, states)
      if (!id) return { ok: false, error: '没找到这个设备：' + entity }
      if (on === false) {
        const off = await request(cfg, 'POST', '/api/services/light/turn_off', { entity_id: id })
        return off.ok ? { ok: true, entity: id, action: 'off' } : off
      }
      const data = { entity_id: id }
      if (on === true) data.brightness = data.brightness || 255
      if (typeof brightness === 'number') {
        data.brightness = brightness <= 100 ? Math.round(brightness / 100 * 255) : Math.max(1, Math.min(255, Math.round(brightness)))
      }
      if (typeof color_temp === 'number') data.color_temp_kelvin = Math.round(color_temp)
      const r = await request(cfg, 'POST', '/api/services/light/turn_on', data)
      return r.ok ? { ok: true, entity: id, applied: data } : r
    },
  })

  tool({
    name: 'ha_all_off',
    description: '一键关掉所有灯（或者指定域，如 domain="switch"）。',
    parameters: {
      type: 'object',
      properties: { domain: { type: 'string', description: '默认 light' } },
      additionalProperties: false,
    },
    async execute({ domain = 'light' }) {
      const { cfg, error } = needConf()
      if (error) return { ok: false, error }
      const r = await request(cfg, 'POST', `/api/services/${domain}/turn_off`, {})
      return r.ok ? { ok: true, domain, action: 'turn_off' } : r
    },
  })

  tool({
    name: 'ha_service',
    description: '调用任意 HA 服务（高级）。例：ha_service { domain:"climate", service:"set_temperature", data:{"entity_id":"climate.x","temperature":26} }',
    parameters: {
      type: 'object',
      properties: {
        domain: { type: 'string' },
        service: { type: 'string' },
        data: { type: 'object', additionalProperties: true },
      },
      required: ['domain', 'service'],
      additionalProperties: false,
    },
    async execute({ domain, service, data = {} }) {
      const { cfg, error } = needConf()
      if (error) return { ok: false, error }
      const r = await request(cfg, 'POST', `/api/services/${domain}/${service}`, data)
      return r.ok ? { ok: true, called: `${domain}.${service}` } : r
    },
  })

  /* ───── 设置页接口 ───── */

  const handle = async (req, res, url) => {
    const p = (url.pathname.replace(/^\/api\/ha/, '') || '/')
    const method = req.method || 'GET'

    if (p === '/config' && method === 'GET') {
      const c = readConf()
      return sendJson(res, 200, { ok: true, url: c.url || 'http://localhost:8123', hasToken: !!c.token, aliases: c.aliases || {} })
    }
    if (p === '/config' && method === 'POST') {
      const b = await readBody(req)
      const c = readConf()
      if (typeof b.url === 'string' && b.url.trim()) c.url = b.url.trim()
      if (typeof b.token === 'string' && b.token.trim()) c.token = b.token.trim()
      if (b.clearToken) delete c.token
      if (b.aliases && typeof b.aliases === 'object') c.aliases = b.aliases
      writeConf(c)
      return sendJson(res, 200, { ok: true, hasToken: !!c.token })
    }
    if (p === '/test' && method === 'POST') {
      const c = readConf()
      if (!c.token) return sendJson(res, 200, { ok: false, error: '还没填令牌' })
      const r = await request(c, 'GET', '/api/')
      if (!r.ok) return sendJson(res, 200, r)
      const states = await allStates(c)
      return sendJson(res, 200, { ok: true, version: r.data?.version, states: states.length })
    }
    if (p === '/entities' && method === 'GET') {
      const c = readConf()
      if (!c.token) return sendJson(res, 200, { ok: false, error: '还没填令牌' })
      const states = await allStates(c)
      const list = states
        .filter((s) => DOMAINS.includes(String(s.entity_id).split('.')[0]))
        .map((s) => ({
          entity_id: s.entity_id,
          name: s.attributes?.friendly_name || s.entity_id,
          state: s.state,
          domain: String(s.entity_id).split('.')[0],
          brightness: s.attributes?.brightness,
          temperature: s.attributes?.temperature,
        }))
      return sendJson(res, 200, { ok: true, entities: list })
    }
    if ((p === '/control' || p === '/light') && method === 'POST') {
      const b = await readBody(req)
      const c = readConf()
      const states = await allStates(c)
      const id = resolveEntity(b.entity, c, states)
      if (!id) return sendJson(res, 200, { ok: false, error: '没找到设备' })
      const [domain] = id.split('.')

      if (p === '/light') {
        const data = { entity_id: id }
        if (b.on === false) {
          const r = await request(c, 'POST', '/api/services/light/turn_off', { entity_id: id })
          return sendJson(res, 200, r.ok ? { ok: true, entity: id, action: 'off' } : r)
        }
        if (typeof b.brightness === 'number') data.brightness = Math.max(1, Math.min(255, Math.round(b.brightness)))
        if (typeof b.color_temp === 'number') data.color_temp_kelvin = Math.round(b.color_temp)
        const r = await request(c, 'POST', '/api/services/light/turn_on', data)
        return sendJson(res, 200, r.ok ? { ok: true, entity: id, applied: data } : r)
      }

      const service = SERVICE[domain]?.[b.action]
      if (!service) return sendJson(res, 200, { ok: false, error: '不支持的实体或动作' })
      const r = await request(c, 'POST', `/api/services/${domain}/${service}`, { entity_id: id })
      return sendJson(res, 200, r.ok ? { ok: true, entity: id, action: b.action } : r)
    }
    if (p === '/all_off' && method === 'POST') {
      const c = readConf()
      const b = await readBody(req)
      const domain = b.domain || 'light'
      const r = await request(c, 'POST', `/api/services/${domain}/turn_off`, {})
      return sendJson(res, 200, r.ok ? { ok: true, domain } : r)
    }
    return sendJson(res, 404, { ok: false, error: `unknown ${method} ${p}` })
  }

  try {
    ctx.effect(() => ctx.webServer.register({
      kind: 'prefix',
      path: '/api/ha',
      handler: async (req, res) => {
        try { await handle(req, res, new URL(req.url, 'http://127.0.0.1')) }
        catch (e) { sendJson(res, 500, { ok: false, error: String(e?.message || e) }) }
      },
    }), 'homeassistant: /api/ha 路由')
  } catch { /* 没有 webServer 也能用工具 */ }
}
