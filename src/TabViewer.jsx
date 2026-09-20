import { useEffect, useRef, useState } from 'react'
import * as alphaTab from '@coderline/alphatab'
import { prepareTracks } from './tabs'
import { buildTimeline, locate } from './timeline'

const SETTINGS = {
  core: { fontDirectory: `${import.meta.env.BASE_URL}font/` },
  // 調弦の文字と、強弱記号（f・ff・mp など）や cresc./dim. の記号は描かない
  notation: { elements: { guitarTuning: false, effectDynamics: false, effectCrescendo: false } },
  display: {
    staveProfile: 'Tab',
    scale: 0.95,
    resources: {
      staffLineColor: '#b8b1a4',
      barSeparatorColor: '#2a2926',
      barNumberColor: '#8c8578',
      mainGlyphColor: '#1f1e1b',
      secondaryGlyphColor: '#8c8578',
      scoreInfoColor: '#1f1e1b',
    },
  },
  player: { enablePlayer: false, enableCursor: false },
}

// 小節の中の位置（ティック）に対応する横位置を、拍の位置から線形に求める
function cursorX(masterBarBounds, tick, barTicks) {
  const left = masterBarBounds.visualBounds.x
  const right = left + masterBarBounds.visualBounds.w
  const beats = masterBarBounds.bars[0]?.beats ?? []

  const marks = new Map()
  for (const bounds of beats) {
    const start = bounds.beat.playbackStart
    if (!marks.has(start)) marks.set(start, bounds.onNotesX)
  }
  const points = [...marks.entries()].sort((a, b) => a[0] - b[0])
  if (points.length === 0) return left

  if (tick <= points[0][0]) return points[0][1]
  for (let i = 0; i < points.length - 1; i++) {
    const [t0, x0] = points[i]
    const [t1, x1] = points[i + 1]
    if (tick <= t1) return x0 + ((x1 - x0) * (tick - t0)) / (t1 - t0 || 1)
  }
  // 最後の拍から小節の終わりまで
  const [lastTick, lastX] = points[points.length - 1]
  return lastX + (right - lastX) * Math.min(1, (tick - lastTick) / Math.max(1, barTicks - lastTick))
}

// controlRef に、動画の再生位置に合わせてカーソルを動かす操作を渡す
//   setTime(秒 | null)  カーソルを動かす（null で隠す）
//   cursorRect()        カーソルの画面上の位置（追従スクロール用）
function TabViewer({ score, trackIndexes, kind, zoom, controlRef }) {
  const hostRef = useRef(null)
  const apiRef = useRef(null)
  const boundsRef = useRef(null)
  const [busy, setBusy] = useState(true)

  useEffect(() => {
    const api = new alphaTab.AlphaTabApi(hostRef.current, SETTINGS)
    // alphaTab は拍にカーソルを合わせるたびに、ページを自動でスクロールしようとする。
    // カーソルは自前で描くので、この自動スクロールだけを無効にする（曲を選んだ直後にTABまで飛ぶのを防ぐ）
    api.uiFacade.scrollToY = () => {}
    api.uiFacade.scrollToX = () => {}
    api.renderStarted.on(() => setBusy(true))
    api.renderFinished.on(() => setBusy(false))
    // 小節・拍の座標は、描画が終わったあとに使えるようになる
    api.postRenderFinished.on(() => {
      boundsRef.current = api.renderer.boundsLookup
    })
    apiRef.current = api
    return () => {
      api.destroy()
      apiRef.current = null
      boundsRef.current = null
    }
  }, [])

  useEffect(() => {
    const api = apiRef.current
    if (!api) return
    prepareTracks(score, trackIndexes, kind)
    api.renderScore(score, trackIndexes)
  }, [score, trackIndexes, kind])

  useEffect(() => {
    const host = hostRef.current
    const cursor = document.createElement('div')
    cursor.className = 'tab-cursor'
    cursor.hidden = true
    host.appendChild(cursor)

    const timeline = buildTimeline(score)
    const control = {
      setTime(seconds) {
        const lookup = boundsRef.current
        const position = seconds == null || !lookup ? null : locate(timeline, seconds)
        const masterBar = position && lookup.findMasterBarByIndex(position.barIndex)
        if (!masterBar) {
          cursor.hidden = true
          return
        }
        const { y, h } = masterBar.visualBounds
        cursor.style.transform = `translate(${cursorX(masterBar, position.tick, position.ticks)}px, ${y}px)`
        cursor.style.height = `${h}px`
        cursor.hidden = false
      },
      cursorRect() {
        return cursor.hidden ? null : cursor.getBoundingClientRect()
      },
    }
    controlRef.current = control

    return () => {
      cursor.remove()
      if (controlRef.current === control) controlRef.current = null
    }
  }, [score, controlRef])

  return (
    <div className="tab-view">
      {busy && <p className="tab-busy">TAB譜を描画しています…</p>}
      <div className="tab-host" ref={hostRef} style={{ zoom }} />
    </div>
  )
}

export default TabViewer
