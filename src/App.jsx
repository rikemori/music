import { useEffect, useMemo, useRef, useState } from 'react'
import { SONG, embedUrl, thumbnailUrl, youtabsUrl, youtubeUrl } from './songs'
import {
  buildVariants,
  extractLyricLines,
  fetchLyrics,
  fetchTabFile,
  hasTabData,
  parseScore,
  pickTrackIndexes,
  tabFileNames,
} from './tabs'
import TabViewer from './TabViewer'
import './App.css'

const FILE_ACCEPT = '.gp,.gpx,.gp5,.gp4,.gp3,.musicxml,.mxl,.xml'

function readyState(score, indexes, fileName) {
  return { status: 'ready', score, variants: buildVariants(score, indexes), fileName }
}

function stateFromFile(kind, fileName, bytes) {
  try {
    const score = parseScore(bytes)
    const indexes = pickTrackIndexes(score, kind)
    return indexes.length === 0 ? { status: 'noTrack', fileName } : readyState(score, indexes, fileName)
  } catch {
    return { status: 'error', fileName }
  }
}

// 読み込んだ全ファイルの中から、その楽器に合うパートを探す（弦・フレット入りを優先）
function stateFromFiles(kind, parsed) {
  if (parsed.length === 0) return { status: 'missing' }

  const withTab = (file, indexes) => indexes.every((i) => hasTabData(file.score.tracks[i]))
  const candidates = parsed
    .filter((file) => file.score)
    .map((file) => ({ file, indexes: pickTrackIndexes(file.score, kind) }))
    .filter((c) => c.indexes.length > 0)
    .sort((a, b) => Number(withTab(b.file, b.indexes)) - Number(withTab(a.file, a.indexes)))

  if (candidates.length > 0) {
    const { file, indexes } = candidates[0]
    return readyState(file.score, indexes, file.name)
  }
  const readable = parsed.find((file) => file.score)
  return readable ? { status: 'noTrack', fileName: readable.name } : { status: 'error', fileName: parsed[0].name }
}

function FilePicker({ className, children, onPick }) {
  return (
    <label className={className}>
      {children}
      <input
        type="file"
        accept={FILE_ACCEPT}
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) onPick(file)
          e.target.value = ''
        }}
      />
    </label>
  )
}

function EmptyState({ instrument, state, onPick }) {
  const messages = {
    missing: `${instrument.label}のTAB譜がまだありません`,
    noTrack: `${state.fileName} に${instrument.label}のパートが見つかりませんでした`,
    error: `${state.fileName} を読み込めませんでした`,
  }

  return (
    <div className="empty">
      <p className="empty-title">{messages[state.status]}</p>
      <p className="empty-text">
        YouTabsで書き出した .gp / .musicxml を <code>public/tabs/</code> に置くと、ここに表示されます。
        <br />
        すぐ確認したいときは、ファイルを選んでください（今回の表示のみ）。
      </p>
      <FilePicker className="btn ghost" onPick={onPick}>
        ファイルを選ぶ
      </FilePicker>
    </div>
  )
}

function App() {
  const [activeId, setActiveId] = useState(SONG.instruments[0].id)
  const [tabs, setTabs] = useState(() => Object.fromEntries(SONG.instruments.map((i) => [i.id, { status: 'loading' }])))
  const [lyricsText, setLyricsText] = useState(null)
  const [previewing, setPreviewing] = useState(false)
  const [variantIds, setVariantIds] = useState({})
  const [showLyrics, setShowLyrics] = useState(true)
  const [autoScroll, setAutoScroll] = useState(false)
  const [scrollSpeed, setScrollSpeed] = useState(60)
  const speedRef = useRef(60)
  const paperRef = useRef(null)
  const workspaceRef = useRef(null)

  useEffect(() => {
    let cancelled = false

    async function load() {
      const [loaded, text] = await Promise.all([Promise.all(tabFileNames.map(fetchTabFile)), fetchLyrics()])
      const parsed = loaded.filter(Boolean).map((file) => {
        try {
          return { name: file.name, score: parseScore(file.bytes) }
        } catch {
          return { name: file.name, score: null }
        }
      })
      if (cancelled) return
      setLyricsText(text ?? '')
      setTabs(Object.fromEntries(SONG.instruments.map((i) => [i.id, stateFromFiles(i.kind, parsed)])))
    }

    load()
    return () => {
      cancelled = true
    }
  }, [])

  const handlePick = async (instrument, file) => {
    const bytes = new Uint8Array(await file.arrayBuffer())
    setTabs((prev) => ({ ...prev, [instrument.id]: stateFromFile(instrument.kind, file.name, bytes) }))
  }

  const lyricLines = useMemo(() => {
    if (lyricsText) return lyricsText.split(/\r?\n/).map((line) => line.trim())
    for (const instrument of SONG.instruments) {
      const state = tabs[instrument.id]
      if (state.status === 'ready') {
        const lines = extractLyricLines(state.score)
        if (lines.length > 0) return lines
      }
    }
    return []
  }, [lyricsText, tabs])

  // TABの枠を一定の速さで下へ流す（枠の下端まで来たら止まる）
  useEffect(() => {
    if (!autoScroll) return
    const el = paperRef.current
    if (!el) return

    let frame
    let last = performance.now()
    let position = el.scrollTop
    const tick = (now) => {
      const elapsed = (now - last) / 1000
      last = now
      if (Math.abs(el.scrollTop - position) > 2) position = el.scrollTop // 指で動かされたら、その位置から続ける
      position += speedRef.current * elapsed
      el.scrollTop = position
      const maxScroll = el.scrollHeight - el.clientHeight
      if (maxScroll > 50 && el.scrollTop >= maxScroll - 1) {
        setAutoScroll(false)
        return
      }
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [autoScroll])

  const toggleAutoScroll = () => {
    if (autoScroll) {
      setAutoScroll(false)
      return
    }
    setAutoScroll(true)
    // 歌詞とTABが一画面に収まる位置に合わせる
    workspaceRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  const changeSpeed = (value) => {
    speedRef.current = value
    setScrollSpeed(value)
  }

  // 楽器・パートを変えたら、自動スクロールは止めて先頭に戻す
  const resetScroll = () => {
    setAutoScroll(false)
    if (paperRef.current) paperRef.current.scrollTop = 0
  }

  const activeInstrument = SONG.instruments.find((i) => i.id === activeId)
  const active = tabs[activeId]
  const variant =
    active.status === 'ready' ? (active.variants.find((v) => v.id === variantIds[activeId]) ?? active.variants[0]) : null
  const autoTab = variant ? variant.indexes.some((i) => !hasTabData(active.score.tracks[i])) : false

  return (
    <div className="page">
      <header className="hero">
        <div className="hero-text">
          <p className="eyebrow">Band Score Viewer</p>
          <h1>{SONG.title}</h1>
          <p className="subtitle">{SONG.subtitle}</p>
          <p className="artist">{SONG.artist}</p>
          <div className="hero-actions">
            <a className="btn primary" href={youtabsUrl(SONG.id)} target="_blank" rel="noreferrer">
              YouTabsで採譜する
            </a>
            <a className="btn ghost" href={youtubeUrl(SONG.id)} target="_blank" rel="noreferrer">
              YouTubeで聴く
            </a>
          </div>
        </div>

        <div className="hero-media">
          {previewing ? (
            <iframe
              src={embedUrl(SONG.id)}
              title={`${SONG.title} のプレビュー`}
              allow="autoplay; encrypted-media; picture-in-picture"
              allowFullScreen
            />
          ) : (
            <button type="button" className="thumb" onClick={() => setPreviewing(true)} aria-label="動画をプレビュー">
              <img src={thumbnailUrl(SONG.id)} alt="" />
              <span className="play" aria-hidden="true">
                <svg viewBox="0 0 24 24" width="22" height="22">
                  <path d="M8 5.5v13l11-6.5z" fill="currentColor" />
                </svg>
              </span>
            </button>
          )}
        </div>
      </header>

      <main className="workspace" ref={workspaceRef}>
        {showLyrics && (
          <aside className="lyrics" aria-label="歌詞">
            <div className="lyrics-head">
              <h2>Lyrics</h2>
              <p className="lyrics-note">どの楽器のTAB譜を見ていても表示されます。</p>
            </div>
            {lyricLines.length > 0 ? (
              <ol className="lyric-lines">
                {lyricLines.map((line, i) =>
                  line ? <li key={i}>{line}</li> : <li key={i} className="gap" aria-hidden="true" />,
                )}
              </ol>
            ) : (
              <p className="lyrics-empty">
                まだ歌詞がありません。
                <br />
                <br />
                <code>public/tabs/</code> に歌詞の .txt（名前は自由）を置いて1行ずつ書くと、ここに表示されます。
              </p>
            )}
          </aside>
        )}
        <section className="score" aria-label="TAB譜">
          <div className="score-head">
            <div className="score-title">
              <h2>Tablature</h2>
              <button
                type="button"
                className="lyrics-toggle"
                aria-pressed={showLyrics}
                onClick={() => setShowLyrics((shown) => !shown)}
              >
                歌詞 {showLyrics ? '隠す' : '表示'}
              </button>
            </div>
            <div className="switch" role="tablist" aria-label="楽器を切り替え">
              {SONG.instruments.map((instrument) => (
                <button
                  key={instrument.id}
                  type="button"
                  role="tab"
                  aria-selected={instrument.id === activeId}
                  className={instrument.id === activeId ? 'active' : ''}
                  onClick={() => {
                    resetScroll()
                    setActiveId(instrument.id)
                  }}
                >
                  {instrument.label}
                </button>
              ))}
            </div>
          </div>

          {active.status === 'ready' && active.variants.length > 1 && (
            <div className="variants" role="group" aria-label={`${activeInstrument.label}のパート`}>
              {active.variants.map((v) => (
                <button
                  key={v.id}
                  type="button"
                  className={v.id === variant.id ? 'active' : ''}
                  onClick={() => {
                    resetScroll()
                    setVariantIds((prev) => ({ ...prev, [activeId]: v.id }))
                  }}
                >
                  {v.label}
                </button>
              ))}
            </div>
          )}

          <div className="scroll-bar">
            <button
              type="button"
              className="scroll-toggle"
              aria-pressed={autoScroll}
              onClick={toggleAutoScroll}
              disabled={active.status !== 'ready'}
            >
              {autoScroll ? '■ 停止' : '▶ 自動スクロール'}
            </button>
            <label className="scroll-speed">
              <span>速さ</span>
              <input
                type="range"
                min="10"
                max="200"
                step="5"
                value={scrollSpeed}
                onChange={(e) => changeSpeed(Number(e.target.value))}
                aria-label="自動スクロールの速さ"
              />
              <output>{scrollSpeed}</output>
            </label>
            <span className="scroll-hint">TAB譜をタップしても、始まる・止まります</span>
          </div>

          <div
            className={`paper ${active.status === 'ready' ? 'tappable' : ''}`}
            ref={paperRef}
            onClick={active.status === 'ready' ? toggleAutoScroll : undefined}
          >
            {active.status === 'loading' && <p className="loading">読み込み中…</p>}
            {active.status === 'ready' && (
              <>
                <TabViewer
                  key={activeId}
                  score={active.score}
                  trackIndexes={variant.indexes}
                  kind={activeInstrument.kind}
                />
                <div className="file-note" onClick={(e) => e.stopPropagation()}>
                  <span>
                    {active.fileName}
                    {variant.label && `・${variant.label}`}
                    {autoTab && <em>弦・フレットは音の高さから自動で割り当てています（この形式には弦の情報がないため）</em>}
                  </span>
                  <FilePicker className="file-link" onPick={(file) => handlePick(activeInstrument, file)}>
                    別のファイルを読み込む
                  </FilePicker>
                </div>
              </>
            )}
            {['missing', 'noTrack', 'error'].includes(active.status) && (
              <EmptyState instrument={activeInstrument} state={active} onPick={(file) => handlePick(activeInstrument, file)} />
            )}
          </div>
        </section>
      </main>

      <footer className="footer">
        <p>
          採譜はYouTabs（外部サービス）が行います。バンド全体の音からの採譜は、曲によって精度に限りがあります。
          <br />
          歌詞・楽譜は個人で楽しむ範囲でご利用ください。
        </p>
      </footer>
    </div>
  )
}

export default App
