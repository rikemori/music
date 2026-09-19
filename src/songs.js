// ============================================================
// ★ 曲の設定はここだけ書き換えればOK ★
//
// TAB譜は YouTabs から書き出した .gp（Guitar Pro）/ .musicxml を
//   public/tabs/  に置くと表示されます（ファイル名は自由です）。
//   ギターとベースは、ファイルの中のパート名・音色から自動で選びます。
//   楽器ごとに別ファイルでも、1つにまとまっていてもOKです。
//
// 歌詞は public/tabs/ に .txt（名前は自由）として1行ずつ書きます。
//   右の歌詞パネルに、どの楽器のTABを見ていても常に表示されます。
// ============================================================
export const SONG = {
  id: 'smp9qjE0WnQ',
  title: '世界の終わり',
  subtitle: 'primitive Version',
  artist: 'Thee Michelle Gun Elephant',
  instruments: [
    { id: 'guitar', label: 'ギター', kind: 'guitar' },
    { id: 'bass', label: 'ベース', kind: 'bass' },
  ],
}

export const youtabsUrl = (id) => `https://youtabs.com/watch?v=${id}`
export const youtubeUrl = (id) => `https://www.youtube.com/watch?v=${id}`
export const thumbnailUrl = (id) => `https://i.ytimg.com/vi/${id}/hqdefault.jpg`
export const embedUrl = (id) => `https://www.youtube-nocookie.com/embed/${id}?rel=0&autoplay=1`
