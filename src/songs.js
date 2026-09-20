// ============================================================
// ★ 曲の一覧はここを書き換えればOK ★
//
// 曲を増やすには、下の SONGS に1つ足して、public/tabs/<id>/ フォルダを作ります。
//   id      フォルダ名（半角英数字とハイフン）。URL の #<id> にもなります
//   videoId YouTube の動画ID（URL の v= の後ろ）
//
// public/tabs/<id>/ には、次のものを置きます。
//   ・TAB譜 …… YouTabs から書き出した .gp（Guitar Pro）/ .musicxml（ファイル名は自由）
//              ギターとベースは、ファイルの中のパート名・音色から自動で選びます。
//              楽器ごとに別ファイルでも、1つにまとまっていてもOKです。
//   ・歌詞 ……  .txt（名前は自由）に、1行ずつ書きます。
// ============================================================
export const SONGS = [
  {
    id: 'sekai-no-owari',
    videoId: 'smp9qjE0WnQ',
    accent: '#c9462a',
    title: '世界の終わり',
    subtitle: 'primitive Version',
    artist: 'Thee Michelle Gun Elephant',
  },
  {
    id: 'toumei-shojo',
    videoId: 'SUAnU1A38ec',
    accent: '#1f6f8b',
    title: '透明少女',
    subtitle: '',
    artist: 'NUMBER GIRL',
  },
  {
    id: 'basket-case',
    videoId: 'NUTGr5t3MoY',
    accent: '#2f7d4f',
    title: 'Basket Case',
    subtitle: '',
    artist: 'Green Day',
  },
]

export const INSTRUMENTS = [
  { id: 'guitar', label: 'ギター', kind: 'guitar' },
  { id: 'bass', label: 'ベース', kind: 'bass' },
]

export const youtabsUrl = (videoId) => `https://youtabs.com/watch?v=${videoId}`
export const youtubeUrl = (videoId) => `https://www.youtube.com/watch?v=${videoId}`
export const thumbnailUrl = (videoId) => `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`
export const embedUrl = (videoId) => `https://www.youtube-nocookie.com/embed/${videoId}?rel=0&autoplay=1`
