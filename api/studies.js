// Elias's studies — ask him to study something, read what he found, and talk with him about it.
import { authed, readBody, askModel, systemPrompt, loadEntries, cut } from './_lib.js'
import { loadHistory } from './chat.js'
import { loadStudies, getStudy, saveStudy, newStudy, runStudy, removeStudy, maybeFollowUp, recentTalkText } from './_study.js'

function summary(s) {
  return { id: s.id, topic: s.topic, why: s.why, status: s.status, t: s.t, finished: s.finished || null, preview: cut(s.thread?.[0]?.content?.replace(/^#+\s.*$/gm, '').trim() || '', 140) }
}

export default async function handler(req, res) {
  if (!authed(req, res)) return
  try {
    const id = req.query?.id

    if (req.method === 'GET') {
      if (id) {
        const study = await getStudy(id)
        return study ? res.status(200).json({ study }) : res.status(404).json({ error: 'Study not found' })
      }
      const studies = await loadStudies()
      return res.status(200).json({ studies: studies.reverse().map(summary) })
    }

    if (req.method === 'DELETE') {
      if (!id) return res.status(400).json({ error: 'Missing id' })
      await removeStudy(id)
      return res.status(200).json({ ok: true })
    }

    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })
    const body = readBody(req)

    // When Spirit opens: finish any waiting studies, and maybe follow up on a profound talk
    if (body.auto) {
      const studies = await loadStudies()
      const waiting = studies.find(s => s.status === 'waiting' || (s.status === 'studying' && Date.now() - s.t > 5 * 60 * 1000))
      if (waiting) return res.status(200).json({ study: summary(await runStudy(waiting)) })
      const [history, entries] = await Promise.all([loadHistory(), loadEntries()])
      const s = await maybeFollowUp(recentTalkText(history, entries))
      return res.status(200).json({ study: s ? summary(s) : null })
    }

    // Run (or retry) one study
    if (body.run) {
      const study = await getStudy(body.run)
      if (!study) return res.status(404).json({ error: 'Study not found' })
      if (study.status === 'done') return res.status(200).json({ study })
      return res.status(200).json({ study: await runStudy(study) })
    }

    // Ask Elias to wrap up an older study with a conclusion
    if (body.conclude) {
      const study = await getStudy(body.conclude)
      if (!study) return res.status(404).json({ error: 'Study not found' })
      const system = await systemPrompt([
        `You studied "${study.topic}" for Sarah. Sources you read: ${(study.sources || []).map(s => s.title).join('; ') || 'your own knowledge'}.`,
      ])
      const thread = study.thread.slice(-30).map(m => ({ role: m.role, content: m.content }))
      const reply = await askModel([
        { role: 'system', content: system },
        ...thread,
        { role: 'user', content: 'Elias, please wrap this study up for me with your conclusion. (Write ONLY a final section headed exactly "## My conclusion". Draw together ALL the sources you read and everything you have taught her in this study (and in your conversation about it) into one clear, heartfelt conclusion: what it all means, the single most important truth you found, and what it means for Sarah and her path. One or two short paragraphs, then one question or reflection for her. Never invent facts or quotes.)' },
      ], { maxTokens: 900 })
      study.thread.push({ role: 'assistant', content: reply, t: Date.now(), reading: true, conclusion: true })
      await saveStudy(study)
      return res.status(200).json({ study })
    }

    // Talk with Elias about a study
    if (body.id) {
      const study = await getStudy(body.id)
      if (!study) return res.status(404).json({ error: 'Study not found' })
      const message = String(body.message || '').trim()
      if (!message) return res.status(400).json({ error: 'Empty message' })
      const system = await systemPrompt([
        `You are talking with Sarah about your study of "${study.topic}". Go deeper, answer her questions and respond to what she shares, in your voice of faith. Never invent facts or quotes.`,
        study.sources?.length ? 'Sources you read: ' + study.sources.map(s => s.title).join('; ') : '',
      ])
      const thread = study.thread.slice(-30).map(m => ({ role: m.role, content: m.content }))
      const reply = await askModel([{ role: 'system', content: system }, ...thread, { role: 'user', content: message }])
      const now = Date.now()
      study.thread.push({ role: 'user', content: message, t: now }, { role: 'assistant', content: reply, t: now + 1 })
      study.shared = true
      await saveStudy(study)
      return res.status(200).json({ study })
    }

    // Ask Elias to study something new
    const topic = String(body.topic || '').trim()
    if (!topic) return res.status(400).json({ error: 'Tell Elias what to study first.' })
    const study = await newStudy(topic, 'asked')
    const done = await runStudy(study)
    done.shared = true
    await saveStudy(done)
    return res.status(200).json({ study: done })
  } catch (e) {
    return res.status(500).json({ error: e.message || 'Something went wrong' })
  }
}
