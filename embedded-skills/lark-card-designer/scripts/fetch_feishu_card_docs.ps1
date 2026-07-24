param(
    [int]$MaxDepth = 3,
    [int]$MaxDocs = 180
)

$ErrorActionPreference = "Stop"

$ProjectRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$DocsDir = Join-Path $ProjectRoot "docs"
$RawDir = Join-Path $DocsDir "raw"
$IndexPath = Join-Path $DocsDir "INDEX.md"
$ManifestPath = Join-Path $DocsDir "manifest.json"

New-Item -ItemType Directory -Force -Path $DocsDir | Out-Null
New-Item -ItemType Directory -Force -Path $RawDir | Out-Null

$Seeds = @(
    "https://open.feishu.cn/document/common-capabilities/message-card/introduction-of-message-cards",
    "https://open.feishu.cn/document/client-docs/bot-v3/add-custom-bot",
    "https://open.feishu.cn/document/server-docs/im-v1/message/create",
    "https://open.feishu.cn/document/uAjLw4CM/ukTMukTMukTM/im-v1/message/create_json",
    "https://open.feishu.cn/document/uAjLw4CM/ukzMukzMukzM/feishu-cards/feishu-card-overview",
    "https://open.feishu.cn/document/uAjLw4CM/ukzMukzMukzM/feishu-cards/feishu-card-cardkit/feishu-cardkit-overview",
    "https://open.feishu.cn/document/uAjLw4CM/ukzMukzMukzM/feishu-cards/card-json-v2-structure",
    "https://open.feishu.cn/document/uAjLw4CM/ukzMukzMukzM/feishu-cards/card-json-structure",
    "https://open.feishu.cn/document/uAjLw4CM/ukzMukzMukzM/feishu-cards/card-json-v2-components/component-json-v2-overview",
    "https://open.feishu.cn/document/uAjLw4CM/ukzMukzMukzM/feishu-cards/card-components/content-components/table",
    "https://open.feishu.cn/document/uAjLw4CM/ukzMukzMukzM/feishu-cards/card-json-v2-components/content-components/table",
    "https://open.feishu.cn/document/uAjLw4CM/ukzMukzMukzM/feishu-cards/card-json-v2-components/content-components/chart",
    "https://open.feishu.cn/document/uAjLw4CM/ukzMukzMukzM/feishu-cards/card-json-v2-components/content-components/rich-text",
    "https://open.feishu.cn/document/uAjLw4CM/ukzMukzMukzM/feishu-cards/card-json-v2-components/containers/collapsible-panel",
    "https://open.feishu.cn/document/uAjLw4CM/ukzMukzMukzM/feishu-cards/streaming-updates-openapi-overview",
    "https://open.feishu.cn/document/uAjLw4CM/ukzMukzMukzM/feishu-cards/send-feishu-card",
    "https://open.feishu.cn/document/uAjLw4CM/ukzMukzMukzM/feishu-cards/update-feishu-card",
    "https://open.feishu.cn/document/uAjLw4CM/ukzMukzMukzM/feishu-cards/card-callback-communication",
    "https://open.feishu.cn/document/uAjLw4CM/ukzMukzMukzM/feishu-cards/handle-card-callbacks",
    "https://open.feishu.cn/document/uAjLw4CM/ukzMukzMukzM/feishu-cards/configuring-card-interactions",
    "https://open.feishu.cn/document/uAjLw4CM/uMzNwEjLzcDMx4yM3ATM/develop-a-card-interactive-bot/introduction",
    "https://open.feishu.cn/document/uAjLw4CM/ukTMukTMukTM/cardkit-v1/feishu-card-resource-overview",
    "https://open.feishu.cn/document/uAjLw4CM/ukTMukTMukTM/cardkit-v1/card/create",
    "https://open.feishu.cn/document/uAjLw4CM/ukTMukTMukTM/cardkit-v1/card/settings",
    "https://open.feishu.cn/document/uAjLw4CM/ukTMukTMukTM/cardkit-v1/card-element/content",
    "https://open.feishu.cn/document/uAjLw4CM/ukzMukzMukzM/feishu-cards/enumerations-for-fields-related-to-color",
    "https://open.feishu.cn/document/uAjLw4CM/ukzMukzMukzM/feishu-cards/enumerations-for-icons",
    "https://open.feishu.cn/document/uAjLw4CM/ukTMukTMukTM/reference/im-v1/image/create",
    "https://open.feishu.cn/document/uAjLw4CM/ukTMukTMukTM/reference/im-v1/file/create",
    "https://open.feishu.cn/document/uAjLw4CM/ukTMukTMukTM/reference/im-v1/message-reaction/emojis-introduce"
)

function Convert-ToMarkdownUrl {
    param([string]$Url)

    $clean = ($Url -replace "#.*$", "") -replace "\?.*$", ""
    if ($clean -notmatch "^https://open\.feishu\.cn/document/") {
        return $null
    }
    if ($clean.EndsWith(".md")) {
        return $clean
    }
    return "$clean.md"
}

function Test-CardRelatedUrl {
    param([string]$Url)

    return $Url -match "/(feishu-cards|message-card|cardkit-v1|develop-a-card-interactive-bot|development-link-preview)/" -or
        $Url -match "/bot-v3/add-custom-bot" -or
        $Url -match "/im-v1/message/(create|create_json|reply|patch|update|delete)" -or
        $Url -match "/image/create" -or
        $Url -match "/file/create" -or
        $Url -match "/message-reaction/emojis-introduce"
}

function Get-SafeSlug {
    param([string]$Url)

    $uri = [Uri]$Url
    $segments = $uri.AbsolutePath.Trim("/").Split("/") | Where-Object { $_ -and $_ -ne "document" }
    $kept = New-Object System.Collections.Generic.List[string]
    foreach ($segment in $segments) {
        $name = $segment -replace "\.md$", ""
        if ($name -match "^[A-Za-z0-9]{8,}$" -and $name -cmatch "[A-Z]" -and $name -cmatch "[a-z]" -and $name -notmatch "-") {
            continue
        }
        $kept.Add($name)
    }
    if ($kept.Count -eq 0) {
        $kept.Add(($uri.AbsolutePath.Trim("/") -replace "[^A-Za-z0-9_-]+", "-"))
    }
    $slug = ($kept -join "__").ToLowerInvariant()
    $slug = $slug -replace "[^a-z0-9._-]+", "-"
    $slug = $slug.Trim("-")
    if ($slug.Length -gt 140) {
        $slug = $slug.Substring(0, 140).Trim("-")
    }
    return "$slug.md"
}

function Get-Title {
    param([string]$Content)

    $match = [regex]::Match($Content, "(?m)^#\s+(.+?)\s*$")
    if ($match.Success) {
        return $match.Groups[1].Value.Trim()
    }
    return "(untitled)"
}

function Get-LinkedDocs {
    param([string]$Content)

    $matches = [regex]::Matches($Content, "https://open\.feishu\.cn/document/[^\s\)\]""'<>]+")
    $links = New-Object System.Collections.Generic.List[string]
    foreach ($match in $matches) {
        $url = Convert-ToMarkdownUrl $match.Value
        if ($url -and (Test-CardRelatedUrl $url)) {
            $links.Add($url)
        }
    }
    return $links | Select-Object -Unique
}

$queue = New-Object System.Collections.Generic.Queue[object]
$seen = @{}
$records = New-Object System.Collections.Generic.List[object]

foreach ($seed in $Seeds) {
    $mdUrl = Convert-ToMarkdownUrl $seed
    if ($mdUrl) {
        $queue.Enqueue([pscustomobject]@{ Url = $mdUrl; Depth = 0 })
    }
}

while ($queue.Count -gt 0 -and $records.Count -lt $MaxDocs) {
    $item = $queue.Dequeue()
    $url = $item.Url
    if ($seen.ContainsKey($url)) {
        continue
    }
    $seen[$url] = $true

    try {
        $response = Invoke-WebRequest -Uri $url -UseBasicParsing -Headers @{ "User-Agent" = "lark-card-designer-doc-fetcher" }
        $content = [string]$response.Content
        if ($content -match "^This document is not found" -or $content.Trim().Length -lt 20) {
            $records.Add([pscustomobject]@{
                title = "(not found)"
                url = $url
                file = $null
                depth = $item.Depth
                status = "not_found"
            })
            continue
        }

        $fileName = Get-SafeSlug $url
        $filePath = Join-Path $RawDir $fileName
        Set-Content -LiteralPath $filePath -Value $content -Encoding UTF8

        $title = Get-Title $content
        $relativePath = "raw/$fileName"
        $records.Add([pscustomobject]@{
            title = $title
            url = $url
            file = $relativePath
            depth = $item.Depth
            status = "ok"
        })

        if ($item.Depth -lt $MaxDepth) {
            foreach ($link in (Get-LinkedDocs $content)) {
                if (-not $seen.ContainsKey($link)) {
                    $queue.Enqueue([pscustomobject]@{ Url = $link; Depth = $item.Depth + 1 })
                }
            }
        }

        Start-Sleep -Milliseconds 120
    }
    catch {
        $records.Add([pscustomobject]@{
            title = "(error)"
            url = $url
            file = $null
            depth = $item.Depth
            status = "error: $($_.Exception.Message)"
        })
    }
}

$okRecords = $records | Where-Object { $_.status -eq "ok" } | Sort-Object file
$generatedAt = (Get-Date).ToString("yyyy-MM-dd HH:mm:ss zzz")
$indexLines = New-Object System.Collections.Generic.List[string]
$indexLines.Add("# Feishu/Lark Card Documentation")
$indexLines.Add("")
$indexLines.Add("Generated at: $generatedAt")
$indexLines.Add("")
$indexLines.Add("Downloaded documents: $($okRecords.Count)")
$indexLines.Add("")
$indexLines.Add("These files are raw Markdown copies from Feishu Open Platform documentation. Use `manifest.json` for source URLs and fetch status.")
$indexLines.Add("")
$indexLines.Add("## Documents")
$indexLines.Add("")
foreach ($record in $okRecords) {
    $indexLines.Add("- [$($record.title)]($($record.file))")
    $indexLines.Add("  Source: $($record.url)")
}
$indexLines.Add("")
$indexLines.Add("## Failed Or Missing")
$indexLines.Add("")
foreach ($record in ($records | Where-Object { $_.status -ne "ok" } | Sort-Object url)) {
    $indexLines.Add("- `$($record.status)`: $($record.url)")
}

Set-Content -LiteralPath $IndexPath -Value $indexLines -Encoding UTF8
$records | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath $ManifestPath -Encoding UTF8

Write-Host "Downloaded $($okRecords.Count) documents into $RawDir"
Write-Host "Index: $IndexPath"
Write-Host "Manifest: $ManifestPath"
