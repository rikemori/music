const QUARTER_TICKS = 960

// 楽譜（小節・テンポ）から、「動画の再生位置（秒）→ 何小節目のどこか」を求める表を作る。
// テンポが途中で変わる曲にも対応する。繰り返し記号は使わない（YouTabsの採譜は最初から順に並ぶ）。
export function buildTimeline(score) {
  const bars = []
  let start = 0
  let tempo = score.tempo

  for (const masterBar of score.masterBars) {
    const ticks = masterBar.calculateDuration()
    const changes = [...masterBar.tempoAutomations].sort((a, b) => a.ratioPosition - b.ratioPosition)

    // 小節の中を、テンポが変わる位置で区切る
    const segments = []
    let from = 0
    for (const change of changes) {
      if (change.ratioPosition > from) {
        segments.push({ from, to: change.ratioPosition, tempo })
        from = change.ratioPosition
      }
      tempo = change.value
    }
    segments.push({ from, to: 1, tempo })

    const secondsOf = (segment) => ((ticks * (segment.to - segment.from)) / QUARTER_TICKS) * (60 / segment.tempo)
    const duration = segments.reduce((sum, segment) => sum + secondsOf(segment), 0)
    bars.push({ start, duration, ticks, segments, secondsOf })
    start += duration
  }

  return { bars, total: start }
}

// 秒から、小節の番号（0始まり）と、小節の中の位置（ティック）、小節の長さ（ティック）を求める
export function locate(timeline, seconds) {
  const { bars } = timeline
  if (bars.length === 0) return null
  if (seconds <= 0) return { barIndex: 0, tick: 0, ticks: bars[0].ticks }

  const last = bars.length - 1
  if (seconds >= timeline.total) return { barIndex: last, tick: bars[last].ticks, ticks: bars[last].ticks }

  let low = 0
  let high = last
  while (low < high) {
    const mid = Math.ceil((low + high) / 2)
    if (bars[mid].start <= seconds) low = mid
    else high = mid - 1
  }

  const bar = bars[low]
  let remaining = seconds - bar.start
  for (const segment of bar.segments) {
    const length = bar.secondsOf(segment)
    if (remaining <= length || segment === bar.segments[bar.segments.length - 1]) {
      const ratio = segment.from + (segment.to - segment.from) * Math.min(1, remaining / length)
      return { barIndex: low, tick: ratio * bar.ticks, ticks: bar.ticks }
    }
    remaining -= length
  }
  return { barIndex: low, tick: 0, ticks: bar.ticks }
}
