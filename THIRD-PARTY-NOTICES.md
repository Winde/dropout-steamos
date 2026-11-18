# Third-party notices

Drop-In's own code is MIT licensed; see [`LICENSE`](LICENSE). This application
bundles the following open source components. Their licenses apply to those
components.

Full license texts are in [`licenses/`](licenses/).

## Bundled in the application

| Component | Version | License | Copyright |
|---|---|---|---|
| [Electron](https://github.com/electron/electron) | see `package.json` | MIT | Electron contributors |
| [Iconoir](https://github.com/iconoir-icons/iconoir) | 7.12.2 | MIT | Luca Burgio |

Electron's MIT licence is in [`licenses/electron.txt`](licenses/electron.txt).
The packaged app also carries Electron's own `LICENSE.electron.txt` and
`LICENSES.chromium.html`, which cover Electron itself and Chromium.

## Iconoir

The app icon (`build/icon.svg`, rasterised to `build/icon.png`) and the Steam
library artwork are built from Iconoir's `sofa` glyph: recoloured, rescaled and
padded, with a gradient background and wordmark added. The glyph itself is
unchanged. It is not derived from any Dropout artwork.

Iconoir is MIT licensed, Copyright (c) 2021 Luca Burgio. The full text is in
[`licenses/iconoir.txt`](licenses/iconoir.txt). Source:
<https://github.com/iconoir-icons/iconoir>.

## Development only

These are used to build and test the application and are not distributed with
it: esbuild, electron-builder, TypeScript, Vitest, jsdom, `@types/node`. All are
MIT or Apache-2.0 licensed.
