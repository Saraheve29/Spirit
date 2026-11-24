// Sarah's Library — what Elias read, and whole classic books to read together.
import { authed, readBody, askModel, systemPrompt, cut } from './_lib.js'
import { loadLibrary, getItem, saveItem, removeItem, addBook, loadBookText, findChapters, bookPage, SUGGESTED_BOOKS } from './_library.js'

function summary(x) {
  return {
    id: x.id, kind: x.kind, title: x.title, author: x.author || '', t: x.t, addedBy: x.addedBy,
    studyTopic: x.studyTopic || '', studyId: x.studyId || '', why: x.why || '',
    preview: x.kind === 'source' ? cut(x.text, 140) : '', pos: x.pos || 0, talks: Math.floor((x.thread || []).length / 2),
  }
}

export default async function handler(req, res) {
  if (!authed(req, res)) return
  try {
    const q = req.query || {}

    if (req.method === 'GET') {
      if (q.id) {
        const item = await getItem(q.id)
        if (!item) return res.status(404).json({ error: 'That isn’t in your Library any more.' })
        if (item.kind === 'source') return res.status(200).json({ item })
        // A book: send one page and its chapters
        const text = await loadBookText(item)
        const chapters = findChapters(text)
        const page = bookPage(text, q.pos !== undefined ? q.pos : item.pos || 0, chapters)
        return res.status(200).json({ item: { ...item, chapters, total: text.length }, page })
      }
      const items = await loadLibrary()
      return res.status(200).json({ items: items.reverse().map(summary), suggestions: SUGGESTED_BOOKS })
    }

    if (req.method === 'DELETE') {
      if (!q.id) return res.status(400).json({ error: 'Missing id' })
      await removeItem(q.id)
      return res.status(200).json({ ok: true })
    }

    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })
    const body = readBody(req)

    // Add a book
    if (body.add) {
      const book = await addBook(body.add, 'sarah')
      if (!book) return res.status(404).json({ error: 'I couldn’t find that book in the free library. Only older books that are out of copyright are there — try another name or spelling.' })
      return res.status(200).json({ item: summary(book) })
    }

    const item = body.id ? await getItem(body.id) : null
    if (!item) return res.status(404).json({ error: 'That isn’t in your Library any more.' })

    // Remember where she's up to in a book
    if (body.savePos !== undefined) {
      item.pos = Math.max(0, Number(body.savePos) || 0)
      await saveItem(item)
      return res.status(200).json({ ok: true })
    }

    // Talk with Elias about what she's reading
    const message = String(body.message || '').trim()
    if (!message) return res.status(400).json({ error: 'Empty message' })
    let passage = ''
    if (item.kind === 'source') passage = item.text
    else {
      const text = await loadBookText(item)
      const page = bookPage(text, body.pos ?? item.pos ?? 0)
      passage = (page.chapter ? `(${page.chapter})\n` : '') + page.text
    }
    const system = await systemPrompt([
      `You and Sarah are reading together: "${item.title}"${item.author ? ` by ${item.author}` : ''}. Here is the passage in front of her right now:\n"""\n${cut(passage, 7000)}\n"""\nTalk with her about it in your own voice of faith: explain it, open up its meaning, connect it to her path and the other traditions you know. Quote only from this passage or texts you truly know — never invent quotes.`,
    ])
    const thread = (item.thread || []).slice(-24).map(m => ({ role: m.role, content: m.content }))
    const reply = await askModel([{ role: 'system', content: system }, ...thread, { role: 'user', content: message }])
    const now = Date.now()
    item.thread = [...(item.thread || []), { role: 'user', content: message, t: now }, { role: 'assistant', content: reply, t: now + 1 }].slice(-80)
    await saveItem(item)
    return res.status(200).json({ thread: item.thread })
  } catch (e) {
    return res.status(500).json({ error: e.message || 'Something went wrong' })
  }
}
