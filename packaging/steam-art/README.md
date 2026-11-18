# Steam library artwork

Deterministic, not generative: every asset is the app icon plus a flat gradient
and typography. The icon is Iconoir's `sofa` (MIT; see
`THIRD-PARTY-NOTICES.md` and `licenses/iconoir.txt` at the repository root) on
the app's focus-ring yellow; no Dropout artwork is included.

| File | Size | Steam name |
|---|---|---|
| `hero.png` | 1920×620 | `<appid>_hero.png` |
| `portrait.png` | 600×900 | `<appid>p.png` |
| `header.png` | 460×215 | `<appid>.png` |
| `logo.png` | 512×512, transparent | `<appid>_logo.png` |
| `icon.png` | 256×256, transparent corners | `<appid>_icon.png` |

`generate/` holds the reference scripts used to produce the PNGs. They are
Windows-only (`System.Drawing` and Electron) and are not part of the release
archive; the committed PNGs are the source of truth.

From the repository root:

```powershell
./node_modules/.bin/electron packaging/steam-art/generate/render-art.js
powershell -File packaging/steam-art/generate/generate.ps1
```

`render-art.js` writes `build/icon.png` from `build/icon.svg` and the
transparent `logo.png`; `generate.ps1` draws the remaining channels from that
icon.

The release workflow zips the five PNGs and `NOTICE.txt` into
`steam-art.zip`. The installer reads the shortcut appid from Steam's
`shortcuts.vdf` and copies the images into `userdata/<id>/config/grid/`.
