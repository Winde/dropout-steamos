// Renders the app icon and the transparent Steam logo from build/icon.svg.
// Run from the repository root with the local Electron:
//   ./node_modules/.bin/electron packaging/steam-art/generate/render-art.js
const { app, BrowserWindow } = require('electron')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

app.commandLine.appendSwitch('disable-gpu')

// Destroying the only window would otherwise quit the app between renders.
app.on('window-all-closed', () => {})

async function render(svg, size, out) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dropin-art-'))
  const page = path.join(dir, 'page.html')
  fs.writeFileSync(
    page,
    `<!doctype html><html><head><style>html,body{margin:0;background:transparent}svg{display:block;width:${size}px;height:${size}px}</style></head><body>${svg}</body></html>`,
  )
  const win = new BrowserWindow({
    width: size,
    height: size,
    show: false,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
  })
  try {
    await win.loadFile(page)
    // A hidden window cannot be captured on Windows; show it offscreen.
    win.showInactive()
    await new Promise((resolve) => setTimeout(resolve, 500))
    const image = await win.webContents.capturePage()
    fs.writeFileSync(path.join(process.cwd(), out), image.toPNG())
  } finally {
    win.destroy()
    fs.rmSync(dir, { recursive: true, force: true })
  }
}

app.whenReady().then(async () => {
  const svg = fs.readFileSync(path.join(process.cwd(), 'build/icon.svg'), 'utf8')
  await render(svg, 512, 'build/icon.png')
  // The logo is the same SVG with the background <rect> removed, rendered on
  // transparency.
  await render(svg.replace(/<rect[^>]*\/>/, ''), 512, 'packaging/steam-art/logo.png')
  app.quit()
})
