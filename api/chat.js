import { P, redis, authed, askModel, MODES, BASE_RULES, DEFAULT_PROFILE } from './_lib.js'

const KEEP = 300      // messages saved in history
const CONTEXT = 30    // recent messages Elias reads each time

async function loadHistory() {
  const rows = (await redis('LRANGE', P + 'history', -KEEP, -1)) || []
  return rows.map(r => { try { return JSON.parse(r) } catch { return null } }).filter(Boolean)
}

export default async function handler(req, res) {
  if (!authed(req, res)) return
  try {
    // Load the conversation
    if (req.method === 'GET') {
      return res.status(200).json({ history: await loadHistory() })
    }

    // Clear the conversation (his profile stays)
    if (req.method === 'DELETE') {
      await redis('DEL', P + 'history')
      return res.status(200).json({ ok: true })
    }

    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {})
    const message = String(body.message || '').trim()
    const mode = MODES[body.mode] !== undefined ? body.mode : 'chat'
    if (!message) return res.status(400).json({ error: 'Empty message' })

    const model = await redis('GET', P + 'model')
    if (!model) return res.status(400).json({ error: 'Pick a model in Settings first.' })
    const profile = (await redis('GET', P + 'profile')) || DEFAULT_PROFILE

    const history = await loadHistory()
    const recent = history.slice(-CONTEXT).map(m => ({
      role: m.role,
      content: m.mode && m.mode !== 'chat' && m.role === 'user' ? `[${m.mode}] ${m.content}` : m.content,
    }))

    const system = [BASE_RULES, profile, MODES[mode]].filter(Boolean).join('\n\n')
    const messages = [{ role: 'system', content: system }, ...recent, { role: 'user', content: message }]

    const reply = await askModel(model, messages)
    const now = Date.now()
    const userRow = { role: 'user', content: message, mode, t: now }
    const elRow = { role: 'assistant', content: reply || '…', mode, t: now + 1 }

    await redis('RPUSH', P + 'history', JSON.stringify(userRow), JSON.stringify(elRow))
    await redis('LTRIM', P + 'history', -KEEP, -1)

    return res.status(200).json({ reply: elRow.content, user: userRow, elias: elRow })
  } catch (e) {
    return res.status(500).json({ error: e.message || 'Something went wrong' })
  }
}
