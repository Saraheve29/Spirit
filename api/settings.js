import { P, redis, authed, readBody, listModels, getProfile, DEFAULT_PROFILE, DEFAULT_MODEL, PROFILE_VERSION } from './_lib.js'

export default async function handler(req, res) {
  if (!authed(req, res)) return
  try {
    if (req.method === 'GET') {
      const [profile, model] = await Promise.all([getProfile(), redis('GET', P + 'model')])
      const models = req.query && req.query.models === '1' ? await listModels() : []
      return res.status(200).json({ profile, model: model || DEFAULT_MODEL, models })
    }

    if (req.method === 'POST') {
      const body = readBody(req)
      if (body.resetProfile) {
        await redis('SET', P + 'profile', DEFAULT_PROFILE)
        await redis('SET', P + 'profile_v', String(PROFILE_VERSION))
      } else if (typeof body.profile === 'string' && body.profile.trim()) {
        await redis('SET', P + 'profile', body.profile)
        await redis('SET', P + 'profile_v', String(PROFILE_VERSION))
      }
      if (typeof body.model === 'string' && body.model.trim()) await redis('SET', P + 'model', body.model.trim())
      return res.status(200).json({ ok: true })
    }

    return res.status(405).json({ error: 'Method not allowed' })
  } catch (e) {
    return res.status(500).json({ error: e.message || 'Something went wrong' })
  }
}
