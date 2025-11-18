# PowerShell script to send sample reviews to /analyze/raw
param(
  [string]$ApiUrl = "http://localhost:3001/analyze/raw",
  [string]$SamplePath = "..\Backend\data\sample_reviews_large.json",
  [string]$Query = "iPhone 13",
  [switch]$UseLLM
)

if (-not (Test-Path $SamplePath)) {
  $SamplePath = "..\Backend\data\sample_reviews_large.json"
}

$content = Get-Content -Raw -Path $SamplePath | ConvertFrom-Json
$reviews = @()
foreach ($r in $content) {
  if ($r.text) { $reviews += @{ text = $r.text } }
  elseif ($r -is [string]) { $reviews += @{ text = $r } }
}

$body = @{ query = $Query; reviews = $reviews; use_llm = [bool]$UseLLM } | ConvertTo-Json -Depth 6

Write-Host "POST $ApiUrl (reviews=$($reviews.Count), use_llm=$UseLLM)"
$resp = Invoke-RestMethod -Uri $ApiUrl -Method Post -Body $body -ContentType 'application/json'
$resp | ConvertTo-Json -Depth 6
