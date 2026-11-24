// Elias's voice — turns his words into speech with NanoGPT's open-source Kokoro voices
// (the same service Light uses). It costs a tiny amount from your NanoGPT balance.
// If it ever fails, the app falls back to your phone's own free voice.
//
// GET  → his voice settings
// POST → { text } speaks it  |  { settings: { voice, speed } } saves the settings
import { P, authed, readBody, getJSON, setJSON } from './_lib.js'

const TTS_URL = 'https://api.nano-gpt.com/api/tts'
const MODEL = 'Kokoro-82m'
export const DEFAULT_VOICE = { voice: 'bm_george', speed: 0.95 }

// Kokoro's male voices that suit an ancient, warm guide ('device' = the phone's own voice, free)
export const VOICES = [
  { id: 'bm_george', name: 'George — deep British' },
  { id: 'bm_lewis', name: 'Lewis — warm British' },
  { id: 'bm_daniel', name: 'Daniel — calm British' },
  { id: 'bm_fable', name: 'Fable — storyteller British' },
  { id: 'am_onyx', name: 'Onyx — deep American' },
  { id: 'am_michael', name: 'Michael — gentle American' },
  { id: 'am_adam', name: 'Adam — clear American' },
  { id: 'device', name: 'My phone’s own voice (free)' },
]

function nanoKey() {
  return String(process.env.NANOGPT_API_KEY || '').replace(/["']/g, '').replace(/^\s*Bearer\s+/i, '').trim().split(/\s+/)[0]
}

// Only speak real words: no headings marks, codes, emoji or stray symbols
export function speakable(text) {
  return String(text || '')
    .replace(/\[\[[\s\S]*?\]\]/g, ' ')
    .replace(/^#+\s*/gm, '')
    .replace(/\*\*/g, '')
    .replace(/[\p{Extended_Pictographic}\u{FE0F}\u{200D}]/gu, '')
    .replace(/[_#>~`|*]/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .trim()
    .slice(0, 3000)
}

async function fetchAudio(url) {
  const r = await fetch(url)
  if (!r.ok) throw new Error('Could not download the voice.')
  const type = r.headers.get('content-type') || 'audio/mpeg'
  const buf = Buffer.from(await r.arrayBuffer())
  return `data:${type};base64,${buf.toString('base64')}`
}

async function tts(text, { voice, speed }) {
  const r = await fetch(TTS_URL, {
    method: 'POST',
    headers: { 'x-api-key': nanoKey(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, model: MODEL, voice, speed }),
  })
  const type = r.headers.get('content-type') || ''
  if (r.ok && type.startsWith('audio/')) {
    const buf = Buffer.from(await r.arrayBuffer())
    return `data:${type};base64,${buf.toString('base64')}`
  }
  const data = await r.json().catch(() => ({}))
  if (!r.ok && r.status !== 202) {
    const msg = data.error?.message || data.error || data.message || `status ${r.status}`
    throw new Error(String(typeof msg === 'string' ? msg : JSON.stringify(msg)))
  }
  if (data.audioUrl) return fetchAudio(data.audioUrl)
  if (data.runId) {
    for (let i = 0; i < 30; i++) {
      await new Promise(res => setTimeout(res, 800))
      const s = await fetch(`https://api.nano-gpt.com/api/tts/status?runId=${encodeURIComponent(data.runId)}&model=${encodeURIComponent(data.model || MODEL)}`, { headers: { 'x-api-key': nanoKey() } })
      const st = await s.json().catch(() => ({}))
      if (st.status === 'completed' && st.audioUrl) return fetchAudio(st.audioUrl)
      if (st.status === 'error') throw new Error(st.error || 'The voice service had a problem.')
    }
    throw new Error('The voice took too long.')
  }
  throw new Error('The voice service sent nothing back.')
}

export default async function handler(req, res) {
  if (!authed(req, res)) return
  try {
    const settings = { ...DEFAULT_VOICE, ...((await getJSON(P + 'voice')) || {}) }

    if (req.method === 'GET') return res.status(200).json({ settings, voices: VOICES })
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

    const body = readBody(req)
    if (body.settings) {
      const v = VOICES.some(x => x.id === body.settings.voice) ? body.settings.voice : DEFAULT_VOICE.voice
      const sp = Math.min(1.3, Math.max(0.7, Number(body.settings.speed) || DEFAULT_VOICE.speed))
      await setJSON(P + 'voice', { voice: v, speed: sp })
      return res.status(200).json({ settings: { voice: v, speed: sp } })
    }

    const words = speakable(body.text)
    if (!words) return res.status(400).json({ error: 'Nothing to read.' })
    if (settings.voice === 'device') return res.status(200).json({ device: true, settings })
    const audio = await tts(words, settings)
    return res.status(200).json({ audio })
  } catch (e) {
    // The app reads it with the phone's own voice instead
    return res.status(200).json({ device: true, reason: e.message })
  }
}
