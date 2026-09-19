import fs from 'node:fs'
import path from 'node:path'
import react from '@vitejs/plugin-react'
import { alphaTab } from '@coderline/alphatab-vite'
import { defineConfig } from 'vite'

const TAB_FILE_PATTERN = /\.(gp|gpx|gp5|gp4|gp3|musicxml|mxl|xml)$/i

// public/tabs/ に置かれたTAB譜ファイルの一覧と、歌詞ファイル（.txt）の名前を、アプリから読めるようにする
function tabFiles() {
  const virtualId = 'virtual:tab-files'
  const resolvedId = `\0${virtualId}`
  let tabsDir = ''

  const names = () => (fs.existsSync(tabsDir) ? fs.readdirSync(tabsDir).sort() : [])
  const listFiles = () => names().filter((name) => TAB_FILE_PATTERN.test(name))
  // 名前は自由。README以外の .txt のうち、名前に lyric を含むものを優先する
  const findLyricsFile = () => {
    const texts = names().filter((name) => /\.txt$/i.test(name) && !/^readme/i.test(name))
    return texts.find((name) => /lyric/i.test(name)) ?? texts[0] ?? null
  }

  return {
    name: 'tab-files',
    configResolved(config) {
      tabsDir = path.join(config.publicDir, 'tabs')
    },
    resolveId(id) {
      if (id === virtualId) return resolvedId
    },
    load(id) {
      if (id === resolvedId) return `export default ${JSON.stringify({ files: listFiles(), lyricsFile: findLyricsFile() })}`
    },
    configureServer(server) {
      const refresh = (file) => {
        if (!file.startsWith(tabsDir)) return
        const module = server.moduleGraph.getModuleById(resolvedId)
        if (module) server.moduleGraph.invalidateModule(module)
        server.ws.send({ type: 'full-reload' })
      }
      server.watcher.on('add', refresh)
      server.watcher.on('change', refresh)
      server.watcher.on('unlink', refresh)
    },
  }
}

// https://vite.dev/config/
export default defineConfig(({ command }) => ({
  plugins: [react(), alphaTab(), tabFiles()],
  // 公開用ビルドのときだけ、GitHub Pages のパスを付ける（公開時は --base で上書きされる）。
  // 開発中に付けると、alphaTab の描画用ワーカーが読み込めずエラーになる。
  base: command === 'build' ? '/music/' : '/',
}))
