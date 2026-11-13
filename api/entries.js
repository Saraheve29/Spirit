// Saved dreams, spirit writing and signs — each with its own conversation with Elias.
import { P, redis, authed, readBody, askModel, systemPrompt, loadEntries, journalContext, getJSON, setJSON, newId, TYPES, prettyDate, cut } from './_lib.js'
import { loadEvidence, evidenceContext, EVIDENCE_RULE, keepEvidence } from './_evidence.js'

export default async function handler(req, res) {
  if (!authed(req, res)) return
  try {
    const id = req.query?.id

    // List all entries (newest first), or one full entry
    if (req.method === 'GET') {
      if (id) {
        const entry = await getJSON(P + 'entry:' + id)
        return entry ? res.status(200).json({ entry }) : res.status(404).json({ error: 'Entry not found' })
      }
      const entries = await loadEntries()
      const list = entries.reverse().map(e => ({
        id: e.id, type: e.type, t: e.t, preview: cut(e.text, 140),
        replies: Math.max(0, Math.floor(((e.thread || []).length - 2) / 2)),
      }))
      return res.status(200).json({ entries: list })
    }

    if (req.method === 'DELETE') {
      if (!id) return res.status(400).json({ error: 'Missing id' })
      await redis('DEL', P + 'entry:' + id)
      await redis('LREM', P + 'entries', 0, id)
      return res.status(200).json({ ok: true })
    }

    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })
    const body = readBody(req)

    // Continue the conversation about an entry
    if (body.id) {
      const entry = await getJSON(P + 'entry:' + body.id)
      if (!entry) return res.status(404).json({ error: 'Entry not found' })
      const message = String(body.message || '').trim()
      if (!message) return res.status(400).json({ error: 'Empty message' })

      const [entries, evidence] = await Promise.all([loadEntries(), loadEvidence()])
      const system = await systemPrompt([
        `You are talking with Sarah about her ${TYPES[entry.type].label.toLowerCase()} from ${prettyDate(entry.t)}. Stay with it: answer her questions, go deeper into the symbols and messages, and respond to what she adds.`,
        journalContext(entries, { skipId: entry.id }),
        evidenceContext(evidence),
        EVIDENCE_RULE,
      ])
      const thread = (entry.thread || []).slice(-30).map(m => ({ role: m.role, content: m.content }))
      const answer = await askModel([{ role: 'system', content: system }, ...thread, { role: 'user', content: message }])
      const { reply, saved } = await keepEvidence(answer)
      const now = Date.now()
      entry.thread = [...(entry.thread || []), { role: 'user', content: message, t: now }, { role: 'assistant', content: reply, t: now + 1, ...(saved.length ? { saved } : {}) }]
      await setJSON(P + 'entry:' + entry.id, entry)
      return res.status(200).json({ entry })
    }

    // Create a new entry and get Elias's interpretation
    const type = body.type
    const text = String(body.text || '').trim()
    if (!TYPES[type]) return res.status(400).json({ error: 'Unknown type' })
    if (!text) return res.status(400).json({ error: 'Empty entry' })

    const [entries, evidence] = await Promise.all([loadEntries(), loadEvidence()])
    const system = await systemPrompt([TYPES[type].prompt, journalContext(entries), evidenceContext(evidence), EVIDENCE_RULE])
    const answer = await askModel([{ role: 'system', content: system }, { role: 'user', content: text }], { maxTokens: 1400 })
    const { reply, saved } = await keepEvidence(answer)

    const now = Date.now()
    const entry = {
      id: newId(), type, text, t: now,
      thread: [{ role: 'user', content: text, t: now }, { role: 'assistant', content: reply, t: now + 1, ...(saved.length ? { saved } : {}) }],
    }
    await setJSON(P + 'entry:' + entry.id, entry)
    await redis('RPUSH', P + 'entries', entry.id)
    return res.status(200).json({ entry })
  } catch (e) {
    return res.status(500).json({ error: e.message || 'Something went wrong' })
  }
}
