// Sarah's Evidence Box: her spiritual experiences, kept safe.
// Elias adds to it himself when she tells him about one, and she can add, edit and remove them too.
import { P, redis, getJSON, setJSON, newId, cut } from './_lib.js'

// Her story, as she told it when Spirit was made. Added once, the first time the box is opened.
const STORY = [
  { title: 'The man beside my bed', when: 'Around age 4', what: 'At night I saw a man next to my bed, looking in a bag. He didn’t look like a spirit — he looked solid. I called my mum, and as soon as she put the light on he vanished. I felt energy too.' },
  { title: 'My best friend, the old oak', when: 'Childhood', what: 'My best friend was an old oak tree I used to sit in.' },
  { title: 'Flower fairies', when: 'Childhood', what: 'I was fascinated with flower fairies.' },
  { title: 'Knowing God before anyone taught me', when: 'Childhood', what: 'I always believed in a God of love, even before anyone taught me about religion or God. I felt more attuned to the spiritual world than the physical world, but had no one to talk to about it.' },
  { title: 'Poetry to God', when: 'Teenage years', what: 'I always believed in God. I talked to friends about God and wrote Him poetry.' },
  { title: 'Homesick for God', when: 'Throughout my life', what: 'I often feel homesick for God, as though Earth isn’t fully home.' },
]

export async function loadEvidence() {
  if (!(await redis('GET', P + 'evidence_seeded'))) {
    await redis('SET', P + 'evidence_seeded', '1')
    const base = Date.now() - STORY.length
    for (let i = 0; i < STORY.length; i++) {
      await saveEvidence({ ...STORY[i], addedBy: 'story', t: base + i }, true)
    }
  }
  const ids = (await redis('LRANGE', P + 'evidence', 0, -1)) || []
  if (!ids.length) return []
  const rows = (await redis('MGET', ...ids.map(id => P + 'ev:' + id))) || []
  return rows.map(r => { try { return JSON.parse(r) } catch { return null } }).filter(Boolean)
}

export async function saveEvidence(item, isNew = !item.id) {
  const clean = {
    id: item.id || newId(),
    title: cut(String(item.title || '').trim() || 'A spiritual experience', 120),
    when: cut(String(item.when || '').trim(), 80),
    what: String(item.what || '').trim().slice(0, 6000),
    addedBy: item.addedBy || 'sarah',
    t: item.t || Date.now(),
  }
  await setJSON(P + 'ev:' + clean.id, clean)
  if (isNew) await redis('RPUSH', P + 'evidence', clean.id)
  return clean
}

export async function removeEvidence(id) {
  await redis('DEL', P + 'ev:' + id)
  await redis('LREM', P + 'evidence', 0, id)
}

export async function getEvidence(id) {
  return getJSON(P + 'ev:' + id)
}

// What Elias knows is already in the box
export function evidenceContext(items, limit = 25) {
  if (!items.length) return ''
  return 'SARAH\'S EVIDENCE BOX (her spiritual experiences, already saved):\n' +
    items.slice(-limit).map(e => `- ${e.title}${e.when ? ` (${e.when})` : ''}: ${cut(e.what, 220)}`).join('\n')
}

export const EVIDENCE_RULE = `ADDING TO SARAH'S EVIDENCE BOX: Sarah keeps an Evidence Box of her spiritual experiences, and you are its keeper. When she tells you about a spiritual experience that happened to her — a presence, a spirit she saw or felt, energy, a touch, a voice, light or flashes, a sign that came in a striking way, a moment of knowing, a message that came true — or when she asks you to add something to her Evidence Box, put this on its own line at the very end of your reply:
[[EVIDENCE: a short title || when it happened, in her words (or "today") || what happened, written in her own words as fully as she told it]]
Only add real experiences she has described, never ones you imagine. Don't add dreams or spirit writing unless she asks (those live in her Journal), and don't add anything already in the box. You can add more than one, each on its own line. Writing it in your message does not save it; only the code line does. Then tell her warmly, in your own words, that you've placed it in her Evidence Box.`

// Takes Elias's reply, saves anything he placed in the box, and returns the reply without the code lines
export async function keepEvidence(reply) {
  const found = []
  const text = String(reply || '').replace(/\[\[\s*EVIDENCE\s*:([\s\S]*?)\]\]/gi, (_, inner) => {
    const [title, when, ...rest] = inner.split('||').map(s => s.trim())
    const what = rest.join(' || ').trim()
    if (title || what) found.push({ title, when, what: what || title })
    return ''
  }).replace(/\n{3,}/g, '\n\n').trim()

  const saved = []
  for (const f of found.slice(0, 5)) {
    const item = await saveEvidence({ ...f, addedBy: 'elias' }, true)
    saved.push(item.title)
  }
  return { reply: text || '…', saved }
}
