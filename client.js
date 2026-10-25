/**
 * dsh-homeassistant —— 浏览器半端：设置里的一页「家庭助理」
 */
window.__ModuleLoader__.load({
  id: 'dsh-homeassistant',
  factory: (require) => {
    const React = require('react')
    const h = React.createElement
    const API = '/api/ha'

    const getJson = async (url) => {
      const r = await fetch(url, { headers: { accept: 'application/json' } })
      if (!r.ok) throw new Error('HTTP ' + r.status)
      return r.json()
    }
    const postJson = async (url, body) => {
      const r = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body || {}),
      })
      if (!r.ok) throw new Error('HTTP ' + r.status)
      return r.json()
    }

    const TABS = [
      { key: '', label: '全部' },
      { key: 'light', label: '灯' },
      { key: 'switch', label: '开关' },
      { key: 'fan', label: '风扇' },
      { key: 'climate', label: '空调' },
      { key: 'cover', label: '窗帘' },
    ]

    const CSS = `
[data-ha-wrap]{display:flex;flex-direction:column;gap:12px;padding:6px 2px 24px;font-size:13px}
[data-ha-row]{display:flex;align-items:center;gap:10px;flex-wrap:wrap}
[data-ha-label]{width:96px;opacity:.85}
[data-ha-input]{flex:1;min-width:220px;padding:6px 9px;border-radius:7px;border:1px solid rgba(127,127,127,.35);background:transparent;color:inherit;font-size:13px}
[data-ha-btn]{padding:6px 14px;border-radius:7px;border:1px solid rgba(127,127,127,.35);background:transparent;color:inherit;cursor:pointer;font-size:13px}
[data-ha-btn]:hover{background:rgba(127,127,127,.12)}
[data-ha-btn][disabled]{opacity:.45;cursor:default}
[data-ha-msg]{font-size:12px;opacity:.78;min-height:16px}
[data-ha-note]{font-size:12px;opacity:.6;line-height:1.6}
[data-ha-tabs]{display:flex;gap:6px;flex-wrap:wrap}
[data-ha-tab]{padding:4px 12px;border-radius:999px;border:1px solid rgba(127,127,127,.3);cursor:pointer;font-size:12px}
[data-ha-tab][data-on]{background:rgba(127,127,127,.22)}
[data-ha-table]{width:100%;border-collapse:collapse;font-size:12px}
[data-ha-table] th,[data-ha-table] td{text-align:left;padding:6px;border-bottom:1px solid rgba(127,127,127,.18);vertical-align:middle}
[data-ha-tag]{font-size:11px;padding:1px 7px;border-radius:5px;background:rgba(127,127,127,.18)}
[data-ha-tag-on]{background:rgba(80,200,120,.28)}
[data-ha-range]{width:120px;vertical-align:middle}
`

    function Panel() {
      const [cfg, setCfg] = React.useState({ url: 'http://localhost:8123', hasToken: false })
      const [token, setToken] = React.useState('')
      const [entities, setEntities] = React.useState([])
      const [tab, setTab] = React.useState('')
      const [msg, setMsg] = React.useState('')
      const [busy, setBusy] = React.useState(false)

      const load = async () => {
        try {
          const c = await getJson(API + '/config')
          setCfg(c)
          if (c.hasToken) {
            const e = await getJson(API + '/entities')
            setEntities(e.entities || [])
          }
        } catch (err) { setMsg('读取失败：' + err.message) }
      }
      React.useEffect(() => { load() }, [])

      const save = async () => {
        setBusy(true); setMsg('')
        try {
          await postJson(API + '/config', { url: cfg.url, token })
          setToken('')
          setMsg('已保存')
          await load()
        } catch (err) { setMsg('保存失败：' + err.message) }
        setBusy(false)
      }

      const test = async () => {
        setBusy(true); setMsg('正在连…')
        try {
          const r = await postJson(API + '/test', {})
          setMsg(r.ok ? `连上了：HA ${r.version}，${r.states} 个实体` : '连接失败：' + (r.error || ''))
          if (r.ok) await load()
        } catch (err) { setMsg('出错：' + err.message) }
        setBusy(false)
      }

      const control = async (entity, action) => {
        setBusy(true)
        try {
          const r = await postJson(API + '/control', { entity, action })
          setMsg(r.ok ? `${entity} → ${action}` : '失败：' + (r.error || ''))
          await load()
        } catch (err) { setMsg('出错：' + err.message) }
        setBusy(false)
      }

      const setBrightness = async (entity, val) => {
        setBusy(true)
        try {
          const r = await postJson(API + '/light', { entity, brightness: Number(val) })
          setMsg(r.ok ? `${entity} 亮度 ${val}` : '失败：' + (r.error || ''))
          await load()
        } catch (err) { setMsg('出错：' + err.message) }
        setBusy(false)
      }

      const allOff = async () => {
        setBusy(true)
        try {
          const r = await postJson(API + '/all_off', { domain: tab || 'light' })
          setMsg(r.ok ? '已全部关闭' : '失败：' + (r.error || ''))
          await load()
        } catch (err) { setMsg('出错：' + err.message) }
        setBusy(false)
      }

      const shown = entities.filter((e) => !tab || e.domain === tab)

      return h('div', { 'data-ha-wrap': '' },
        h('div', { 'data-ha-note': '' },
          '先跑起 Home Assistant 并装好 Xiaomi Miot（教程见 README），再在这里填地址和长期令牌。'),

        h('div', { 'data-ha-row': '' },
          h('span', { 'data-ha-label': '' }, 'HA 地址'),
          h('input', {
            'data-ha-input': '', value: cfg.url || '',
            placeholder: 'http://localhost:8123',
            onChange: (e) => setCfg({ ...cfg, url: e.target.value }),
          }),
        ),

        h('div', { 'data-ha-row': '' },
          h('span', { 'data-ha-label': '' }, '长期令牌'),
          h('input', {
            'data-ha-input': '', type: 'password', value: token,
            placeholder: cfg.hasToken ? '已保存（留空则不修改）' : 'eyJ... 从 HA 个人资料→安全 里创建',
            onChange: (e) => setToken(e.target.value),
          }),
        ),

        h('div', { 'data-ha-row': '' },
          h('button', { 'data-ha-btn': '', onClick: save, disabled: busy }, '保存'),
          h('button', { 'data-ha-btn': '', onClick: test, disabled: busy || !cfg.hasToken }, '测试连接'),
          h('button', { 'data-ha-btn': '', onClick: load, disabled: busy }, '刷新'),
          h('button', { 'data-ha-btn': '', onClick: allOff, disabled: busy || !cfg.hasToken }, '全部关闭'),
        ),

        h('div', { 'data-ha-msg': '' }, msg),

        h('div', { 'data-ha-tabs': '' }, TABS.map((t) => h('span', {
          key: t.key,
          'data-ha-tab': '',
          'data-on': tab === t.key ? '' : undefined,
          onClick: () => setTab(t.key),
        }, t.label + (t.key ? '（' + entities.filter((e) => e.domain === t.key).length + '）' : '')))),

        shown.length
          ? h('table', { 'data-ha-table': '' },
            h('thead', null, h('tr', null,
              h('th', null, '名称'), h('th', null, '实体'), h('th', null, '状态'), h('th', null, '操作'))),
            h('tbody', null, shown.map((e, i) => h('tr', { key: i },
              h('td', null, e.name),
              h('td', { style: { fontFamily: 'monospace', opacity: .75 } }, e.entity_id),
              h('td', null,
                h('span', { 'data-ha-tag': '', 'data-ha-tag-on': e.state === 'on' ? '' : undefined }, e.state),
                e.brightness != null ? h('span', { style: { marginLeft: 6, opacity: .6 } }, Math.round(e.brightness / 255 * 100) + '%') : null,
                e.temperature != null ? h('span', { style: { marginLeft: 6, opacity: .6 } }, e.temperature + '°C') : null,
              ),
              h('td', null,
                h('button', { 'data-ha-btn': '', disabled: busy, onClick: () => control(e.entity_id, 'on') }, '开'),
                ' ',
                h('button', { 'data-ha-btn': '', disabled: busy, onClick: () => control(e.entity_id, 'off') }, '关'),
                e.domain === 'light'
                  ? h('input', {
                    'data-ha-range': '', type: 'range', min: 1, max: 255,
                    defaultValue: e.brightness || 255,
                    disabled: busy,
                    onMouseUp: (ev) => setBrightness(e.entity_id, ev.target.value),
                  })
                  : null,
              ),
            ))),
          )
          : h('div', { 'data-ha-note': '' }, '还没有实体。填好令牌后点「测试连接」。'),
      )
    }

    return {
      inject: ['slots'],
      apply(ctx) {
        const style = document.createElement('style')
        style.setAttribute('data-plugin-css', 'dsh-homeassistant')
        style.textContent = CSS
        document.head.appendChild(style)
        ctx.effect(() => () => style.remove(), 'dsh-homeassistant: 设置页样式')

        const slots = (typeof ctx.get === 'function' ? ctx.get('slots') : undefined) || ctx.slots
        if (!slots) return
        slots.inject('settings.section', () => slots.register(
          { name: 'settings.section', id: 'homeassistant', order: 46, label: '家庭助理' },
          () => h(Panel),
        ))
      },
    }
  },
})
