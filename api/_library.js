// Sarah's Library: everything Elias reads, kept so she can read it too.
//  • "Sources" — the actual text he read for each study (Wikipedia articles and web findings)
//  • "Books"   — whole sacred and spiritual classics from Project Gutenberg (free, out of copyright),
//                read page by page, with chapters, his voice, and a conversation with him about each page
import { P, redis, getJSON, setJSON, newId, cut } from './_lib.js'

const UA = 'SpiritGuideApp/1.0 (https://github.com/Saraheve29/spirit; personal non-commercial app)'
const HEADERS = { 'User-Agent': UA, 'Api-User-Agent': UA }
export const PAGE = 4500

// Classics Elias can suggest and Sarah can tap to add
export const SUGGESTED_BOOKS = [
  'Bhagavad Gita', 'The Upanishads', 'Tao Te Ching', 'The Dhammapada', 'The Prophet Gibran',
  'Meditations Marcus Aurelius', 'The Imitation of Christ', 'The Cloud of Unknowing', 'Gitanjali Tagore',
  'The Varieties of Religious Experience', 'Siddhartha', 'The Kybalion',
]

// ---------- Storage ----------
export async function loadLibrary() {
  const ids = (await redis('LRANGE', P + 'library', 0, -1)) || []
  if (!ids.length) return []
  const rows = (await redis('MGET', ...ids.map(id => P + 'lib:' + id))) || []
  return rows.map(r => { try { return JSON.parse(r) } catch { return null } }).filter(Boolean)
}
export async function getItem(id) { return getJSON(P + 'lib:' + id) }
export async function saveItem(item) { return setJSON(P + 'lib:' + item.id, item) }
export async function addItem(item) {
  const full = { id: newId(), t: Date.now(), thread: [], ...item }
  await saveItem(full)
  await redis('RPUSH', P + 'library', full.id)
  return full
}
export async function removeItem(id) {
  await redis('DEL', P + 'lib:' + id)
  await redis('LREM', P + 'library', 0, id)
}

// ---------- Sources from a study ----------
export async function saveStudySources(study, lookups) {
  const saved = []
  for (const l of lookups) {
    if (!l?.text) continue
    const item = await addItem({
      kind: 'source',
      title: l.title.replace(/^Wikipedia:\s*/, 'Wikipedia — ').replace(/^Web:\s*/, 'From the web — '),
      text: String(l.text).slice(0, 12000),
      url: l.url || '',
      studyId: study.id,
      studyTopic: study.topic,
      addedBy: 'elias',
    })
    saved.push({ id: item.id, title: item.title })
  }
  return saved
}

// ---------- Books from Project Gutenberg ----------
const plainTextUrl = (f = {}) => {
  const u = f['text/plain; charset=utf-8'] || f['text/plain; charset=us-ascii'] || f['text/plain']
  return u && !u.endsWith('.zip') ? u : ''
}

export async function findBook(query) {
  const clean = String(query || '').replace(/[“”"'*_#\[\]]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80)
  if (!clean) return null
  const r = await fetch(`https://gutendex.com/books?search=${encodeURIComponent(clean)}`, { headers: { ...HEADERS, Accept: 'application/json' } })
  if (!r.ok) throw new Error(`The free book library answered ${r.status}`)
  const d = await r.json()
  for (const b of d.results || []) {
    const url = plainTextUrl(b.formats)
    if (url) return { gutenbergId: b.id, title: b.title, author: b.authors?.[0]?.name || '', bookUrl: url }
  }
  return null
}

export async function addBook(query, addedBy = 'sarah', why = '') {
  const found = await findBook(query)
  if (!found) return null
  const all = await loadLibrary()
  const existing = all.find(x => x.kind === 'book' && x.gutenbergId === found.gutenbergId)
  if (existing) return existing
  return addItem({ kind: 'book', ...found, pos: 0, addedBy, why: cut(why, 300) })
}

// Whole book as clean text (Gutenberg's licence header and footer removed)
export async function loadBookText(item) {
  const r = await fetch(item.bookUrl, { headers: HEADERS })
  if (!r.ok) throw new Error(`Project Gutenberg answered ${r.status}`)
  let text = await r.text()
  const start = text.search(/\*\*\*\s*START OF/i)
  if (start >= 0) text = text.slice(text.indexOf('\n', start) + 1)
  const end = text.search(/\*\*\*\s*END OF/i)
  if (end > 0) text = text.slice(0, end)
  return text.replace(/\r/g, '')
}

// Chapter headings (CHAPTER I, Book Two, Discourse…); [] when none can be recognised
export function findChapters(text) {
  const re = /^[ \t]*((?:CHAPTER|Chapter|BOOK|Book|PART|Part|DISCOURSE|Discourse|CANTO|Canto|SUTRA|Sutra|LECTURE|Lecture|VOLUME|Volume)[ \t]+(?:[IVXLCDM]+|\d+|[A-Za-z]+)\b[^\n]{0,60})[ \t]*$/gm
  const found = []
  let m
  while ((m = re.exec(text))) found.push({ title: m[1].trim().replace(/\s+/g, ' '), pos: m.index })
  const real = found.filter((c, i) => (found[i + 1] ? found[i + 1].pos - c.pos >= 500 : text.length - c.pos >= 500))
  return real.length >= 3 ? real.slice(0, 150) : []
}

// One page (~4,500 characters) starting at pos
export function bookPage(text, wanted, chapters = findChapters(text)) {
  const pos = Math.min(Math.max(0, Number(wanted) || 0), Math.max(0, text.length - 1))
  let start = pos
  if (start > 0 && !/\s/.test(text[start - 1])) { const n = text.indexOf(' ', start); if (n >= 0 && n - start < 40) start = n + 1 } // never open mid-word
  const chunk = text.slice(start, start + PAGE)
  const nl = chunk.lastIndexOf('\n\n')
  const end = start + PAGE >= text.length ? chunk.length : (nl > PAGE * 0.6 ? nl : chunk.lastIndexOf(' '))
  const page = chunk.slice(0, end > 0 ? end : chunk.length)
  const nextPos = start + page.length < text.length ? start + page.length : null
  const idx = chapters.reduce((a, c, i) => (c.pos <= start ? i : a), -1)
  return {
    text: page.trim(), pos: start, nextPos, prevPos: start > 0 ? Math.max(0, start - PAGE) : null,
    total: text.length, chapter: idx >= 0 ? chapters[idx].title : '',
  }
}

// ---------- Elias adding books himself ----------
export const LIBRARY_RULE = `ADDING TO SARAH'S LIBRARY: Sarah has a Library where she can read whole classic texts. When you draw deeply on a classic spiritual or philosophical book that is old enough to be free to read (for example the Bhagavad Gita, the Upanishads, the Tao Te Ching, the Dhammapada, Gibran's The Prophet, Marcus Aurelius, Tagore, the Imitation of Christ), or when she asks you to add a book to her Library, put this on its own line at the very end of your reply:
[[LIBRARY: the book's title and author]]
Then tell her it's waiting in her Library. Don't add modern books (they aren't free), and only add a book when it truly matters to what you're sharing.`

export async function keepBooks(reply) {
  const wanted = []
  const text = String(reply || '').replace(/\[\[\s*LIBRARY\s*:([\s\S]*?)\]\]/gi, (_, t) => { if (t.trim()) wanted.push(t.trim()); return '' })
    .replace(/\n{3,}/g, '\n\n').trim()
  const added = []
  for (const w of wanted.slice(0, 2)) {
    try {
      const b = await addBook(w, 'elias')
      if (b) added.push({ id: b.id, title: b.title })
    } catch { /* the book library was unreachable — skip */ }
  }
  return { reply: text || '…', books: added }
}

export function libraryContext(items) {
  const books = items.filter(x => x.kind === 'book').map(b => `${b.title}${b.author ? ` (${b.author})` : ''}`)
  return books.length ? `BOOKS ALREADY IN SARAH'S LIBRARY: ${books.slice(-15).join('; ')}.` : ''
}
