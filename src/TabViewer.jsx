import { useEffect, useRef, useState } from 'react'
import * as alphaTab from '@coderline/alphatab'
import { prepareTracks } from './tabs'

const SETTINGS = {
  core: { fontDirectory: `${import.meta.env.BASE_URL}font/` },
  notation: { elements: { guitarTuning: false } },
  display: {
    staveProfile: 'Tab',
    scale: 0.95,
    resources: {
      staffLineColor: '#b8b1a4',
      barSeparatorColor: '#2a2926',
      barNumberColor: '#c9462a',
      mainGlyphColor: '#1f1e1b',
      secondaryGlyphColor: '#8c8578',
      scoreInfoColor: '#1f1e1b',
    },
  },
  player: { enablePlayer: false },
}

function TabViewer({ score, trackIndexes, kind }) {
  const hostRef = useRef(null)
  const apiRef = useRef(null)
  const [busy, setBusy] = useState(true)

  useEffect(() => {
    const api = new alphaTab.AlphaTabApi(hostRef.current, SETTINGS)
    api.renderStarted.on(() => setBusy(true))
    api.renderFinished.on(() => setBusy(false))
    apiRef.current = api
    return () => {
      api.destroy()
      apiRef.current = null
    }
  }, [])

  useEffect(() => {
    const api = apiRef.current
    if (!api) return
    prepareTracks(score, trackIndexes, kind)
    api.renderScore(score, trackIndexes)
  }, [score, trackIndexes, kind])

  return (
    <div className="tab-view">
      {busy && <p className="tab-busy">TAB譜を描画しています…</p>}
      <div className="tab-host" ref={hostRef} />
    </div>
  )
}

export default TabViewer
