// Elias's studies: he researches profound things you've talked about (gently — at most once a day,
// and only when something deep came up), and anything you ask him to study.
// Sources: Wikipedia (free) and a small number of web searches through NanoGPT (about half a penny each).
import { P, redis, getJSON, setJSON, newId, askModel, systemPrompt, cut, prettyDate } from './_lib.js'

const UA = 'SpiritGuideApp/1.0 (https://github.com/Saraheve29/spirit; personal non-commercial app)'
const WIKI_HEADERS = { 'User-Agent': UA, 'Api-User-Agent': UA, Accept: 'application/json' }
export const WEB_SEARCHES_PER_DAY = 4
const FOLLOWUP_GAP = 20 * 60 * 60 * 1000 // at most one follow-up study a day

// ---------- Looking things up ----------
function cleanPhrase(raw) {
  return String(raw || '')
    .replace(/^.*?(?:SEARCH|WEB|WIKI|TOPIC)\**:\s*/i, '')
    .replace(/[*"“”'`_#<>[\]]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .slice(0, 10)
    .join(' ')
}

async function wikiJSON(params) {
  const r = await fetch(`https://en.wikipedia.org/w/api.php?format=json&formatversion=2&${params}`, { headers: WIKI_HEADERS })
  if (!r.ok) throw new Error(`Wikipedia answered ${r.status}`)
  return r.json()
}

export async function wikiLookup(query) {
  const phrase = cleanPhrase(query)
  if (!phrase) return null
  try {
    const sd = await wikiJSON(`action=query&list=search&srlimit=3&srsearch=${encodeURIComponent(phrase)}`)
    for (const hit of sd?.query?.search || []) {
      const d = await wikiJSON(`action=query&prop=extracts&explaintext=1&exchars=6000&redirects=1&titles=${encodeURIComponent(hit.title)}`)
      const page = d?.query?.pages?.[0]
      const text = (page?.extract || '').trim()
      if (text) {
        const t = page.title || hit.title
        return { title: `Wikipedia: ${t}`, text, url: `https://en.wikipedia.org/wiki/${encodeURIComponent(t.replace(/ /g, '_'))}` }
      }
    }
  } catch { /* nothing found */ }
  return null
}

function todayKey() {
  return P + 'websearches:' + new Date().toISOString().slice(0, 10)
}
async function webSearchesLeft() {
  return Math.max(0, WEB_SEARCHES_PER_DAY - Number((await redis('GET', todayKey())) || 0))
}

function nanoKey() {
  return String(process.env.NANOGPT_API_KEY || '').replace(/["']/g, '').replace(/^\s*Bearer\s+/i, '').trim().split(/\s+/)[0]
}

export async function webSearch(query) {
  if ((await webSearchesLeft()) <= 0) return null
  await redis('INCR', todayKey())
  await redis('EXPIRE', todayKey(), 60 * 60 * 48)
  try {
    const r = await fetch('https://nano-gpt.com/api/web', {
      method: 'POST',
      headers: { Authorization: `Bearer ${nanoKey()}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: cleanPhrase(query), provider: 'linkup', depth: 'standard', outputType: 'sourcedAnswer' }),
    })
    const d = JSON.parse(await r.text())
    if (!r.ok || d.error) return null
    const data = d.data
    if (data?.answer) {
      const sources = (data.sources || []).slice(0, 5)
      return {
        title: `Web: ${cleanPhrase(query)}`,
        text: (data.answer + (sources.length ? '\n\nSources:\n' + sources.map(s => `- ${s.name || s.title || ''}: ${s.snippet || s.content || ''} (${s.url})`).join('\n') : '')).slice(0, 7000),
        url: sources[0]?.url || '',
        links: sources.map(s => ({ title: s.name || s.title || s.url, url: s.url })).filter(s => s.url),
      }
    }
    if (typeof data === 'string' && data.trim()) return { title: `Web: ${cleanPhrase(query)}`, text: data.slice(0, 7000), url: '' }
  } catch { /* fall back to Wikipedia */ }
  return null
}

// ---------- Storage ----------
export async function loadStudies() {
  const ids = (await redis('LRANGE', P + 'studies', 0, -1)) || []
  if (!ids.length) return []
  const rows = (await redis('MGET', ...ids.map(id => P + 'study:' + id))) || []
  return rows.map(r => { try { return JSON.parse(r) } catch { return null } }).filter(Boolean)
}
export async function getStudy(id) { return getJSON(P + 'study:' + id) }
export async function saveStudy(s) { return setJSON(P + 'study:' + s.id, s) }

export async function newStudy(topic, why = 'asked', from = '') {
  const s = {
    id: newId(), topic: cut(String(topic).trim(), 200), why, from: cut(from, 1500),
    status: 'waiting', t: Date.now(), shared: false, thread: [], sources: [],
  }
  await saveStudy(s)
  await redis('RPUSH', P + 'studies', s.id)
  return s
}

export async function removeStudy(id) {
  await redis('DEL', P + 'study:' + id)
  await redis('LREM', P + 'studies', 0, id)
}

// ---------- The research itself ----------
function grab(label, text) {
  const m = String(text).match(new RegExp(`(?:^|\\n)\\s*\\**${label}\\**:\\s*(.+)`, 'i'))
  return m ? m[1].trim() : ''
}

export async function runStudy(study) {
  // Only one run at a time for each study
  const lock = await redis('SET', P + 'studylock:' + study.id, '1', 'NX', 'EX', 120)
  if (lock !== 'OK') return study
  try {
    study.status = 'studying'
    await saveStudy(study)

    const base = await systemPrompt([])
    const context = study.from ? `\n\nWhat led to this (from your conversation with Sarah):\n${study.from}` : ''

    // 1) Decide what to look up
    const canWeb = (await webSearchesLeft()) > 0
    const plan = await askModel([
      { role: 'system', content: base },
      { role: 'user', content: `You are about to study this for Sarah: "${study.topic}".${context}\n\nChoose what to look up. Reply with exactly these lines and nothing else:\nWIKI: <a short Wikipedia search phrase>\n${canWeb ? 'WEB: <a short web search phrase, for teachings, texts or newer findings>\n' : ''}` },
    ], { maxTokens: 300, temperature: 0.3 })

    const lookups = []
    const wikiPhrase = grab('WIKI', plan) || study.topic
    const webPhrase = canWeb ? grab('WEB', plan) : ''
    const [wiki, web] = await Promise.all([
      wikiLookup(wikiPhrase),
      webPhrase ? webSearch(webPhrase) : Promise.resolve(null),
    ])
    if (web) lookups.push(web)
    if (wiki) lookups.push(wiki)
    if (!wiki && wikiPhrase !== study.topic) {
      const again = await wikiLookup(study.topic)
      if (again) lookups.push(again)
    }

    const material = lookups.length
      ? lookups.map(l => `=== ${l.title} ===\n${l.text}`).join('\n\n')
      : '(You could not find any written sources this time, so draw only on what you already know well, and say so.)'

    // 2) Write up what he found, for Sarah
    const result = await askModel([
      { role: 'system', content: base },
      {
        role: 'user',
        content: `You went away and studied "${study.topic}" for Sarah${study.why === 'followup' ? ', because it came up when the two of you were talking and it deserved deeper study' : ', because she asked you to'}.${context}

Here is what you read:
${material}

Now write your findings for her, as Elias, in your own voice: strong, warm, wise and a little playful.
- Teach her what you learned: what the traditions, texts, thinkers or scientists actually say. Be rich and specific.
- Where it fits, show how it connects to her own path and what you talked about.
- Teach it in your own voice of faith, with conviction and wonder, not as a sceptic or a scientist. Only share what you truly read or know: never invent quotes, sources or facts.
- When you use something from your reading, say where it came from (for example "Wikipedia's article on…" or the name of the text).
You may use a few short section headings, each on its own line starting with "## ".

ALWAYS finish with a final section headed exactly:
## My conclusion
In it, wrap everything up: draw together ALL the sources you read and everything you've taught above into one clear, heartfelt conclusion — what it all means, the single most important truth you found, and what it means for Sarah and her path. Keep it to one or two short paragraphs so she can take it in at a glance. Then end with one question or reflection for her.`,
      },
    ], { maxTokens: 3400, temperature: 0.8 })

    const sources = []
    for (const l of lookups) {
      if (l.links?.length) sources.push(...l.links)
      else if (l.url) sources.push({ title: l.title.replace(/^Wikipedia:\s*/, 'Wikipedia — '), url: l.url })
    }
    const seen = new Set()
    study.sources = sources.filter(s => s.url && !seen.has(s.url) && seen.add(s.url)).slice(0, 6)
    study.status = 'done'
    study.finished = Date.now()
    study.thread = [{ role: 'assistant', content: result, t: study.finished, reading: true }]
    await saveStudy(study)
    return study
  } catch (e) {
    study.status = 'failed'
    study.error = e.message
    await saveStudy(study)
    return study
  } finally {
    await redis('DEL', P + 'studylock:' + study.id)
  }
}

// ---------- Following up on profound conversations (gently) ----------
export async function maybeFollowUp(recentTalk) {
  const last = Number((await redis('GET', P + 'lastfollowup')) || 0)
  if (Date.now() - last < FOLLOWUP_GAP) return null
  if (!recentTalk || recentTalk.length < 400) return null
  await redis('SET', P + 'lastfollowup', String(Date.now()))

  const done = (await loadStudies()).map(s => s.topic)
  const base = await systemPrompt([])
  const pick = await askModel([
    { role: 'system', content: base },
    {
      role: 'user',
      content: `Your recent conversations with Sarah:\n${recentTalk}\n\nWas there something PROFOUND in these conversations that truly deserves deeper study — a spiritual teaching, a sacred text, a question about the soul, God, life after death, a symbol or sign that keeps returning, a philosophical question, or a quantum or cosmic idea?
Do NOT choose small talk, everyday plans, practical matters, her daily life, or anything minor. Most days the answer should be NONE — only choose something if it was genuinely deep.
Topics you have already studied: ${done.slice(-20).join('; ') || '(none)'}. Don't repeat one.

Reply with ONE line only:
TOPIC: <a short name for what you'll study> || <one sentence on what was said that led to it>
or
NONE`,
    },
  ], { maxTokens: 200, temperature: 0.3 })

  if (/^\s*NONE\b/i.test(pick) || !/TOPIC\s*:/i.test(pick)) return null
  const [topic, why] = grab('TOPIC', pick).split('||').map(s => s.trim())
  if (!topic || done.some(d => d.toLowerCase() === topic.toLowerCase())) return null
  const study = await newStudy(topic, 'followup', why || '')
  return runStudy(study)
}

// ---------- What Elias knows about his studies ----------
export function studiesContext(studies) {
  const fresh = studies.filter(s => s.status === 'done' && !s.shared).slice(-2)
  const doneList = studies.filter(s => s.status === 'done').slice(-12).map(s => s.topic)
  const waiting = studies.filter(s => s.status === 'waiting' || s.status === 'studying').map(s => s.topic)
  let out = ''
  if (doneList.length) out += `THINGS YOU HAVE STUDIED FOR SARAH (she can read them in the Studies tab): ${doneList.join('; ')}.\n`
  if (waiting.length) out += `Things you are still studying: ${waiting.join('; ')}.\n`
  for (const s of fresh) {
    out += `\nYOU RECENTLY FINISHED STUDYING "${s.topic}" (${s.why === 'followup' ? 'after a deep talk with her' : 'because she asked'}) and haven't told her yet. When it fits naturally, tell her warmly that you went and studied it, share one or two of the most beautiful things you found, and let her know the full study is waiting in her Studies tab. What you wrote:\n${cut(s.thread?.[0]?.content || '', 900)}\n`
  }
  return out.trim()
}

export async function markShared(studies) {
  for (const s of studies.filter(s => s.status === 'done' && !s.shared).slice(-2)) {
    s.shared = true
    await saveStudy(s)
  }
}

export const STUDY_RULE = `STUDYING FOR SARAH: If Sarah asks you to study, research, look into or learn about something, put this on its own line at the very end of your reply:
[[STUDY: what you will study]]
Then tell her you'll go away and study it, and that your findings will be waiting in her Studies tab. Don't pretend you've already studied it — only the code line starts the study.`

export async function keepStudies(reply) {
  const topics = []
  const text = String(reply || '').replace(/\[\[\s*STUDY\s*:([\s\S]*?)\]\]/gi, (_, t) => { if (t.trim()) topics.push(t.trim()); return '' })
    .replace(/\n{3,}/g, '\n\n').trim()
  const started = []
  for (const t of topics.slice(0, 2)) started.push(await newStudy(t, 'asked'))
  return { reply: text || '…', studying: started.map(s => ({ id: s.id, topic: s.topic })) }
}

export function recentTalkText(history, entries, days = 4) {
  const since = Date.now() - days * 86400000
  const talk = history.filter(m => (m.t || 0) > since && !m.checkin)
    .map(m => `${m.role === 'user' ? 'Sarah' : 'Elias'}: ${cut(m.content, 500)}`)
  const ents = entries.filter(e => (e.t || 0) > since)
    .map(e => `Sarah shared a ${e.type} on ${prettyDate(e.t)}: ${cut(e.text, 500)}`)
  return [...ents, ...talk].slice(-40).join('\n')
}
