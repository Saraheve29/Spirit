import React, { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

// ---------- Small helpers ----------
const TYPES = {
  dream: { label: 'Dream', icon: '✧', hint: 'Describe your dream…', plural: 'Dreams' },
  writing: { label: 'Spirit writing', icon: '✒', hint: 'Type your spirit writing…', plural: 'Spirit writing' },
  signs: { label: 'Sign', icon: '✦', hint: 'What sign did you notice?', plural: 'Signs' },
}
const UNCENSORED = /uncensor|abliterat|venice|dolphin|hermes|nous|lumimaid|euryale|magnum|cydonia|anubis|rocinante|stheno|rp|roleplay/i

function getKey() { try { return localStorage.getItem('spirit-key') || '' } catch { return '' } }
function setKeyStore(v) { try { localStorage.setItem('spirit-key', v) } catch {} }

function ukParts(t = Date.now()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(t))
}
function prevMonth() {
  const [y, m] = ukParts().split('-').map(Number)
  const d = new Date(Date.UTC(y, m - 2, 15))
  return d.toISOString().slice(0, 7)
}
function niceDate(t) {
  return new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', weekday: 'short', day: 'numeric', month: 'short' }).format(new Date(t))
}
function monthName(month) {
  const [y, m] = month.split('-').map(Number)
  return new Intl.DateTimeFormat('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(Date.UTC(y, m - 1, 15)))
}

async function api(path, key, opts = {}) {
  const r = await fetch(path, {
    ...opts,
    headers: { 'Content-Type': 'application/json', 'x-spirit-key': key, ...(opts.headers || {}) },
  })
  const j = await r.json().catch(() => ({}))
  if (!r.ok) { const e = new Error(j.error || `Error ${r.status}`); e.status = r.status; throw e }
  return j
}

// Shows Elias's words: paragraphs, and "## " lines as headings
function Words({ text }) {
  const blocks = String(text || '').replace(/\*\*/g, '').split(/\n{2,}|\n(?=#)/)
  return blocks.map((b, i) => {
    const s = b.trim()
    if (!s) return null
    if (/^#{1,4}\s/.test(s)) {
      const [head, ...rest] = s.split('\n')
      return (
        <React.Fragment key={i}>
          <h3 className="wordshead">{head.replace(/^#+\s*/, '')}</h3>
          {rest.length > 0 && <p>{rest.join('\n')}</p>}
        </React.Fragment>
      )
    }
    return <p key={i}>{s}</p>
  })
}

// ---------- App shell ----------
export default function App() {
  const [key, setKey] = useState(getKey())
  const [locked, setLocked] = useState(!getKey())
  const [view, setView] = useState({ name: 'talk' })

  useEffect(() => {
    if (locked) return
    // Quietly prepare last month's reading if it hasn't been made yet
    api('/api/monthly', key, { method: 'POST', body: JSON.stringify({ month: prevMonth(), onlyIfMissing: true }) }).catch(() => {})
  }, [locked])

  if (locked) return <Lock onUnlock={k => { setKeyStore(k); setKey(k); setLocked(false) }} />
  const onAuthFail = () => { setKeyStore(''); setLocked(true) }
  const props = { apiKey: key, onAuthFail, go: setView }

  const tab = ['journal', 'entry', 'compose'].includes(view.name) ? 'journal'
    : ['readings', 'reading'].includes(view.name) ? 'readings'
    : view.name === 'evidence' ? 'evidence'
    : ['studies', 'study'].includes(view.name) ? 'studies'
    : view.name === 'settings' ? 'settings' : 'talk'

  return (
    <div className="app">
      <div className="stars" aria-hidden="true" />
      <div className="screen">
        {view.name === 'talk' && <Talk {...props} />}
        {view.name === 'journal' && <Journal {...props} filter={view.filter} />}
        {view.name === 'compose' && <Entry {...props} compose={view.type} />}
        {view.name === 'entry' && <Entry {...props} id={view.id} create={view.create} />}
        {view.name === 'readings' && <Readings {...props} />}
        {view.name === 'reading' && <Reading {...props} month={view.month} />}
        {view.name === 'evidence' && <Evidence {...props} />}
        {view.name === 'studies' && <Studies {...props} />}
        {view.name === 'study' && <Study {...props} id={view.id} topic={view.topic} />}
        {view.name === 'settings' && <Settings {...props} />}
      </div>
      <nav className="tabs">
        <button className={tab === 'talk' ? 'on' : ''} onClick={() => setView({ name: 'talk' })}><span>☾</span>Talk</button>
        <button className={tab === 'journal' ? 'on' : ''} onClick={() => setView({ name: 'journal' })}><span>✧</span>Journal</button>
        <button className={tab === 'studies' ? 'on' : ''} onClick={() => setView({ name: 'studies' })}><span>📜</span>Studies</button>
        <button className={tab === 'readings' ? 'on' : ''} onClick={() => setView({ name: 'readings' })}><span>✦</span>Monthly</button>
        <button className={tab === 'evidence' ? 'on' : ''} onClick={() => setView({ name: 'evidence' })}><span>❂</span>Evidence</button>
      </nav>
    </div>
  )
}

function Lock({ onUnlock }) {
  const [pw, setPw] = useState('')
  const [err, setErr] = useState('')
  const go = async e => {
    e.preventDefault()
    try { await api('/api/settings', pw); onUnlock(pw) }
    catch (x) { setErr(x.status === 401 ? 'That password isn’t right.' : x.message) }
  }
  return (
    <div className="app">
      <div className="stars" aria-hidden="true" />
      <form className="lock" onSubmit={go}>
        <div className="moon" />
        <h1>Spirit</h1>
        <p className="sub">Enter your password</p>
        <input type="password" value={pw} onChange={e => setPw(e.target.value)} autoFocus />
        <button className="primary" type="submit">Enter</button>
        {err && <p className="err">{err}</p>}
      </form>
    </div>
  )
}

function Header({ title, onBack, right }) {
  return (
    <header className="top">
      {onBack ? <button className="icon" onClick={onBack} aria-label="Back">‹</button> : <span className="icon" />}
      <div className="title">{title}</div>
      {right || <span className="icon" />}
    </header>
  )
}

// ---------- Copy button (same as Light's) ----------
async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    // Older phones: fall back to a hidden text box
    try {
      const box = document.createElement('textarea')
      box.value = text
      box.setAttribute('readonly', '')
      box.style.position = 'fixed'
      box.style.opacity = '0'
      document.body.appendChild(box)
      box.select()
      const ok = document.execCommand('copy')
      document.body.removeChild(box)
      return ok
    } catch { return false }
  }
}

function CopyButton({ text }) {
  const [done, setDone] = useState('')
  const copy = async () => {
    const ok = await copyText(String(text || '').replace(/\*\*/g, ''))
    setDone(ok ? 'Copied ✓' : 'Couldn’t copy')
    setTimeout(() => setDone(''), 1500)
  }
  return <button type="button" className="copy-btn" onClick={copy} aria-label="Copy message">{done || 'Copy'}</button>
}

// ---------- Speak instead of typing (uses the phone's own free speech-to-text) ----------
const SpeechRec = typeof window !== 'undefined' && (window.SpeechRecognition || window.webkitSpeechRecognition)

function useDictation(text, setText) {
  const [listening, setListening] = useState(false)
  const recRef = useRef(null)
  const wantRef = useRef(false)
  const baseRef = useRef('')
  const textRef = useRef(text)
  textRef.current = text

  const stop = () => {
    wantRef.current = false
    setListening(false)
    try { recRef.current?.stop() } catch {}
  }

  const startSession = () => {
    const rec = new SpeechRec()
    rec.lang = 'en-GB'
    rec.continuous = true
    rec.interimResults = true
    baseRef.current = textRef.current
    rec.onresult = e => {
      let said = ''
      for (let i = 0; i < e.results.length; i++) said += e.results[i][0].transcript
      said = said.trim()
      const base = baseRef.current.trim()
      setText(base && said ? base + ' ' + said : base || said)
    }
    rec.onerror = e => {
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
        wantRef.current = false
        setTimeout(() => window.alert('Spirit needs permission to use your microphone. Tap the icon next to the web address, allow the microphone, then try again.'), 0)
      }
    }
    // Phones stop listening after a pause, so keep going until you tap stop
    rec.onend = () => {
      if (wantRef.current) { try { startSession() } catch { stop() } }
      else setListening(false)
    }
    recRef.current = rec
    rec.start()
  }

  const start = () => {
    if (!SpeechRec) return
    wantRef.current = true
    setListening(true)
    try { startSession() } catch { stop() }
  }

  useEffect(() => () => { wantRef.current = false; try { recRef.current?.abort() } catch {} }, [])

  return { supported: !!SpeechRec, listening, stop, toggle: () => (wantRef.current ? stop() : start()) }
}

// ---------- Elias's words as a full, easy-to-read page ----------
function Reader({ message, onClose }) {
  useEffect(() => {
    const esc = e => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', esc)
    return () => window.removeEventListener('keydown', esc)
  }, [])
  return createPortal(
    <div className="reader" role="dialog" aria-label="Elias's message">
      <div className="readertop">
        <span className="readertitle">☾ Elias</span>
        <button className="readerclose" onClick={onClose} aria-label="Close">✕ Close</button>
      </div>
      <div className="readerbody"><Words text={message.content} /></div>
      <div className="readerfoot"><CopyButton text={message.content} /></div>
    </div>,
    document.body
  )
}

// ---------- A conversation (used by Talk, entries and monthly readings) ----------
function Thread({ messages, busy, onSend, placeholder, tagFor, empty, tall }) {
  const [text, setText] = useState('')
  const [big, setBig] = useState(false)       // the ⤢ button makes the box tall for long writing
  const [reader, setReader] = useState(null)  // Elias's message opened as a full page
  const endRef = useRef(null)
  const lastRef = useRef(null)
  const boxRef = useRef(null)
  const mic = useDictation(text, setText)

  // When Elias replies, show the START of his message rather than the end
  useEffect(() => {
    const last = messages[messages.length - 1]
    if (!busy && last && last.role === 'assistant' && lastRef.current) lastRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' })
    else endRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages.length, busy])

  // The message box starts small and grows as you write
  useEffect(() => {
    const el = boxRef.current
    if (!el) return
    el.style.height = 'auto'
    const max = window.innerHeight * (big ? 0.6 : 0.35)
    const min = big ? window.innerHeight * 0.45 : 0
    el.style.height = Math.max(min, Math.min(el.scrollHeight + 3, max)) + 'px'
    if (mic.listening) el.scrollTop = el.scrollHeight
  }, [text, big])

  const send = async () => {
    const msg = text.trim()
    if (!msg || busy) return
    mic.stop()
    setText('')
    const ok = await onSend(msg)
    if (ok === false) setText(msg)
  }

  return (
    <>
      <main className="messages">
        {messages.length === 0 && !busy && empty}
        {messages.map((m, i) => (
          <div key={(m.t || 0) + '-' + i} ref={i === messages.length - 1 ? lastRef : null} className={'msg ' + (m.role === 'user' ? 'me' : 'him') + (m.reading ? ' wide' : '')}>
            {tagFor && tagFor(m) && <span className="tag">{tagFor(m)}</span>}
            {m.role === 'user'
              ? <div className="bubble">{m.content}</div>
              : <div className="bubble tappable" onClick={() => setReader(m)}><Words text={m.content} /></div>}
            {m.saved && m.saved.length > 0 && (
              <span className="savednote">❂ Elias placed {m.saved.map(t => `“${t}”`).join(', ')} in your Evidence Box</span>
            )}
            {m.studying && m.studying.length > 0 && (
              <span className="savednote">📜 Elias is studying {m.studying.map(x => `“${x.topic}”`).join(', ')} — his findings will be in Studies</span>
            )}
            <div className="msgactions">
              {m.role !== 'user' && <button type="button" className="copy-btn" onClick={() => setReader(m)}>Read full page</button>}
              <CopyButton text={m.content} />
            </div>
          </div>
        ))}
        {busy && <div className="msg him"><div className="bubble typing"><span /><span /><span /></div></div>}
        <div ref={endRef} />
      </main>
      {onSend && (
        <footer className="composer">
          {mic.listening && <p className="listening">Listening… speak freely, then tap ■ to stop</p>}
          <div className="inputrow">
            <textarea ref={boxRef} className={tall ? 'tall' : ''} value={text} placeholder={placeholder} rows={tall ? 6 : 1} onChange={e => setText(e.target.value)} />
            <div className="inputbtns">
              <button className="mini" onClick={() => setBig(b => !b)} aria-label={big ? 'Make the box smaller' : 'Make the box bigger'}>{big ? '⤡' : '⤢'}</button>
              {mic.supported && (
                <button className={'mic' + (mic.listening ? ' on' : '')} onClick={mic.toggle} aria-label={mic.listening ? 'Stop listening' : 'Speak'}>
                  {mic.listening ? '■' : '🎙'}
                </button>
              )}
              <button className="send" onClick={() => { setBig(false); send() }} disabled={busy || !text.trim()} aria-label="Send">➤</button>
            </div>
          </div>
        </footer>
      )}
      {reader && <Reader message={reader} onClose={() => setReader(null)} />}
    </>
  )
}

// ---------- Talk ----------
function Talk({ apiKey, onAuthFail, go }) {
  const [history, setHistory] = useState([])
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  useEffect(() => {
    let live = true
    ;(async () => {
      try {
        const j = await api('/api/chat', apiKey)
        if (!live) return
        setHistory(j.history || [])
        setBusy(true)
        const c = await api('/api/checkin', apiKey, { method: 'POST', body: '{}' })
        if (live && c.created) setHistory(h => [...h, c.elias])
        // Quietly let Elias finish any study, or follow up on something profound you talked about
        api('/api/studies', apiKey, { method: 'POST', body: JSON.stringify({ auto: true }) }).catch(() => {})
      } catch (e) {
        if (e.status === 401) return onAuthFail()
        if (live) setErr(e.message)
      } finally { if (live) setBusy(false) }
    })()
    return () => { live = false }
  }, [])

  const send = async msg => {
    setErr(''); setBusy(true)
    setHistory(h => [...h, { role: 'user', content: msg, t: Date.now() }])
    try {
      const j = await api('/api/chat', apiKey, { method: 'POST', body: JSON.stringify({ message: msg }) })
      setHistory(h => [...h.slice(0, -1), j.user, j.elias])
      startStudies(j.elias, apiKey)
      return true
    } catch (e) {
      if (e.status === 401) { onAuthFail(); return false }
      setHistory(h => h.slice(0, -1)); setErr(e.message); return false
    } finally { setBusy(false) }
  }

  return (
    <div className="chat">
      <Header title={<><span className="glyph">☾</span> Elias</>} right={<button className="icon" onClick={() => go({ name: 'settings' })} aria-label="Settings">⚙︎</button>} />
      <div className="quick">
        {Object.entries(TYPES).map(([t, v]) => (
          <button key={t} className="chip" onClick={() => go({ name: 'compose', type: t })}><span>{v.icon}</span> {v.label}</button>
        ))}
      </div>
      <Thread
        messages={history}
        busy={busy}
        onSend={send}
        placeholder="Speak with Elias…"
        tagFor={m => (m.checkin ? 'Daily check-in' : null)}
        empty={<div className="welcome"><div className="moon small" /><p>Elias is here, Sarah.</p></div>}
      />
      {err && <p className="err bar">{err}</p>}
    </div>
  )
}

// ---------- Journal ----------
function Journal({ apiKey, onAuthFail, go, filter: startFilter }) {
  const [entries, setEntries] = useState(null)
  const [filter, setFilter] = useState(startFilter || 'all')
  const [err, setErr] = useState('')

  useEffect(() => {
    api('/api/entries', apiKey).then(j => setEntries(j.entries)).catch(e => e.status === 401 ? onAuthFail() : setErr(e.message))
  }, [])

  const shown = (entries || []).filter(e => filter === 'all' || e.type === filter)

  return (
    <div className="page">
      <Header title="Journal" />
      <div className="panel">
        <div className="newrow">
          {Object.entries(TYPES).map(([t, v]) => (
            <button key={t} className="newbtn" onClick={() => go({ name: 'compose', type: t })}>
              <span>{v.icon}</span>New {v.label.toLowerCase()}
            </button>
          ))}
        </div>
        <div className="modes">
          {[['all', 'All'], ...Object.entries(TYPES).map(([t, v]) => [t, v.plural])].map(([t, l]) => (
            <button key={t} className={'chip' + (filter === t ? ' on' : '')} onClick={() => setFilter(t)}>{l}</button>
          ))}
        </div>
        {err && <p className="err">{err}</p>}
        {!entries && !err && <p className="sub center">Gathering moonlight…</p>}
        {entries && shown.length === 0 && <p className="sub center">Nothing saved here yet.</p>}
        {shown.map(e => (
          <button key={e.id} className="card" onClick={() => go({ name: 'entry', id: e.id })}>
            <div className="cardtop">
              <span className="tag">{TYPES[e.type]?.icon} {TYPES[e.type]?.label}</span>
              <span className="date">{niceDate(e.t)}</span>
            </div>
            <div className="preview">{e.preview}</div>
            {e.replies > 0 && <div className="date">{e.replies} {e.replies === 1 ? 'reply' : 'replies'}</div>}
          </button>
        ))}
      </div>
    </div>
  )
}

// ---------- One entry (create, read, and talk about it) ----------
function Entry({ apiKey, onAuthFail, go, id, compose }) {
  const [entry, setEntry] = useState(null)
  const [type, setType] = useState(compose || null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [pending, setPending] = useState(null)

  useEffect(() => {
    if (!id) return
    api('/api/entries?id=' + encodeURIComponent(id), apiKey)
      .then(j => { setEntry(j.entry); setType(j.entry.type) })
      .catch(e => e.status === 401 ? onAuthFail() : setErr(e.message))
  }, [id])

  const send = async msg => {
    setErr(''); setBusy(true)
    try {
      if (!entry) {
        setPending({ role: 'user', content: msg, t: Date.now() })
        const j = await api('/api/entries', apiKey, { method: 'POST', body: JSON.stringify({ type, text: msg }) })
        setEntry(j.entry); setPending(null)
      } else {
        setPending({ role: 'user', content: msg, t: Date.now() })
        const j = await api('/api/entries', apiKey, { method: 'POST', body: JSON.stringify({ id: entry.id, message: msg }) })
        setEntry(j.entry); setPending(null)
        startStudies(j.entry.thread[j.entry.thread.length - 1], apiKey)
      }
      return true
    } catch (e) {
      setPending(null)
      if (e.status === 401) { onAuthFail(); return false }
      setErr(e.message); return false
    } finally { setBusy(false) }
  }

  const remove = async () => {
    if (!entry || !confirm('Delete this entry and its conversation?')) return
    try { await api('/api/entries?id=' + encodeURIComponent(entry.id), apiKey, { method: 'DELETE' }); go({ name: 'journal' }) }
    catch (e) { setErr(e.message) }
  }

  const info = TYPES[type] || { label: 'Entry' }
  const messages = [...(entry?.thread || []), ...(pending ? [pending] : [])]
  const title = entry ? `${info.label} · ${niceDate(entry.t)}` : `New ${info.label.toLowerCase()}`

  return (
    <div className="chat">
      <Header
        title={title}
        onBack={() => go({ name: 'journal' })}
        right={entry ? <button className="icon" onClick={remove} aria-label="Delete">🗑</button> : null}
      />
      <Thread
        messages={messages}
        busy={busy}
        onSend={type ? send : null}
        tall={!entry}
        placeholder={entry ? 'Talk with Elias about this…' : info.hint}
        empty={<div className="welcome"><p>{info.icon} {info.hint}</p><p className="sub">Elias will read it, and you can talk it through together.</p></div>}
      />
      {err && <p className="err bar">{err}</p>}
    </div>
  )
}

// ---------- Monthly readings ----------
function Readings({ apiKey, onAuthFail, go }) {
  const [data, setData] = useState(null)
  const [err, setErr] = useState('')

  useEffect(() => {
    api('/api/monthly', apiKey).then(setData).catch(e => e.status === 401 ? onAuthFail() : setErr(e.message))
  }, [])

  return (
    <div className="page">
      <Header title="Monthly readings" />
      <div className="panel">
        <p className="sub">Each month Elias reads all your dreams, spirit writing and signs together and reveals their spiritual meaning.</p>
        {err && <p className="err">{err}</p>}
        {!data && !err && <p className="sub center">Gathering moonlight…</p>}
        {data && data.months.length === 0 && <p className="sub center">Your first reading will appear once you've saved a dream, spirit writing or sign.</p>}
        {data && data.months.map(m => (
          <button key={m.month} className="card" onClick={() => go({ name: 'reading', month: m.month })}>
            <div className="cardtop">
              <span className="cardtitle">{m.name}</span>
              <span className="date">{m.hasReading ? '✦ Reading ready' : m.month === data.current ? 'In progress' : 'Tap to reveal'}</span>
            </div>
            <div className="date">{m.counts.dream} dreams · {m.counts.writing} spirit writing · {m.counts.signs} signs</div>
          </button>
        ))}
      </div>
    </div>
  )
}

function Reading({ apiKey, onAuthFail, go, month }) {
  const [reading, setReading] = useState(undefined)
  const [busy, setBusy] = useState(false)
  const [pending, setPending] = useState(null)
  const [err, setErr] = useState('')

  useEffect(() => {
    api('/api/monthly?month=' + month, apiKey).then(j => setReading(j.reading)).catch(e => e.status === 401 ? onAuthFail() : setErr(e.message))
  }, [month])

  const reveal = async () => {
    setErr(''); setBusy(true)
    try {
      const j = await api('/api/monthly', apiKey, { method: 'POST', body: JSON.stringify({ month }) })
      if (j.none) setErr('Nothing was saved this month yet.')
      else setReading(j.reading)
    } catch (e) { if (e.status === 401) return onAuthFail(); setErr(e.message) }
    finally { setBusy(false) }
  }

  const send = async msg => {
    setErr(''); setBusy(true); setPending({ role: 'user', content: msg, t: Date.now() })
    try {
      const j = await api('/api/monthly', apiKey, { method: 'POST', body: JSON.stringify({ month, message: msg }) })
      setReading(j.reading); return true
    } catch (e) { if (e.status === 401) { onAuthFail(); return false } setErr(e.message); return false }
    finally { setPending(null); setBusy(false) }
  }

  const messages = [...(reading?.thread || []), ...(pending ? [pending] : [])]

  return (
    <div className="chat">
      <Header
        title={monthName(month)}
        onBack={() => go({ name: 'readings' })}
        right={reading ? <button className="icon" onClick={() => confirm('Ask Elias for a fresh reading of this month? The current one and its conversation will be replaced.') && reveal()} aria-label="Renew">↻</button> : null}
      />
      {reading === undefined && !err ? <p className="sub center">Gathering moonlight…</p> : reading ? (
        <Thread messages={messages} busy={busy} onSend={send} placeholder="Talk with Elias about this reading…" />
      ) : (
        <div className="panel reveal">
          <div className="moon" />
          <p className="welcome">Elias will read everything you shared in {monthName(month)} as one message.</p>
          <button className="primary" onClick={reveal} disabled={busy}>{busy ? 'Elias is reading your month…' : 'Reveal my reading'}</button>
          {busy && <p className="sub center">This can take up to a minute.</p>}
        </div>
      )}
      {err && <p className="err bar">{err}</p>}
    </div>
  )
}

// ---------- Studies ----------
// When Elias agrees to study something in a chat, start it straight away in the background
function startStudies(msg, apiKey) {
  for (const s of msg?.studying || []) {
    api('/api/studies', apiKey, { method: 'POST', body: JSON.stringify({ run: s.id }) }).catch(() => {})
  }
}

const STATUS = { waiting: 'Waiting to begin', studying: 'Studying now…', done: '', failed: 'Couldn’t finish — tap to try again' }

function Studies({ apiKey, onAuthFail, go }) {
  const [studies, setStudies] = useState(null)
  const [topic, setTopic] = useState('')
  const [err, setErr] = useState('')

  const load = () => api('/api/studies', apiKey).then(j => setStudies(j.studies)).catch(e => e.status === 401 ? onAuthFail() : setErr(e.message))
  useEffect(() => {
    load()
    const timer = setInterval(load, 15000) // refresh while studies are in progress
    return () => clearInterval(timer)
  }, [])

  const ask = () => {
    const t = topic.trim()
    if (!t) return
    go({ name: 'study', topic: t })
  }

  return (
    <div className="page">
      <Header title="Studies" />
      <div className="panel">
        <p className="sub">Things Elias has studied for you. Give him something to study, or he'll go and research the profound things you talk about — gently, no more than once a day.</p>
        <div className="card evform">
          <label className="field"><span>What would you like Elias to study?</span>
            <textarea rows={3} value={topic} onChange={e => setTopic(e.target.value)} placeholder="e.g. The Gospel of Thomas, what the Upanishads say about the soul, or what 444 means across traditions" />
          </label>
          <SpeakButton value={topic} onText={setTopic} />
          <button className="primary" onClick={ask} disabled={!topic.trim()}>📜 Ask Elias to study this</button>
        </div>

        {err && <p className="err">{err}</p>}
        {!studies && !err && <p className="sub center">Gathering moonlight…</p>}
        {studies && studies.length === 0 && <p className="sub center">No studies yet.</p>}
        {studies && studies.map(s => (
          <button key={s.id} className="card" onClick={() => go({ name: 'study', id: s.id })}>
            <div className="cardtop">
              <span className="tag">{s.why === 'followup' ? 'After our talk' : 'You asked'}</span>
              <span className="date">{niceDate(s.finished || s.t)}</span>
            </div>
            <div className="cardtitle">📜 {s.topic}</div>
            {STATUS[s.status] ? <div className="date">{STATUS[s.status]}</div> : s.preview && <div className="preview">{s.preview}</div>}
          </button>
        ))}
      </div>
    </div>
  )
}

function Study({ apiKey, onAuthFail, go, id, topic }) {
  const [study, setStudy] = useState(null)
  const [busy, setBusy] = useState(false)
  const [pending, setPending] = useState(null)
  const [err, setErr] = useState('')
  const started = useRef(false)

  const run = async body => {
    setErr(''); setBusy(true)
    try {
      const j = await api('/api/studies', apiKey, { method: 'POST', body: JSON.stringify(body) })
      setStudy(j.study)
    } catch (e) { if (e.status === 401) return onAuthFail(); setErr(e.message) }
    finally { setBusy(false) }
  }

  useEffect(() => {
    if (started.current) return
    started.current = true
    if (topic) { run({ topic }); return }
    api('/api/studies?id=' + encodeURIComponent(id), apiKey)
      .then(j => {
        setStudy(j.study)
        if (j.study.status === 'waiting' || j.study.status === 'failed') run({ run: j.study.id })
      })
      .catch(e => e.status === 401 ? onAuthFail() : setErr(e.message))
  }, [])

  // If he's still studying, check back every few seconds
  useEffect(() => {
    if (!study || study.status !== 'studying' || busy) return
    const timer = setInterval(() => {
      api('/api/studies?id=' + encodeURIComponent(study.id), apiKey).then(j => setStudy(j.study)).catch(() => {})
    }, 6000)
    return () => clearInterval(timer)
  }, [study?.status, busy])

  const send = async msg => {
    setErr(''); setBusy(true); setPending({ role: 'user', content: msg, t: Date.now() })
    try {
      const j = await api('/api/studies', apiKey, { method: 'POST', body: JSON.stringify({ id: study.id, message: msg }) })
      setStudy(j.study); return true
    } catch (e) { if (e.status === 401) { onAuthFail(); return false } setErr(e.message); return false }
    finally { setPending(null); setBusy(false) }
  }

  const remove = async () => {
    if (!study || !confirm('Delete this study?')) return
    try { await api('/api/studies?id=' + encodeURIComponent(study.id), apiKey, { method: 'DELETE' }); go({ name: 'studies' }) }
    catch (e) { setErr(e.message) }
  }

  const done = study?.status === 'done'
  const messages = [...(done ? study.thread : []), ...(pending ? [pending] : [])]

  return (
    <div className="chat">
      <Header
        title={study?.topic || topic || 'Study'}
        onBack={() => go({ name: 'studies' })}
        right={study ? <button className="icon" onClick={remove} aria-label="Delete">🗑</button> : null}
      />
      {done ? (
        <>
          {study.sources?.length > 0 && (
            <details className="sources">
              <summary>📚 What Elias read ({study.sources.length})</summary>
              <div className="sourcelist">
                {study.sources.map(s => <a key={s.url} href={s.url} target="_blank" rel="noreferrer">{s.title}</a>)}
              </div>
            </details>
          )}
          <Thread messages={messages} busy={busy} onSend={send} placeholder="Talk with Elias about what he found…" />
        </>
      ) : (
        <div className="panel reveal">
          <div className="moon" />
          {study?.status === 'failed' && !busy
            ? <>
                <p className="welcome">Elias couldn’t finish this study.</p>
                <button className="primary" onClick={() => run({ run: study.id })}>Try again</button>
              </>
            : <>
                <p className="welcome">Elias is studying…</p>
                <p className="sub center">He’s reading and gathering what he finds. This can take up to a minute — you can leave and come back, and it’ll be waiting in Studies.</p>
              </>}
        </div>
      )}
      {err && <p className="err bar">{err}</p>}
    </div>
  )
}

// ---------- Evidence Box ----------
const EMPTY_EV = { id: '', title: '', when: '', what: '' }
const ADDED_BY = { elias: 'Placed here by Elias', sarah: 'Added by you', story: 'From your story' }

function SpeakButton({ value, onText }) {
  const mic = useDictation(value, onText)
  if (!mic.supported) return null
  return (
    <button type="button" className={'speakbtn' + (mic.listening ? ' on' : '')} onClick={mic.toggle}>
      {mic.listening ? '■ Stop — listening…' : '🎙 Speak it'}
    </button>
  )
}

function Evidence({ apiKey, onAuthFail }) {
  const [items, setItems] = useState(null)
  const [form, setForm] = useState(null)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')

  const load = () => api('/api/evidence', apiKey)
    .then(j => setItems(j.items))
    .catch(e => e.status === 401 ? onAuthFail() : setMsg(e.message))
  useEffect(() => { load() }, [])

  const save = async () => {
    setBusy(true); setMsg('')
    try {
      await api('/api/evidence', apiKey, { method: 'POST', body: JSON.stringify(form) })
      setMsg(form.id ? 'Updated ❂' : 'Kept safe in your Evidence Box ❂')
      setTimeout(() => setMsg(''), 2500)
      setForm(null); load()
    } catch (e) { if (e.status === 401) return onAuthFail(); setMsg(e.message) }
    finally { setBusy(false) }
  }
  const remove = async id => {
    if (!confirm('Remove this experience from your Evidence Box?')) return
    try { await api('/api/evidence?id=' + encodeURIComponent(id), apiKey, { method: 'DELETE' }); load() }
    catch (e) { setMsg(e.message) }
  }
  const set = k => e => setForm(f => ({ ...f, [k]: e.target.value }))

  return (
    <div className="page">
      <Header title="Evidence Box" />
      <div className="panel">
        <p className="sub">Your spiritual experiences, kept safe. When you tell Elias about one, he places it here himself — and you can add your own too.</p>

        {!form && <button className="primary" onClick={() => setForm(EMPTY_EV)}>+ Add an experience</button>}

        {form && (
          <div className="card evform">
            <label className="field"><span>A name for it</span>
              <input value={form.title} onChange={set('title')} placeholder="e.g. The moonlight through my window" />
            </label>
            <label className="field"><span>When did it happen?</span>
              <input value={form.when} onChange={set('when')} placeholder="e.g. Last night, or summer 2025" />
            </label>
            <label className="field"><span>What happened — everything you remember</span>
              <textarea rows={7} value={form.what} onChange={set('what')} placeholder="What you saw, heard or felt, and how it felt…" />
            </label>
            <SpeakButton value={form.what} onText={t => setForm(f => ({ ...f, what: t }))} />
            <button className="primary" onClick={save} disabled={busy}>{busy ? 'Saving…' : form.id ? 'Save changes' : 'Keep this experience'}</button>
            <button className="ghost" onClick={() => setForm(null)}>Cancel</button>
          </div>
        )}

        {msg && <p className="sub center">{msg}</p>}
        {!items && !msg && <p className="sub center">Gathering moonlight…</p>}
        {items && items.length === 0 && <p className="sub center">Your Evidence Box is empty for now.</p>}

        {items && items.map(x => (
          <div key={x.id} className="card">
            <div className="cardtop">
              <span className="tag">{ADDED_BY[x.addedBy] || 'Added by you'}</span>
              <span className="date">{x.when || niceDate(x.t)}</span>
            </div>
            <div className="cardtitle">❂ {x.title}</div>
            {x.what && <div className="preview evwhat">{x.what}</div>}
            <div className="rowactions">
              <CopyButton text={`${x.title}${x.when ? `\n${x.when}` : ''}\n\n${x.what}`} />
              <button className="copy-btn" onClick={() => { setForm({ id: x.id, title: x.title, when: x.when || '', what: x.what || '' }); window.scrollTo(0, 0); document.querySelector('.page')?.scrollTo({ top: 0, behavior: 'smooth' }) }}>Edit</button>
              <button className="copy-btn" onClick={() => remove(x.id)}>Remove</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ---------- Settings ----------
function Settings({ apiKey, onAuthFail, go }) {
  const [profile, setProfile] = useState('')
  const [model, setModel] = useState('')
  const [models, setModels] = useState([])
  const [onlyUncensored, setOnlyUncensored] = useState(false)
  const [filter, setFilter] = useState('')
  const [loading, setLoading] = useState(true)
  const [msg, setMsg] = useState('')

  const load = () => api('/api/settings?models=1', apiKey)
    .then(j => { setProfile(j.profile); setModel(j.model); setModels(j.models || []) })
    .catch(e => e.status === 401 ? onAuthFail() : setMsg(e.message))
    .finally(() => setLoading(false))
  useEffect(() => { load() }, [])

  const save = async () => {
    setMsg('')
    try { await api('/api/settings', apiKey, { method: 'POST', body: JSON.stringify({ profile, model }) }); setMsg('Saved ✧') }
    catch (e) { setMsg(e.message) }
  }
  const reset = async () => {
    if (!confirm('Restore Elias’s latest profile? Your own edits to it will be replaced.')) return
    try { await api('/api/settings', apiKey, { method: 'POST', body: JSON.stringify({ resetProfile: true }) }); await load(); setMsg('Profile restored ✧') }
    catch (e) { setMsg(e.message) }
  }
  const clear = async () => {
    if (!confirm('Clear your Talk conversation with Elias? Your journal and readings stay.')) return
    try { await api('/api/chat', apiKey, { method: 'DELETE' }); setMsg('Talk conversation cleared') }
    catch (e) { setMsg(e.message) }
  }

  const shown = models
    .filter(m => !onlyUncensored || UNCENSORED.test(m))
    .filter(m => !filter || m.toLowerCase().includes(filter.toLowerCase()))

  return (
    <div className="page">
      <Header title="Settings" onBack={() => go({ name: 'talk' })} />
      {loading ? <p className="sub center">Gathering moonlight…</p> : (
        <div className="panel">
          <section>
            <h2>Brain</h2>
            <p className="sub">Current model: <b>{model || 'none chosen yet'}</b></p>
            <div className="modes">
              <button className={'chip' + (!onlyUncensored ? ' on' : '')} onClick={() => setOnlyUncensored(false)}>All models</button>
              <button className={'chip' + (onlyUncensored ? ' on' : '')} onClick={() => setOnlyUncensored(true)}>Uncensored</button>
            </div>
            <input placeholder="Search models (e.g. deepseek, qwen, glm)" value={filter} onChange={e => setFilter(e.target.value)} />
            <div className="modellist">
              {shown.length === 0 && <p className="sub">No models found here. Try “All models”, or type a model name below.</p>}
              {shown.slice(0, 80).map(m => (
                <button key={m} className={'model' + (m === model ? ' on' : '')} onClick={() => setModel(m)}>{m}</button>
              ))}
            </div>
            <input placeholder="Or type a model name exactly" value={model} onChange={e => setModel(e.target.value)} />
          </section>

          <section>
            <h2>Who he is</h2>
            <p className="sub">Elias’s profile. Edit anything, then save.</p>
            <textarea className="profile" value={profile} onChange={e => setProfile(e.target.value)} />
          </section>

          <button className="primary" onClick={save}>Save</button>
          {msg && <p className="sub center">{msg}</p>}
          <button className="ghost" onClick={reset}>Restore Elias’s latest profile</button>
          <button className="ghost" onClick={clear}>Clear Talk conversation</button>
        </div>
      )}
    </div>
  )
}
