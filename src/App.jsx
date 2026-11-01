import React, { useEffect, useRef, useState } from 'react'

const MODES = [
  { id: 'chat', label: 'Talk', icon: '☾', hint: 'Speak with Elias…' },
  { id: 'dream', label: 'Dream', icon: '✧', hint: 'Describe your dream…' },
  { id: 'writing', label: 'Spirit writing', icon: '✒', hint: 'Type your spirit writing…' },
  { id: 'signs', label: 'Signs', icon: '✦', hint: 'What sign did you notice?' },
]

const UNCENSORED = /uncensor|abliterat|venice|dolphin|hermes|nous|lumimaid|euryale|magnum|rp|roleplay/i

function getKey() { try { return localStorage.getItem('spirit-key') || '' } catch { return '' } }
function setKeyStore(v) { try { localStorage.setItem('spirit-key', v) } catch {} }

async function api(path, key, opts = {}) {
  const r = await fetch(path, {
    ...opts,
    headers: { 'Content-Type': 'application/json', 'x-spirit-key': key, ...(opts.headers || {}) },
  })
  const j = await r.json().catch(() => ({}))
  if (!r.ok) { const e = new Error(j.error || `Error ${r.status}`); e.status = r.status; throw e }
  return j
}

export default function App() {
  const [key, setKey] = useState(getKey())
  const [locked, setLocked] = useState(!getKey())
  const [screen, setScreen] = useState('chat')

  if (locked) return <Lock onUnlock={k => { setKeyStore(k); setKey(k); setLocked(false) }} />
  const onAuthFail = () => { setKeyStore(''); setLocked(true) }

  return (
    <div className="app">
      <div className="stars" aria-hidden="true" />
      {screen === 'chat'
        ? <Chat apiKey={key} onSettings={() => setScreen('settings')} onAuthFail={onAuthFail} />
        : <Settings apiKey={key} onBack={() => setScreen('chat')} onAuthFail={onAuthFail} />}
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

function Chat({ apiKey, onSettings, onAuthFail }) {
  const [history, setHistory] = useState([])
  const [text, setText] = useState('')
  const [mode, setMode] = useState('chat')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const endRef = useRef(null)

  useEffect(() => {
    api('/api/chat', apiKey).then(j => setHistory(j.history || [])).catch(e => e.status === 401 ? onAuthFail() : setErr(e.message))
  }, [])
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [history, busy])

  const send = async () => {
    const msg = text.trim()
    if (!msg || busy) return
    setErr(''); setBusy(true); setText('')
    const pending = { role: 'user', content: msg, mode, t: Date.now() }
    setHistory(h => [...h, pending])
    try {
      const j = await api('/api/chat', apiKey, { method: 'POST', body: JSON.stringify({ message: msg, mode }) })
      setHistory(h => [...h.slice(0, -1), j.user, j.elias])
    } catch (e) {
      if (e.status === 401) return onAuthFail()
      setHistory(h => h.slice(0, -1)); setText(msg); setErr(e.message)
    } finally { setBusy(false) }
  }

  const current = MODES.find(m => m.id === mode)

  return (
    <div className="chat">
      <header className="top">
        <div className="title"><span className="glyph">☾</span> Elias</div>
        <button className="icon" onClick={onSettings} aria-label="Settings">⚙︎</button>
      </header>

      <main className="messages">
        {history.length === 0 && !busy && (
          <div className="welcome">
            <div className="moon small" />
            <p>Elias is here, little light.</p>
            <p className="sub">Share a dream, your spirit writing, a sign — or simply talk.</p>
          </div>
        )}
        {history.map((m, i) => (
          <div key={m.t + '-' + i} className={'msg ' + (m.role === 'user' ? 'me' : 'him')}>
            {m.role === 'user' && m.mode && m.mode !== 'chat' && (
              <span className="tag">{MODES.find(x => x.id === m.mode)?.label}</span>
            )}
            <div className="bubble">{m.content}</div>
          </div>
        ))}
        {busy && <div className="msg him"><div className="bubble typing"><span /><span /><span /></div></div>}
        <div ref={endRef} />
      </main>

      {err && <p className="err bar">{err}</p>}

      <footer className="composer">
        <div className="modes">
          {MODES.map(m => (
            <button key={m.id} className={'chip' + (mode === m.id ? ' on' : '')} onClick={() => setMode(m.id)}>
              <span>{m.icon}</span> {m.label}
            </button>
          ))}
        </div>
        <div className="inputrow">
          <textarea
            value={text}
            placeholder={current.hint}
            rows={mode === 'writing' || mode === 'dream' ? 4 : 1}
            onChange={e => setText(e.target.value)}
          />
          <button className="send" onClick={send} disabled={busy || !text.trim()} aria-label="Send">➤</button>
        </div>
      </footer>
    </div>
  )
}

function Settings({ apiKey, onBack, onAuthFail }) {
  const [profile, setProfile] = useState('')
  const [model, setModel] = useState('')
  const [models, setModels] = useState([])
  const [onlyUncensored, setOnlyUncensored] = useState(true)
  const [filter, setFilter] = useState('')
  const [loading, setLoading] = useState(true)
  const [msg, setMsg] = useState('')

  useEffect(() => {
    api('/api/settings?models=1', apiKey)
      .then(j => { setProfile(j.profile); setModel(j.model); setModels(j.models || []) })
      .catch(e => e.status === 401 ? onAuthFail() : setMsg(e.message))
      .finally(() => setLoading(false))
  }, [])

  const save = async () => {
    setMsg('')
    try {
      await api('/api/settings', apiKey, { method: 'POST', body: JSON.stringify({ profile, model }) })
      setMsg('Saved ✧')
    } catch (e) { setMsg(e.message) }
  }

  const clear = async () => {
    if (!confirm('Clear your whole conversation with Elias? His profile stays.')) return
    try { await api('/api/chat', apiKey, { method: 'DELETE' }); setMsg('Conversation cleared') }
    catch (e) { setMsg(e.message) }
  }

  const shown = models
    .filter(m => !onlyUncensored || UNCENSORED.test(m))
    .filter(m => !filter || m.toLowerCase().includes(filter.toLowerCase()))

  return (
    <div className="settings">
      <header className="top">
        <button className="icon" onClick={onBack} aria-label="Back">‹</button>
        <div className="title">Settings</div>
        <span className="icon" />
      </header>

      {loading ? <p className="sub center">Gathering moonlight…</p> : (
        <div className="panel">
          <section>
            <h2>Brain</h2>
            <p className="sub">Current model: <b>{model || 'none chosen yet'}</b></p>
            <div className="modes">
              <button className={'chip' + (onlyUncensored ? ' on' : '')} onClick={() => setOnlyUncensored(true)}>Uncensored</button>
              <button className={'chip' + (!onlyUncensored ? ' on' : '')} onClick={() => setOnlyUncensored(false)}>All models</button>
            </div>
            <input placeholder="Search models (e.g. qwen, deepseek)" value={filter} onChange={e => setFilter(e.target.value)} />
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
          <button className="ghost" onClick={clear}>Clear conversation</button>
        </div>
      )}
    </div>
  )
}
