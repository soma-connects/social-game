<#
.SYNOPSIS
  Deploy to Cloud Run from Windows PowerShell, reading Firebase config from .env.local.

.DESCRIPTION
  The seven NEXT_PUBLIC_FIREBASE_* values are compiled into the client bundle at
  build time, so they must be passed as build args and cannot be corrected
  afterwards as runtime env vars. An empty one does not fail the build: it
  produces a service that starts, serves pages, and never reaches Firestore.
  So this reads them from the file and refuses to deploy if any are missing.

  Secrets (GEMINI_API_KEY, ADMIN_DASHBOARD_TOKEN, the Cloudflare TURN keys) stay
  runtime env vars on the service and are deliberately not touched here --
  cloudbuild.yaml uses --update-env-vars, which merges rather than replaces.

.EXAMPLE
  .\scripts\deploy-cloudrun.ps1 -Check    # validate only, deploy nothing
  .\scripts\deploy-cloudrun.ps1           # deploy, after confirming
#>

[CmdletBinding()]
param(
  [switch]$Check,
  [string]$EnvFile = '.env.local'
)

# ASCII only, deliberately. Windows PowerShell 5.1 reads a .ps1 with no
# byte-order mark using the system ANSI codepage rather than UTF-8, so a
# UTF-8 em dash arrives as three Windows-1252 characters -- the last of
# which is a smart quote, which PowerShell treats as a string delimiter.
# One stray dash in a comment took the whole script out with "the string
# is missing the terminator". Keep every character in this file ASCII.
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Fail($msg) {
  Write-Host ''
  Write-Host "  $msg" -ForegroundColor Red
  Write-Host ''
  exit 1
}

Set-Location (Join-Path $PSScriptRoot '..')

if (-not (Get-Command gcloud -ErrorAction SilentlyContinue)) {
  Fail 'gcloud is not installed. See https://cloud.google.com/sdk/docs/install'
}

if (-not (Test-Path $EnvFile)) {
  Fail "No $EnvFile. Run: Copy-Item .env.local.example .env.local   then fill in the Firebase values."
}

$required = @(
  'NEXT_PUBLIC_FIREBASE_API_KEY',
  'NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN',
  'NEXT_PUBLIC_FIREBASE_PROJECT_ID',
  'NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET',
  'NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID',
  'NEXT_PUBLIC_FIREBASE_APP_ID',
  'NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID'
)

# Only the keys we need, so nothing else in the file is interpreted.
$lines  = Get-Content $EnvFile
$values = @{}
foreach ($key in $required) {
  $match = $lines | Where-Object { $_ -match "^\s*$([regex]::Escape($key))\s*=" } | Select-Object -Last 1
  $value = ''
  if ($match) {
    $value = ($match -split '=', 2)[1].Trim()
    $value = $value -replace '^"(.*)"$', '$1'      # tolerate quoted values
    $value = $value -replace "^'(.*)'$", '$1'
  }
  $values[$key] = $value
}

# @() forces an array: Where-Object returns a bare object for a single match,
# and .Count on that throws under Set-StrictMode.
$missing = @($required | Where-Object { [string]::IsNullOrWhiteSpace($values[$_]) })

if ($missing.Count -gt 0) {
  Write-Host ''
  Write-Host "  $EnvFile is missing $($missing.Count) value(s):" -ForegroundColor Red
  Write-Host ''
  $missing | ForEach-Object { Write-Host "    $_" -ForegroundColor Yellow }
  Write-Host ''
  Write-Host '  Firebase console -> Project settings -> Your apps -> SDK setup and configuration.'
  Fail 'Refusing to deploy: an empty value builds a bundle that cannot reach Firebase.'
}

# Lengths only. These values are not secret -- they ship to every browser -- but
# echoing them into a terminal history is still a bad habit.
Write-Host "Firebase config in ${EnvFile}:"
foreach ($key in $required) {
  Write-Host ("  {0,-42} {1} chars" -f $key, $values[$key].Length)
}

$sha    = (git rev-parse --short HEAD).Trim()
$branch = (git rev-parse --abbrev-ref HEAD).Trim()
$dirty  = if (git status --porcelain) { '  (uncommitted changes present)' } else { '' }

$project = (gcloud config get-value project 2>$null)
$account = (gcloud config get-value account 2>$null)
if ([string]::IsNullOrWhiteSpace($project)) { $project = '<unset>' }
if ([string]::IsNullOrWhiteSpace($account)) { $account = '<unset>' }

Write-Host ''
Write-Host "Deploying $branch @ $sha$dirty"
Write-Host "Project:  $project"
Write-Host "Account:  $account"

if ($project -eq '<unset>') {
  Fail 'No project set. Run: gcloud config set project YOUR-PROJECT-ID   (list them with: gcloud projects list)'
}

# -- Runtime secrets ---------------------------------------------------------
# A different path entirely from the values above. The NEXT_PUBLIC_* ones are
# compiled into the client bundle at build time; these are read by the server at
# request time and live on the Cloud Run service. .env* files are excluded from
# the image on purpose -- .env.production used to bake a live GEMINI_API_KEY into
# every layer -- so nothing here travels with the build. Reported, never set:
# writing a secret is the user's call, not a deploy script's side effect.
$cb      = Get-Content cloudbuild.yaml -Raw
$service = if ($cb -match '_SERVICE:\s*(\S+)') { $Matches[1] } else { $null }
$region  = if ($cb -match '_REGION:\s*(\S+)')  { $Matches[1] } else { $null }

if ($service -and $region) {
  $onService = & gcloud run services describe $service --region $region `
    --format='value(spec.template.spec.containers[0].env[].name)' 2>$null
  if ($LASTEXITCODE -eq 0) {
    $set = @()
    if ($onService) { $set = @($onService -split '[;\s]+' | Where-Object { $_ }) }

    Write-Host ''
    Write-Host "Runtime env vars on $service :"
    if ($set.Count -eq 0) {
      Write-Host '  (none)' -ForegroundColor Yellow
    } else {
      $set | Sort-Object | ForEach-Object { Write-Host "  $_" }
    }

    if ($set -notcontains 'GEMINI_API_KEY') {
      Write-Host ''
      Write-Host '  GEMINI_API_KEY is not set -- the AI Game Master will not work.' -ForegroundColor Yellow
      Write-Host '  Set it from .env.production without redeploying:' -ForegroundColor Yellow
      Write-Host "    gcloud run services update $service --region $region --update-env-vars GEMINI_API_KEY=your-key"
    }
    if ($set -notcontains 'FIREBASE_PRIVATE_KEY') {
      Write-Host ''
      Write-Host '  FIREBASE_PRIVATE_KEY is not set. That is fine on Cloud Run: the Admin SDK'
      Write-Host '  falls back to Application Default Credentials, which is this service''s own'
      Write-Host '  account. It needs roles/datastore.user. Setting the key is only necessary'
      Write-Host '  if you want a different identity than the service account.'
    }
  } else {
    Write-Host ''
    Write-Host "  Could not read $service in $region -- a first deploy will create it." -ForegroundColor Yellow
  }
}

if ($Check) {
  Write-Host ''
  Write-Host '-Check: everything needed is present. Nothing deployed.' -ForegroundColor Green
  exit 0
}

$reply = Read-Host "`nDeploy this to Cloud Run? [y/N]"
if ($reply -ne 'y' -and $reply -ne 'Y') { Fail 'Cancelled.' }

$subs = @(
  "_GIT_SHA=$sha",
  "_FIREBASE_API_KEY=$($values['NEXT_PUBLIC_FIREBASE_API_KEY'])",
  "_FIREBASE_AUTH_DOMAIN=$($values['NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN'])",
  "_FIREBASE_PROJECT_ID=$($values['NEXT_PUBLIC_FIREBASE_PROJECT_ID'])",
  "_FIREBASE_STORAGE_BUCKET=$($values['NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET'])",
  "_FIREBASE_MESSAGING_SENDER_ID=$($values['NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID'])",
  "_FIREBASE_APP_ID=$($values['NEXT_PUBLIC_FIREBASE_APP_ID'])",
  "_FIREBASE_MEASUREMENT_ID=$($values['NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID'])"
) -join ','

gcloud builds submit --config cloudbuild.yaml "--substitutions=$subs"
exit $LASTEXITCODE
