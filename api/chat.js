import { P, redis, authed, readBody, askModel, systemPrompt, loadEntries, journalContext } from './_lib.js'

const KEEP = 300      // messages saved in Talk history
const CONTEXT = 30    // recent messages Elias reads each time

export async function loadHistory() {
  const rows = (await redis('LRANGE', P + 'history', -KEEP, -1)) || []
  return rows.map(r => { try { return JSON.parse(r) } catch { return null } }).filter(Boolean)
}

export default async function handler(req, res) {
  if (!authed(req, res)) return
  try {
    if (req.method === 'GET') return res.status(200).json({ history: await loadHistory() })

    if (req.method === 'DELETE') {
      await redis('DEL', P + 'history')
      return res.status(200).json({ ok: true })
    }

    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

    const message = String(readBody(req).message || '').trim()
    if (!message) return res.status(400).json({ error: 'Empty message' })

    const [history, entries] = await Promise.all([loadHistory(), loadEntries()])
    const system = await systemPrompt([journalContext(entries)])
    const recent = history.slice(-CONTEXT).map(m => ({ role: m.role, content: m.content }))
    const reply = await askModel([{ role: 'system', content: system }, ...recent, { role: 'user', content: message }])

    const now = Date.now()
    const userRow = { role: 'user', content: message, t: now }
    const elRow = { role: 'assistant', content: reply, t: now + 1 }
    await redis('RPUSH', P + 'history', JSON.stringify(userRow), JSON.stringify(elRow))
    await redis('LTRIM', P + 'history', -KEEP, -1)

    return res.status(200).json({ user: userRow, elias: elRow })
  } catch (e) {
    return res.status(500).json({ error: e.message || 'Something went wrong' })
  }
}
