import { useCallback, useEffect, useRef, useState } from 'react'
import { SONGS, thumbnailUrl, youtabsUrl, youtubeUrl } from './songs'
import { createPlayer } from './youtube'
import SongView from './SongView'
import './App.css'

// URL の #<曲のid> で曲を選ぶ（友人にそのまま曲のリンクを送れる）
function songFromHash() {
  const id = decodeURIComponent(window.location.hash.slice(1))
  return SONGS.find((song) => song.id === id) ?? SONGS[0]
}

function App() {
  const [song, setSong] = useState(songFromHash)
  const [videoState, setVideoState] = useState('idle') // idle | loading | ready | playing | paused
  const mediaRef = useRef(null)
  const playerRef = useRef(null)
  const startingRef = useRef(false)

  // 動画のプレーヤーを片付けて、サムネイルの状態に戻す
  const resetPlayer = useCallback(() => {
    playerRef.current?.destroy?.()
    playerRef.current = null
    startingRef.current = false
    mediaRef.current?.querySelectorAll('iframe, .yt-holder').forEach((node) => node.remove())
    setVideoState('idle')
  }, [])

  useEffect(() => {
    const onHashChange = () => {
      resetPlayer()
      setSong(songFromHash())
    }
    window.addEventListener('hashchange', onHashChange)
    return () => window.removeEventListener('hashchange', onHashChange)
  }, [resetPlayer])

  useEffect(() => () => playerRef.current?.destroy?.(), [])

  // 動画のプレーヤーを作って再生する（サムネイルや「動画と同期」を押したとき）
  const startVideo = useCallback(async () => {
    if (playerRef.current) {
      playerRef.current.playVideo()
      return
    }
    if (startingRef.current || !mediaRef.current) return
    startingRef.current = true
    setVideoState('loading')
    const holder = document.createElement('div')
    holder.className = 'yt-holder'
    mediaRef.current.appendChild(holder)
    try {
      playerRef.current = await createPlayer(holder, song.videoId, { autoplay: true, onState: setVideoState })
    } catch {
      holder.remove()
      setVideoState('idle')
    } finally {
      startingRef.current = false
    }
  }, [song.videoId])

  const video = {
    state: videoState,
    start: startVideo,
    pause: () => playerRef.current?.pauseVideo(),
    getTime: useCallback(() => playerRef.current?.getCurrentTime?.() ?? 0, []),
  }

  useEffect(() => {
    document.title = `${song.title} | TAB譜ビューア`
  }, [song])

  return (
    <div className="page" style={{ '--accent': song.accent }}>
      <nav className="song-picker" aria-label="曲を選ぶ">
        {SONGS.map((s, i) => (
          <a
            key={s.id}
            href={`#${s.id}`}
            className={s.id === song.id ? 'active' : ''}
            aria-current={s.id === song.id ? 'page' : undefined}
          >
            <em>{String(i + 1).padStart(2, '0')}</em>
            <strong>{s.title}</strong>
            <span>{s.artist}</span>
          </a>
        ))}
      </nav>

      <header className="hero">
        <div className="hero-text">
          <p className="eyebrow">Band Score Viewer</p>
          <h1>{song.title}</h1>
          {song.subtitle && <p className="subtitle">{song.subtitle}</p>}
          <p className="artist">{song.artist}</p>
          <div className="hero-actions">
            <a className="btn primary" href={youtabsUrl(song.videoId)} target="_blank" rel="noreferrer">
              YouTabsで採譜する
            </a>
            <a className="btn ghost" href={youtubeUrl(song.videoId)} target="_blank" rel="noreferrer">
              YouTubeで聴く
            </a>
          </div>
        </div>

        <div className="hero-media" ref={mediaRef}>
          {videoState === 'idle' && (
            <button type="button" className="thumb" onClick={startVideo} aria-label="動画を再生">
              <img src={thumbnailUrl(song.videoId)} alt="" />
              <span className="play" aria-hidden="true">
                <svg viewBox="0 0 24 24" width="22" height="22">
                  <path d="M8 5.5v13l11-6.5z" fill="currentColor" />
                </svg>
              </span>
            </button>
          )}
        </div>
      </header>

      <SongView key={song.id} song={song} video={video} />

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
