# Regenerates the square portrait crops (<id>_face.jpg) from the character art
# (<id>.jpg). The art is a taller-than-wide portrait inside a glowing ring, so a
# square avatar frame has to crop it — the crop is aimed inside the ring so small
# circular avatars show a face rather than slices of the ring and dark corners.
#
#   .\scripts\crop-avatar-faces.ps1                 # write into public/avatars
#   .\scripts\crop-avatar-faces.ps1 .\preview       # write somewhere else to review first
#
# Tune cx / cy / side below if the art is ever replaced.

Add-Type -AssemblyName System.Drawing

$src = Join-Path $PSScriptRoot "..\public\avatars" | Resolve-Path
$out = if ($args[0]) { $args[0] } else { $src }
if (-not (Test-Path $out)) { New-Item -ItemType Directory -Force $out | Out-Null }

# cx / cy = centre of the head as a fraction of card width / height
# side    = square crop side as a fraction of card width
$specs = @(
  @{ id = 'paul';     cx = 0.52; cy = 0.45; side = 0.78 },
  @{ id = 'chibuike'; cx = 0.50; cy = 0.40; side = 0.70 },
  @{ id = 'victor';   cx = 0.50; cy = 0.36; side = 0.68 },
  @{ id = 'samuel';   cx = 0.52; cy = 0.43; side = 0.76 },
  @{ id = 'michael';  cx = 0.50; cy = 0.43; side = 0.76 },
  @{ id = 'chibuzor'; cx = 0.50; cy = 0.44; side = 0.80 },
  @{ id = 'friend1';  cx = 0.52; cy = 0.38; side = 0.64 },
  @{ id = 'friend2';  cx = 0.53; cy = 0.40; side = 0.72 }
)

$size = 256
$jpeg = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() | Where-Object { $_.MimeType -eq 'image/jpeg' }
$encParams = New-Object System.Drawing.Imaging.EncoderParameters 1
$encParams.Param[0] = New-Object System.Drawing.Imaging.EncoderParameter ([System.Drawing.Imaging.Encoder]::Quality), 92L

foreach ($s in $specs) {
  $path = Join-Path $src "$($s.id).jpg"
  $img = [System.Drawing.Image]::FromFile($path)

  $side = [int]([Math]::Round($img.Width * $s.side))
  $x = [int]([Math]::Round($img.Width * $s.cx - $side / 2))
  $y = [int]([Math]::Round($img.Height * $s.cy - $side / 2))

  # keep the crop inside the card
  if ($x -lt 0) { $x = 0 }
  if ($y -lt 0) { $y = 0 }
  if ($x + $side -gt $img.Width)  { $x = $img.Width  - $side }
  if ($y + $side -gt $img.Height) { $y = $img.Height - $side }

  $bmp = New-Object System.Drawing.Bitmap $size, $size
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
  $g.DrawImage($img, (New-Object System.Drawing.Rectangle 0, 0, $size, $size), $x, $y, $side, $side, [System.Drawing.GraphicsUnit]::Pixel)
  $g.Dispose()

  $dest = Join-Path $out "$($s.id)_face.jpg"
  $bmp.Save($dest, $jpeg, $encParams)
  $bmp.Dispose()
  $img.Dispose()

  Write-Output "$($s.id): crop ${side}x${side} at ($x,$y) -> $dest"
}
