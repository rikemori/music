曲ごとのフォルダに、YouTabs で書き出した TAB 譜と、歌詞を置きます。

  public/tabs/<曲のフォルダ>/
      ・TAB譜 …… .gp / .gpx / .gp5 / .musicxml / .mxl / .xml（ファイル名は自由）
      ・歌詞 ……  .txt（名前は自由。README以外の .txt を歌詞として使います）

曲のフォルダ名は、src/songs.js の SONGS に書いた id と同じにします。
曲を増やすときは、SONGS に1つ足して、同じ名前のフォルダを作ってください。
