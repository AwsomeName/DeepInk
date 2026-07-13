import { resolve } from 'path'
import { copyFileSync } from 'fs'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'

const coreAgentDist = resolve(__dirname, '../coreAgent/dist')
const coreAgentAlias = [
  { find: /^core-agent\/(.+)$/, replacement: `${coreAgentDist}/$1.js` },
  { find: 'core-agent', replacement: resolve(coreAgentDist, 'index.js') },
]

export default defineConfig({
  main: {
    resolve: {
      alias: coreAgentAlias,
    },
    plugins: [
      externalizeDepsPlugin({
        exclude: [
          // core-agent 是本工作区源码依赖，需要走 alias 指向 ../coreAgent/dist，
          // 否则 Electron 主进程会在运行时按 CJS require 解析 package exports。
          'core-agent',
          // juice 是纯 ESM 包，不可 require()，需由 rollup 内联打包
          'juice',
        ],
      }),
      {
        // 复制静态资源到构建输出（test-page.html 等）
        name: 'copy-static-assets',
        writeBundle(options) {
          const outDir = options.dir ?? resolve(__dirname, 'out/main')
          copyFileSync(
            resolve(__dirname, 'src/main/playwright/test-page.html'),
            resolve(outDir, 'test-page.html')
          )
        },
      },
    ],
    build: {
      rollupOptions: {
        external: [
          'playwright-core',
          'playwright',
          'chromium-bidi',
          // @yume-chan 系列包：ESM-only，含 Node.js 依赖，需 externalize
          '@yume-chan/adb',
          '@yume-chan/adb-scrcpy',
          '@yume-chan/scrcpy',
          '@yume-chan/scrcpy-decoder-webcodecs',
          '@yume-chan/stream-extra',
          '@yume-chan/event',
          '@yume-chan/async',
          '@yume-chan/struct',
          // agent-device：ESM-only，daemon/helper 需外部解析，参考 @yume-chan 模式
          'agent-device',
          'yaml',
        ],
      },
    },
  },
  preload: {
    resolve: {
      alias: coreAgentAlias,
    },
    plugins: [
      externalizeDepsPlugin({
        exclude: ['core-agent'],
      }),
    ]
  },
  renderer: {
    resolve: {
      alias: [
        ...coreAgentAlias,
        { find: '@', replacement: resolve('src/renderer/src') },
        { find: '@shared', replacement: resolve('src/shared') },
      ],
    },
    plugins: [react()]
  }
})
