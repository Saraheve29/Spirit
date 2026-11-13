// Sarah's Evidence Box — list, add, edit and remove her spiritual experiences.
import { authed, readBody } from './_lib.js'
import { loadEvidence, saveEvidence, removeEvidence, getEvidence } from './_evidence.js'

export default async function handler(req, res) {
  if (!authed(req, res)) return
  try {
    if (req.method === 'GET') {
      const items = await loadEvidence()
      return res.status(200).json({ items: items.reverse() })
    }

    if (req.method === 'DELETE') {
      const id = req.query?.id
      if (!id) return res.status(400).json({ error: 'Missing id' })
      await removeEvidence(id)
      return res.status(200).json({ ok: true })
    }

    if (req.method === 'POST') {
      const body = readBody(req)
      if (!String(body.title || '').trim() && !String(body.what || '').trim()) {
        return res.status(400).json({ error: 'Write a little about the experience first.' })
      }
      if (body.id) {
        const old = await getEvidence(body.id)
        if (!old) return res.status(404).json({ error: 'That experience wasn’t found.' })
        const item = await saveEvidence({ ...old, title: body.title, when: body.when, what: body.what }, false)
        return res.status(200).json({ item })
      }
      const item = await saveEvidence({ title: body.title, when: body.when, what: body.what, addedBy: 'sarah' }, true)
      return res.status(200).json({ item })
    }

    return res.status(405).json({ error: 'Method not allowed' })
  } catch (e) {
    return res.status(500).json({ error: e.message || 'Something went wrong' })
  }
}
