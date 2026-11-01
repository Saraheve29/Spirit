import { P, redis, authed, listModels, DEFAULT_PROFILE } from './_lib.js'

export default async function handler(req, res) {
  if (!authed(req, res)) return
  try {
    if (req.method === 'GET') {
      const [profile, model] = await Promise.all([redis('GET', P + 'profile'), redis('GET', P + 'model')])
      const models = req.query && req.query.models === '1' ? await listModels() : []
      return res.status(200).json({ profile: profile || DEFAULT_PROFILE, model: model || '', models })
    }

    if (req.method === 'POST') {
      const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {})
      if (typeof body.profile === 'string') await redis('SET', P + 'profile', body.profile)
      if (typeof body.model === 'string') await redis('SET', P + 'model', body.model.trim())
      return res.status(200).json({ ok: true })
    }

    return res.status(405).json({ error: 'Method not allowed' })
  } catch (e) {
    return res.status(500).json({ error: e.message || 'Something went wrong' })
  }
}
