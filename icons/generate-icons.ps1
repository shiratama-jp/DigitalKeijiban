Add-Type -AssemblyName System.Drawing

$outDir = $PSScriptRoot

function New-KeijibanIcon {
    param(
        [int]$Size,
        [string]$OutPath,
        [bool]$Maskable = $false
    )

    $bmp = New-Object System.Drawing.Bitmap $Size, $Size
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.SmoothingMode  = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic

    # --- Blue gradient background ---
    $rect = New-Object System.Drawing.Rectangle 0, 0, $Size, $Size
    $grad = New-Object System.Drawing.Drawing2D.LinearGradientBrush(
        $rect,
        [System.Drawing.Color]::FromArgb(59, 130, 246),
        [System.Drawing.Color]::FromArgb(29, 78, 216),
        [System.Drawing.Drawing2D.LinearGradientMode]::ForwardDiagonal
    )
    if ($Maskable) {
        $g.FillRectangle($grad, $rect)
    } else {
        $radius = [int]($Size * 0.22)
        $path = New-Object System.Drawing.Drawing2D.GraphicsPath
        $path.AddArc(0, 0, $radius * 2, $radius * 2, 180, 90)
        $path.AddArc($Size - $radius * 2, 0, $radius * 2, $radius * 2, 270, 90)
        $path.AddArc($Size - $radius * 2, $Size - $radius * 2, $radius * 2, $radius * 2, 0, 90)
        $path.AddArc(0, $Size - $radius * 2, $radius * 2, $radius * 2, 90, 90)
        $path.CloseFigure()
        $g.FillPath($grad, $path)
    }

    # Safe zone: maskable icons should keep content inside ~80% center
    $scale = if ($Maskable) { 0.72 } else { 0.92 }
    $innerSize = $Size * $scale
    $offsetX = ($Size - $innerSize) / 2
    $offsetY = ($Size - $innerSize) / 2

    # --- White paper/note shape ---
    $paperW = $innerSize * 0.78
    $paperH = $innerSize * 0.82
    $paperX = $offsetX + ($innerSize - $paperW) / 2
    $paperY = $offsetY + ($innerSize - $paperH) / 2 + $innerSize * 0.03
    $whiteBrush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::White)
    $r = $innerSize * 0.08
    $paperPath = New-Object System.Drawing.Drawing2D.GraphicsPath
    $paperPath.AddArc($paperX, $paperY, $r * 2, $r * 2, 180, 90)
    $paperPath.AddArc($paperX + $paperW - $r * 2, $paperY, $r * 2, $r * 2, 270, 90)
    $paperPath.AddArc($paperX + $paperW - $r * 2, $paperY + $paperH - $r * 2, $r * 2, $r * 2, 0, 90)
    $paperPath.AddArc($paperX, $paperY + $paperH - $r * 2, $r * 2, $r * 2, 90, 90)
    $paperPath.CloseFigure()
    $g.FillPath($whiteBrush, $paperPath)

    # --- Text lines on paper ---
    $lineBrush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(203, 213, 225))
    $accentBrush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(37, 99, 235))
    $lineH = $paperH * 0.09
    $lineSpacing = $paperH * 0.15
    $lineStartY = $paperY + $paperH * 0.22
    $lineMarginX = $paperW * 0.12

    # Title line (accent color, shorter)
    $g.FillRectangle($accentBrush, [float]($paperX + $lineMarginX), [float]$lineStartY, [float]($paperW * 0.55), [float]$lineH)

    # Body lines (grey)
    for ($i = 1; $i -le 3; $i++) {
        $y = $lineStartY + $lineSpacing * $i
        $w = if ($i -eq 3) { $paperW * 0.50 } else { $paperW * 0.76 }
        $g.FillRectangle($lineBrush, [float]($paperX + $lineMarginX), [float]$y, [float]$w, [float]$lineH)
    }

    # --- Pin at the top of the paper ---
    $pinR = $innerSize * 0.07
    $pinCx = $paperX + $paperW / 2
    $pinCy = $paperY - $pinR * 0.2
    $pinShadow = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(80, 15, 23, 42))
    $g.FillEllipse($pinShadow, [float]($pinCx - $pinR + 2), [float]($pinCy - $pinR + 3), [float]($pinR * 2), [float]($pinR * 2))
    $redBrush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(239, 68, 68))
    $g.FillEllipse($redBrush, [float]($pinCx - $pinR), [float]($pinCy - $pinR), [float]($pinR * 2), [float]($pinR * 2))
    $highlightBrush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(180, 255, 255, 255))
    $hR = $pinR * 0.35
    $g.FillEllipse($highlightBrush, [float]($pinCx - $hR - $pinR * 0.2), [float]($pinCy - $hR - $pinR * 0.25), [float]($hR * 2), [float]($hR * 2))

    $bmp.Save($OutPath, [System.Drawing.Imaging.ImageFormat]::Png)

    $g.Dispose()
    $bmp.Dispose()
    $grad.Dispose()
    Write-Host "Generated: $OutPath"
}

New-KeijibanIcon -Size 192 -OutPath (Join-Path $outDir "icon-192.png") -Maskable $false
New-KeijibanIcon -Size 512 -OutPath (Join-Path $outDir "icon-512.png") -Maskable $false
New-KeijibanIcon -Size 512 -OutPath (Join-Path $outDir "icon-maskable-512.png") -Maskable $true
Write-Host "Done."
