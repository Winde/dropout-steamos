Add-Type -AssemblyName System.Drawing

# Artwork built from Iconoir's "sofa" icon (MIT, Copyright (c) 2021 Luca
# Burgio). Attribution and the full licence text are in THIRD-PARTY-NOTICES.md
# and licenses/iconoir.txt.

$root = (Resolve-Path '.').Path
$iconPath = Join-Path $root 'build/icon.png'
$outDir = Join-Path $root 'packaging/steam-art'
New-Item -ItemType Directory -Force -Path $outDir | Out-Null

$icon = [System.Drawing.Image]::FromFile($iconPath)

$bgTop = [System.Drawing.Color]::FromArgb(18, 19, 22)
$bgBottom = [System.Drawing.Color]::FromArgb(8, 9, 11)
$accent = [System.Drawing.Color]::FromArgb(254, 234, 59)
$white = [System.Drawing.Color]::FromArgb(245, 245, 245)
$muted = [System.Drawing.Color]::FromArgb(160, 164, 171)

function New-OpaqueBitmap([int]$w, [int]$h) {
  $bmp = [System.Drawing.Bitmap]::new($w, $h, [System.Drawing.Imaging.PixelFormat]::Format24bppRgb)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit
  $g.Clear($bgTop)
  $rect = [System.Drawing.Rectangle]::new(0, 0, $w, $h)
  $brush = [System.Drawing.Drawing2D.LinearGradientBrush]::new($rect, $bgTop, $bgBottom, 45.0)
  $g.FillRectangle($brush, $rect)
  $brush.Dispose()
  return @($bmp, $g)
}

function New-TransparentBitmap([int]$w, [int]$h) {
  $bmp = [System.Drawing.Bitmap]::new($w, $h, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $g.Clear([System.Drawing.Color]::Transparent)
  return @($bmp, $g)
}

function Draw-Icon($g, [int]$x, [int]$y, [int]$size) {
  $g.DrawImage($icon, $x, $y, $size, $size)
}

function Draw-Text($g, [string]$text, [float]$size, [System.Drawing.FontStyle]$style, [System.Drawing.Color]$color, [float]$x, [float]$y, [float]$width, [string]$align = 'Near') {
  $font = [System.Drawing.Font]::new('Segoe UI', $size, $style, [System.Drawing.GraphicsUnit]::Pixel)
  $brush = [System.Drawing.SolidBrush]::new($color)
  $format = [System.Drawing.StringFormat]::new()
  $format.Alignment = [System.Drawing.StringAlignment]$align
  $format.LineAlignment = [System.Drawing.StringAlignment]::Near
  $rect = [System.Drawing.RectangleF]::new($x, $y, $width, ($size * 1.8))
  $g.DrawString($text, $font, $brush, $rect, $format)
  $format.Dispose(); $brush.Dispose(); $font.Dispose()
}

function Save-Bitmap($bmp, $g, [string]$name) {
  $path = Join-Path $outDir $name
  $bmp.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)
  $g.Dispose(); $bmp.Dispose()
  Write-Output $path
}

# Hero 1920x620
$pair = New-OpaqueBitmap 1920 620
$bmp = $pair[0]; $g = $pair[1]
Draw-Icon $g 150 160 300
$line = [System.Drawing.SolidBrush]::new($accent)
$g.FillRectangle($line, 520, 178, 96, 6)
$line.Dispose()
Draw-Text $g 'DROP-IN' 112 ([System.Drawing.FontStyle]::Bold) $white 520 200 1200
Draw-Text $g 'UNOFFICIAL DROPOUT CLIENT' 30 ([System.Drawing.FontStyle]::Regular) $muted 524 350 1200
Draw-Text $g 'STEAMOS / CONTROLLER FIRST' 22 ([System.Drawing.FontStyle]::Regular) $accent 524 410 1200
Save-Bitmap $bmp $g 'hero.png'

# Portrait 600x900
$pair = New-OpaqueBitmap 600 900
$bmp = $pair[0]; $g = $pair[1]
Draw-Icon $g 170 170 260
$line = [System.Drawing.SolidBrush]::new($accent)
$g.FillRectangle($line, 240, 490, 120, 5)
$line.Dispose()
Draw-Text $g 'DROP-IN' 76 ([System.Drawing.FontStyle]::Bold) $white 0 520 600 'Center'
Draw-Text $g 'UNOFFICIAL CLIENT' 22 ([System.Drawing.FontStyle]::Regular) $accent 0 620 600 'Center'
Draw-Text $g 'DROPOUT / STEAMOS' 18 ([System.Drawing.FontStyle]::Regular) $muted 0 660 600 'Center'
Save-Bitmap $bmp $g 'portrait.png'

# Header 460x215
$pair = New-OpaqueBitmap 460 215
$bmp = $pair[0]; $g = $pair[1]
Draw-Icon $g 26 48 120
$line = [System.Drawing.SolidBrush]::new($accent)
$g.FillRectangle($line, 172, 64, 48, 4)
$line.Dispose()
Draw-Text $g 'DROP-IN' 46 ([System.Drawing.FontStyle]::Bold) $white 172 78 260
Draw-Text $g 'UNOFFICIAL CLIENT' 16 ([System.Drawing.FontStyle]::Regular) $accent 174 136 260
Save-Bitmap $bmp $g 'header.png'

# Icon 256x256, transparent outside the icon's rounded square
$pair = New-TransparentBitmap 256 256
$bmp = $pair[0]; $g = $pair[1]
Draw-Icon $g 0 0 256
Save-Bitmap $bmp $g 'icon.png'

$icon.Dispose()
