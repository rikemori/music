import { useEffect, useMemo, useRef, useState } from 'react'
import { INSTRUMENTS } from './songs'
import {
  buildVariants,
  extractLyricLines,
  fetchLyrics,
  fetchTabFile,
  getSongFiles,
  hasTabData,
  parseScore,
  pickTrackIndexes,
} from './tabs'
import TabViewer from './TabViewer'
import './App.css'

const ZOOM_KEY = 'music:tabZoom'
const ZOOM_MIN = 0.3
const ZOOM_MAX = 4
const clampZoom = (value) => Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, value))
const nowMs = () => performance.now()

// 前回の拡大率。なければ、スマホでは画面の幅に合わせた大きさ、PCでは等倍にする
function initialZoom() {
  try {
    const saved = Number(localStorage.getItem(ZOOM_KEY))
    if (saved >= ZOOM_MIN && saved <= ZOOM_MAX) return saved
  } catch {
    // 読めなければ既定値を使う
  }
  return window.innerWidth <= 560 ? clampZoom((window.innerWidth - 40) / 640) : 1
}

const OFFSET_KEY = (songId) => `music:syncOffset:${songId}`

function loadOffset(songId) {
  try {
    const value = Number(localStorage.getItem(OFFSET_KEY(songId)))
    return Number.isFinite(value) ? value : 0
  } catch {
    return 0
  }
}

const formatSeconds = (value) =>
  `${value < 0 ? '-' : ''}${Math.floor(Math.abs(value) / 60)}:${(Math.abs(value) % 60).toFixed(1).padStart(4, '0')}`

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

function EmptyState({ instrument, state, folder, onPick }) {
  const messages = {
    missing: `${instrument.label}のTAB譜がまだありません`,
    noTrack: `${state.fileName} に${instrument.label}のパートが見つかりませんでした`,
    error: `${state.fileName} を読み込めませんでした`,
  }

  return (
    <div className="empty">
      <p className="empty-title">{messages[state.status]}</p>
      <p className="empty-text">
        YouTabsで書き出した .gp / .musicxml を <code>{folder}</code> に置くと、ここに表示されます。
        <br />
        すぐ確認したいときは、ファイルを選んでください（今回の表示のみ）。
      </p>
      <FilePicker className="btn ghost" onPick={onPick}>
        ファイルを選ぶ
      </FilePicker>
    </div>
  )
}

// 1曲ぶんの画面（歌詞・TAB譜）。曲を切り替えると作り直される
function SongView({ song, video }) {
  const folder = `public/tabs/${song.id}/`
  const [activeId, setActiveId] = useState(INSTRUMENTS[0].id)
  const [tabs, setTabs] = useState(() => Object.fromEntries(INSTRUMENTS.map((i) => [i.id, { status: 'loading' }])))
  const [lyricsText, setLyricsText] = useState(null)
  const [variantIds, setVariantIds] = useState({})
  const [showLyrics, setShowLyrics] = useState(true)
  const [autoScroll, setAutoScroll] = useState(false)
  const [scrollSpeed, setScrollSpeed] = useState(60)
  const speedRef = useRef(60)
  const paperRef = useRef(null)
  const [zoom, setZoom] = useState(initialZoom)
  const zoomRef = useRef(zoom)
  const pinchEndRef = useRef(0)
  const zoomGestureRef = useRef(false)
  const wheelTimerRef = useRef(0)
  const workspaceRef = useRef(null)
  const viewerRef = useRef(null)
  const [follow, setFollow] = useState(true)
  const followRef = useRef(true)
  const [offset, setOffset] = useState(() => loadOffset(song.id))
  const offsetRef = useRef(offset)

  useEffect(() => {
    let cancelled = false

    async function load() {
      const files = getSongFiles(song.id)
      const [loaded, text] = await Promise.all([
        Promise.all(files.map((name) => fetchTabFile(song.id, name))),
        fetchLyrics(song.id),
      ])
      const parsed = loaded.filter(Boolean).map((file) => {
        try {
          return { name: file.name, score: parseScore(file.bytes) }
        } catch {
          return { name: file.name, score: null }
        }
      })
      if (cancelled) return
      setLyricsText(text ?? '')
      setTabs(Object.fromEntries(INSTRUMENTS.map((i) => [i.id, stateFromFiles(i.kind, parsed)])))
    }

    load()
    return () => {
      cancelled = true
    }
  }, [song.id])

  const handlePick = async (instrument, file) => {
    const bytes = new Uint8Array(await file.arrayBuffer())
    setTabs((prev) => ({ ...prev, [instrument.id]: stateFromFile(instrument.kind, file.name, bytes) }))
  }

  const lyricLines = useMemo(() => {
    if (lyricsText) return lyricsText.split(/\r?\n/).map((line) => line.trim())
    for (const instrument of INSTRUMENTS) {
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
      position += speedRef.current * zoomRef.current * elapsed
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

  // 拡大率を変える。指の位置（cx, cy）にある場所が、動かないように位置を合わせる。
  // live のとき（ピンチ中）は、画面の更新（React・TABの再描画）を後回しにして、動きを軽くする
  const applyZoom = (next, cx, cy, live = false) => {
    const el = paperRef.current
    const value = clampZoom(next)
    const ratio = value / zoomRef.current
    zoomRef.current = value
    if (!live) setZoom(value)
    if (!el) return
    const host = el.querySelector('.tab-host')
    if (host) host.style.zoom = value
    el.scrollLeft = (el.scrollLeft + cx) * ratio - cx
    el.scrollTop = (el.scrollTop + cy) * ratio - cy
  }

  // ピンチの間は、TABの幅を固定してレイアウトのやり直しを防ぎ、終わったときに1回だけ整える
  const beginZoomGesture = () => {
    const host = paperRef.current?.querySelector('.tab-host')
    if (!host || zoomGestureRef.current) return
    zoomGestureRef.current = true
    host.style.width = `${host.clientWidth}px`
  }

  const endZoomGesture = () => {
    if (!zoomGestureRef.current) return
    zoomGestureRef.current = false
    const host = paperRef.current?.querySelector('.tab-host')
    if (host) host.style.width = ''
    setZoom(zoomRef.current)
  }

  const zoomBy = (factor) => {
    const el = paperRef.current
    if (el) applyZoom(zoomRef.current * factor, el.clientWidth / 2, el.clientHeight / 2)
  }

  // TABの幅がちょうど枠に収まる大きさにする
  const fitZoom = () => {
    const el = paperRef.current
    const host = el?.querySelector('.tab-host')
    if (!el || !host) return
    const style = getComputedStyle(el)
    const available = el.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight)
    applyZoom(available / parseFloat(getComputedStyle(host).minWidth), 0, 0)
    el.scrollLeft = 0
  }

  useEffect(() => {
    try {
      localStorage.setItem(ZOOM_KEY, String(zoom))
    } catch {
      // 保存できない環境では、今回だけの設定になる
    }
  }, [zoom])

  // ピンチ（2本指）と、Ctrl+ホイール／トラックパッドのピンチで拡大縮小する
  useEffect(() => {
    const el = paperRef.current
    if (!el) return

    const distance = (t) => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY)
    const center = (t) => {
      const rect = el.getBoundingClientRect()
      return { x: (t[0].clientX + t[1].clientX) / 2 - rect.left, y: (t[0].clientY + t[1].clientY) / 2 - rect.top }
    }

    let pinch = null
    const onTouchStart = (e) => {
      if (e.touches.length !== 2) return
      pinch = { distance: distance(e.touches), zoom: zoomRef.current }
      beginZoomGesture()
    }
    const onTouchMove = (e) => {
      if (!pinch || e.touches.length !== 2) return
      e.preventDefault()
      const c = center(e.touches)
      applyZoom(pinch.zoom * (distance(e.touches) / pinch.distance), c.x, c.y, true)
    }
    const onTouchEnd = (e) => {
      if (pinch && e.touches.length < 2) {
        pinch = null
        pinchEndRef.current = nowMs()
        endZoomGesture()
      }
    }
    const onWheel = (e) => {
      if (!e.ctrlKey) return
      e.preventDefault()
      beginZoomGesture()
      const rect = el.getBoundingClientRect()
      applyZoom(zoomRef.current * Math.exp(-e.deltaY * 0.01), e.clientX - rect.left, e.clientY - rect.top, true)
      clearTimeout(wheelTimerRef.current)
      wheelTimerRef.current = setTimeout(endZoomGesture, 180)
    }

    el.addEventListener('touchstart', onTouchStart, { passive: true })
    el.addEventListener('touchmove', onTouchMove, { passive: false })
    el.addEventListener('touchend', onTouchEnd)
    el.addEventListener('touchcancel', onTouchEnd)
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => {
      el.removeEventListener('touchstart', onTouchStart)
      el.removeEventListener('touchmove', onTouchMove)
      el.removeEventListener('touchend', onTouchEnd)
      el.removeEventListener('touchcancel', onTouchEnd)
      el.removeEventListener('wheel', onWheel)
      clearTimeout(wheelTimerRef.current)
    }
    // applyZoom は最新の状態を参照する参照（ref）と setState だけを使うので、付け替えは不要
  }, [])

  useEffect(() => {
    try {
      localStorage.setItem(OFFSET_KEY(song.id), String(offset))
    } catch {
      // 保存できない環境では、今回だけの設定になる
    }
  }, [offset, song.id])

  const changeOffset = (value) => {
    offsetRef.current = value
    setOffset(value)
  }

  // 動画の再生位置に合わせて、カーソルを動かす（再生中は毎フレーム、止まっているときは0.25秒ごと）
  const videoActive = video.state !== 'idle' && video.state !== 'loading'
  const videoPlaying = video.state === 'playing'
  const getVideoTime = video.getTime
  useEffect(() => {
    if (!videoActive) {
      viewerRef.current?.setTime(null)
      return
    }

    const update = () => viewerRef.current?.setTime(getVideoTime() - offsetRef.current)

    // カーソルが枠の外に出そうなら、枠の中に滑らかに戻す
    const followCursor = () => {
      const paper = paperRef.current
      const cursor = viewerRef.current?.cursorRect()
      if (!paper || !cursor) return
      const box = paper.getBoundingClientRect()
      const top = cursor.top - box.top
      if (top < box.height * 0.05 || cursor.bottom - box.top > box.height * 0.95) {
        paper.scrollTop += (top - box.height * 0.15) * 0.12
      }
      const left = cursor.left - box.left
      if (left < box.width * 0.1 || left > box.width * 0.8) paper.scrollLeft += (left - box.width * 0.3) * 0.15
    }

    if (!videoPlaying) {
      update()
      const timer = setInterval(update, 250)
      return () => clearInterval(timer)
    }

    let frame
    const step = () => {
      update()
      if (followRef.current) followCursor()
      frame = requestAnimationFrame(step)
    }
    frame = requestAnimationFrame(step)
    return () => cancelAnimationFrame(frame)
  }, [videoActive, videoPlaying, getVideoTime])

  const toggleFollow = (checked) => {
    followRef.current = checked
    setFollow(checked)
  }

  // 動画の再生／一時停止。手動の自動スクロールとは同時に使わない
  const toggleVideo = () => {
    setAutoScroll(false)
    if (videoPlaying) video.pause()
    else video.start()
  }

  const toggleAutoScroll = () => {
    if (nowMs() - pinchEndRef.current < 400) return // ピンチの直後に、誤って開始・停止しない
    if (videoActive) {
      toggleVideo() // 動画と同期しているときは、TABのタップで動画を再生／一時停止する
      return
    }
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

  const activeInstrument = INSTRUMENTS.find((i) => i.id === activeId)
  const active = tabs[activeId]
  const variant =
    active.status === 'ready' ? (active.variants.find((v) => v.id === variantIds[activeId]) ?? active.variants[0]) : null
  const autoTab = variant ? variant.indexes.some((i) => !hasTabData(active.score.tracks[i])) : false

  return (
    <main className={`workspace ${videoActive ? 'syncing' : ''}`} ref={workspaceRef}>
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
              <code>{folder}</code> に歌詞の .txt（名前は自由）を置いて1行ずつ書くと、ここに表示されます。
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
            {INSTRUMENTS.map((instrument) => (
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
          <button
            type="button"
            className="sync-toggle"
            aria-pressed={videoPlaying}
            onClick={toggleVideo}
            disabled={active.status !== 'ready' || video.state === 'loading'}
          >
            {video.state === 'loading' ? '読み込み中…' : videoPlaying ? '⏸ 一時停止' : videoActive ? '▶ 再生' : '▶ 動画と同期'}
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
          <div className="zoom-controls" role="group" aria-label="TAB譜の拡大縮小">
            <button type="button" onClick={() => zoomBy(1 / 1.2)} aria-label="縮小">
              －
            </button>
            <output aria-live="polite">{Math.round(zoom * 100)}%</output>
            <button type="button" onClick={() => zoomBy(1.2)} aria-label="拡大">
              ＋
            </button>
            <button type="button" className="zoom-fit" onClick={fitZoom}>
              フィット
            </button>
            <span className="zoom-hint">ピンチで拡大縮小</span>
          </div>
          <span className="scroll-hint">TAB譜をタップで自動スクロール（動画と同期中は再生／停止）／2本指で拡大縮小</span>
        </div>

        {videoActive && (
          <div className="sync-bar">
            <span className="sync-label">TABの頭＝動画の</span>
            <output>{formatSeconds(offset)}</output>
            <button type="button" onClick={() => changeOffset(Math.max(0, video.getTime()))}>
              いまここ
            </button>
            <span className="sync-nudge">
              <button type="button" onClick={() => changeOffset(offset - 0.5)} aria-label="0.5秒早く">
                −0.5
              </button>
              <button type="button" onClick={() => changeOffset(offset - 0.1)} aria-label="0.1秒早く">
                −0.1
              </button>
              <button type="button" onClick={() => changeOffset(offset + 0.1)} aria-label="0.1秒遅く">
                ＋0.1
              </button>
              <button type="button" onClick={() => changeOffset(offset + 0.5)} aria-label="0.5秒遅く">
                ＋0.5
              </button>
            </span>
            <label className="follow-toggle">
              <input type="checkbox" checked={follow} onChange={(e) => toggleFollow(e.target.checked)} />
              自動で追う
            </label>
          </div>
        )}

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
                zoom={zoom}
                controlRef={viewerRef}
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
            <EmptyState
              instrument={activeInstrument}
              state={active}
              folder={folder}
              onPick={(file) => handlePick(activeInstrument, file)}
            />
          )}
        </div>
      </section>
    </main>
  )
}

export default SongView
