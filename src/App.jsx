import React, { useEffect, useRef, useState } from 'react'

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
        {view.name === 'settings' && <Settings {...props} />}
      </div>
      <nav className="tabs">
        <button className={tab === 'talk' ? 'on' : ''} onClick={() => setView({ name: 'talk' })}><span>☾</span>Talk</button>
        <button className={tab === 'journal' ? 'on' : ''} onClick={() => setView({ name: 'journal' })}><span>✧</span>Journal</button>
        <button className={tab === 'readings' ? 'on' : ''} onClick={() => setView({ name: 'readings' })}><span>✦</span>Monthly</button>
        <button className={tab === 'evidence' ? 'on' : ''} onClick={() => setView({ name: 'evidence' })}><span>❂</span>Evidence</button>
        <button className={tab === 'settings' ? 'on' : ''} onClick={() => setView({ name: 'settings' })}><span>⚙︎</span>Settings</button>
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

// ---------- A conversation (used by Talk, entries and monthly readings) ----------
function Thread({ messages, busy, onSend, placeholder, tagFor, empty, tall }) {
  const [text, setText] = useState('')
  const endRef = useRef(null)
  const mic = useDictation(text, setText)
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages.length, busy])

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
          <div key={(m.t || 0) + '-' + i} className={'msg ' + (m.role === 'user' ? 'me' : 'him') + (m.reading ? ' wide' : '')}>
            {tagFor && tagFor(m) && <span className="tag">{tagFor(m)}</span>}
            <div className="bubble">{m.role === 'user' ? m.content : <Words text={m.content} />}</div>
            {m.saved && m.saved.length > 0 && (
              <span className="savednote">❂ Elias placed {m.saved.map(t => `“${t}”`).join(', ')} in your Evidence Box</span>
            )}
            <CopyButton text={m.content} />
          </div>
        ))}
        {busy && <div className="msg him"><div className="bubble typing"><span /><span /><span /></div></div>}
        <div ref={endRef} />
      </main>
      {onSend && (
        <footer className="composer">
          {mic.listening && <p className="listening">Listening… speak freely, then tap ■ to stop</p>}
          <div className="inputrow">
            <textarea value={text} placeholder={placeholder} rows={tall ? 5 : 1} onChange={e => setText(e.target.value)} />
            {mic.supported && (
              <button className={'mic' + (mic.listening ? ' on' : '')} onClick={mic.toggle} aria-label={mic.listening ? 'Stop listening' : 'Speak'}>
                {mic.listening ? '■' : '🎙'}
              </button>
            )}
            <button className="send" onClick={send} disabled={busy || !text.trim()} aria-label="Send">➤</button>
          </div>
        </footer>
      )}
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
      return true
    } catch (e) {
      if (e.status === 401) { onAuthFail(); return false }
      setHistory(h => h.slice(0, -1)); setErr(e.message); return false
    } finally { setBusy(false) }
  }

  return (
    <div className="chat">
      <Header title={<><span className="glyph">☾</span> Elias</>} />
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
        empty={<div className="welcome"><div className="moon small" /><p>Elias is here, little one.</p></div>}
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
function Settings({ apiKey, onAuthFail }) {
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
      <Header title="Settings" />
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
