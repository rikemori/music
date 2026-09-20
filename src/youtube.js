let apiPromise = null

// YouTube の公式プレーヤーAPI を読み込む（1回だけ）
function loadYouTubeApi() {
  if (window.YT?.Player) return Promise.resolve(window.YT)
  if (!apiPromise) {
    apiPromise = new Promise((resolve, reject) => {
      const previous = window.onYouTubeIframeAPIReady
      window.onYouTubeIframeAPIReady = () => {
        previous?.()
        resolve(window.YT)
      }
      const script = document.createElement('script')
      script.src = 'https://www.youtube.com/iframe_api'
      script.onerror = () => {
        apiPromise = null
        reject(new Error('YouTubeのプレーヤーを読み込めませんでした'))
      }
      document.head.appendChild(script)
    })
  }
  return apiPromise
}

// container の場所に、動画のプレーヤーを作る（container は iframe に置き換わる）
//   state: 'ready' | 'playing' | 'paused'
export async function createPlayer(container, videoId, { autoplay, onState }) {
  const YT = await loadYouTubeApi()
  return new Promise((resolve) => {
    const player = new YT.Player(container, {
      host: 'https://www.youtube-nocookie.com',
      videoId,
      playerVars: { rel: 0, playsinline: 1, autoplay: autoplay ? 1 : 0 },
      events: {
        onReady: () => {
          onState('ready')
          resolve(player)
        },
        onStateChange: (event) => {
          // 1:再生中 3:読み込み中（再生の途中）  0:終了 2:一時停止 5:頭出し -1:未開始
          onState(event.data === 1 || event.data === 3 ? 'playing' : 'paused')
        },
      },
    })
  })
}
