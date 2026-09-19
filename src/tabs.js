import * as alphaTab from '@coderline/alphatab'
import tabFilesInfo from 'virtual:tab-files'

export const tabFileNames = tabFilesInfo.files
export const lyricsFileName = tabFilesInfo.lyricsFile

const publicUrl = (path) => `${import.meta.env.BASE_URL}${path}`

const isHtml = (res) => (res.headers.get('content-type') || '').includes('text/html')

export async function fetchTabFile(name) {
  try {
    const res = await fetch(publicUrl(`tabs/${name}`))
    if (!res.ok || isHtml(res)) return null
    return { name, bytes: new Uint8Array(await res.arrayBuffer()) }
  } catch {
    return null
  }
}

export async function fetchLyrics() {
  if (!lyricsFileName) return null
  try {
    const res = await fetch(publicUrl(`tabs/${lyricsFileName}`))
    if (!res.ok || isHtml(res)) return null
    const text = (await res.text()).trim()
    return text || null
  } catch {
    return null
  }
}

export function parseScore(bytes) {
  return alphaTab.importer.ScoreLoader.loadScoreFromBytes(bytes, new alphaTab.Settings())
}

// ---------- 楽器に合うパートを選ぶ ----------

const isPercussion = (track) => track.staves.some((staff) => staff.isPercussion)
const isVocal = (track) => {
  const program = track.playbackInfo.program
  return (
    !isPercussion(track) && (/ボーカル|ヴォーカル|vocal|voice|vox|歌/i.test(track.name) || (program >= 52 && program <= 54))
  )
}
const isBass = (track) => {
  const program = track.playbackInfo.program
  return (program >= 32 && program <= 39) || /bass|ベース|ﾍﾞｰｽ/i.test(track.name)
}
const isGuitar = (track) => {
  const program = track.playbackInfo.program
  return !isBass(track) && !isPercussion(track) && ((program >= 24 && program <= 31) || /guitar|ギター/i.test(track.name))
}

function allNotes(track) {
  return track.staves.flatMap((staff) =>
    staff.bars.flatMap((bar) => bar.voices.flatMap((voice) => voice.beats.flatMap((beat) => beat.notes))),
  )
}

function allBeats(track) {
  return track.staves.flatMap((staff) => staff.bars.flatMap((bar) => bar.voices.flatMap((voice) => voice.beats)))
}

function hasLyrics(track) {
  return allBeats(track).some((beat) => beat.lyrics && beat.lyrics.length > 0)
}

// 弦とフレットの情報を持っているか（Guitar Proなど）
export function hasTabData(track) {
  return allNotes(track).some((note) => note.string >= 0 && note.fret >= 0)
}

// 楽器に合うパートの番号を、すべて返す（見つからなければ空）
export function pickTrackIndexes(score, kind) {
  const matcher = kind === 'bass' ? isBass : isGuitar
  const found = score.tracks.flatMap((track, i) => (matcher(track) ? [i] : []))
  if (found.length > 0 || kind !== 'guitar') return found
  const fallback = score.tracks.findIndex((t) => !isBass(t) && !isPercussion(t) && !isVocal(t) && !hasLyrics(t))
  return fallback >= 0 ? [fallback] : []
}

// 「Distorted Electric Guitar — 低音域の参照」のように名前が分かれているとき、末尾の部分を表示名にする
function partLabel(track, order) {
  const part = track.name.split(/\s[—–-]\s/)[1]?.trim()
  return part ? part.replace(/の参照$/, '') : `パート${order + 1}`
}

// 同じ楽器のパートが複数あるときは、「すべて」と個別の見え方を用意する
export function buildVariants(score, indexes) {
  if (indexes.length <= 1) return [{ id: 'all', label: '', indexes }]
  const parts = indexes.map((index, order) => ({ index, label: partLabel(score.tracks[index], order) }))
  // 楽譜の上に出るパート名が長くて重ならないよう、表示名を短くする
  for (const { index, label } of parts) {
    score.tracks[index].name = label
    score.tracks[index].shortName = label
  }
  return [
    { id: 'all', label: 'すべて', indexes },
    ...parts.map(({ index, label }) => ({ id: `t${index}`, label, indexes: [index] })),
  ]
}

// ---------- 弦・フレットの自動割り当て ----------
// MusicXMLには「何弦の何フレットか」が入っていないため、音の高さから割り当てる。
// 直前のフレット位置に近い場所を選び、同時に鳴る音は別の弦に振り分ける。

const OPEN_STRINGS = {
  guitar: { name: 'Standard', notes: [64, 59, 55, 50, 45, 40] },
  bass: { name: 'Bass Standard', notes: [43, 38, 33, 28] },
}
const MAX_FRET = 22

function assignPositions(track, kind) {
  const { name, notes: open } = OPEN_STRINGS[kind]
  const lowest = open[open.length - 1]
  const highest = open[0] + MAX_FRET

  for (const staff of track.staves) {
    const pitches = new Map()
    for (const bar of staff.bars) {
      for (const voice of bar.voices) {
        for (const beat of voice.beats) {
          for (const note of beat.notes) pitches.set(note, note.realValue)
        }
      }
    }

    staff.stringTuning = new alphaTab.model.Tuning(name, open, true)
    staff.showTablature = true
    staff.showStandardNotation = false

    const previousFret = []
    for (const bar of staff.bars) {
      bar.voices.forEach((voice, voiceIndex) => {
        for (const beat of voice.beats) {
          const used = new Set()
          const notes = [...beat.notes].sort((a, b) => pitches.get(b) - pitches.get(a))
          for (const note of notes) {
            if (note.isTieDestination && note.tieOrigin && note.tieOrigin.string >= 0) {
              note.string = note.tieOrigin.string
              note.fret = note.tieOrigin.fret
              used.add(open.length - note.string)
              continue
            }

            let pitch = pitches.get(note)
            while (pitch < lowest) pitch += 12
            while (pitch > highest) pitch -= 12

            const reference = previousFret[voiceIndex] ?? 3
            let best = null
            for (const allowUsed of [false, true]) {
              open.forEach((openPitch, i) => {
                const fret = pitch - openPitch
                if (fret < 0 || fret > MAX_FRET || (!allowUsed && used.has(i))) return
                const cost = Math.abs(fret - reference) + (fret > 12 ? 4 : 0)
                if (!best || cost < best.cost) best = { i, fret, cost }
              })
              if (best) break
            }
            if (!best) continue

            note.string = open.length - best.i
            note.fret = best.fret
            used.add(best.i)
            if (best.fret > 0) previousFret[voiceIndex] = best.fret
          }
        }
      })
    }
  }
}

// ---------- 歌詞 ----------

function lyricsTrackIndex(score) {
  let best = -1
  let bestCount = 0
  score.tracks.forEach((track, i) => {
    const count = allBeats(track).filter((beat) => beat.lyrics && beat.lyrics.length > 0).length
    if (count > bestCount) {
      best = i
      bestCount = count
    }
  })
  return best
}

function joinSyllables(tokens) {
  let text = ''
  let joinNext = false
  for (const raw of tokens) {
    const token = raw.trim()
    if (!token) continue
    const continues = /[-+]$/.test(token)
    const word = token.replace(/[-+]$/, '')
    text += (text && !joinNext ? ' ' : '') + word
    joinNext = continues
  }
  return text
}

// スコアに入っている歌詞を、小節ごとの行として取り出す
export function extractLyricLines(score) {
  const index = lyricsTrackIndex(score)
  if (index < 0) return []
  const staff = score.tracks[index].staves[0]
  return staff.bars
    .map((bar) => joinSyllables(bar.voices.flatMap((voice) => voice.beats.flatMap((beat) => beat.lyrics ?? []))))
    .filter(Boolean)
}

// ---------- 表示前の準備 ----------

const headerHidden = new WeakSet()
const positioned = new WeakSet()

// ファイル由来のタイトル・作者などのヘッダーは、ページ側で表示するので非表示にする
function hideScoreHeader(score) {
  const { ScoreStyle, ScoreSubElement, HeaderFooterStyle } = alphaTab.model
  score.style = score.style ?? new ScoreStyle()
  for (const element of Object.values(ScoreSubElement)) {
    if (typeof element === 'number') score.style.headerAndFooter.set(element, new HeaderFooterStyle('', false))
  }
}

// 表示するパートを準備する（TAB情報のないパートには、弦・フレットを割り当てる）
export function prepareTracks(score, indexes, kind) {
  if (!headerHidden.has(score)) {
    headerHidden.add(score)
    hideScoreHeader(score)
  }

  for (const index of indexes) {
    const track = score.tracks[index]
    if (positioned.has(track)) continue
    positioned.add(track)
    if (!hasTabData(track)) assignPositions(track, kind)
  }

  score.finish(new alphaTab.Settings())
}
