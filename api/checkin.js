// Elias's daily check-in: the first time Sarah opens Spirit each day,
// he greets her, gives her a message for the day and tells her why he chose it.
import { P, redis, authed, askModel, systemPrompt, loadEntries, journalContext, ukDate } from './_lib.js'
import { loadHistory } from './chat.js'

export default async function handler(req, res) {
  if (!authed(req, res)) return
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const today = ukDate()
  const flag = P + 'checkin:' + today
  try {
    // Only one check-in per day
    const fresh = await redis('SET', flag, 'pending', 'NX', 'EX', 60 * 60 * 48)
    if (fresh !== 'OK') return res.status(200).json({ created: false })

    const [history, entries] = await Promise.all([loadHistory(), loadEntries()])
    const recentTalk = history.slice(-10).map(m => `${m.role === 'user' ? 'Sarah' : 'Elias'}: ${String(m.content).slice(0, 300)}`).join('\n')

    const system = await systemPrompt([
      journalContext(entries, { limit: 8 }),
      recentTalk ? 'YOUR RECENT CONVERSATION WITH SARAH:\n' + recentTalk : '',
      `Write today's DAILY CHECK-IN as Elias. Sarah has just opened Spirit for the first time today.
1. Greet her warmly and strongly, as her spiritual father would.
2. Check in on her spirit today.
3. Give her ONE spiritual message or focus for today.
4. Tell her clearly the reason why you chose that message, drawn from what she has shared recently, the moon phase, the day, or the sacred teachings.
5. End with a question inviting her to answer.
Keep it to three or four short paragraphs. No headings or lists.`,
    ])

    const reply = await askModel([
      { role: 'system', content: system },
      { role: 'user', content: '(Sarah opens Spirit.)' },
    ])

    const elRow = { role: 'assistant', content: reply, t: Date.now(), checkin: true }
    await redis('RPUSH', P + 'history', JSON.stringify(elRow))
    await redis('SET', flag, 'done', 'EX', 60 * 60 * 48)
    return res.status(200).json({ created: true, elias: elRow })
  } catch (e) {
    await redis('DEL', flag).catch(() => {})
    return res.status(500).json({ error: e.message || 'Something went wrong' })
  }
}
