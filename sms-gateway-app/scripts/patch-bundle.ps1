param(
    [Parameter(Mandatory=$true)]
    [string]$BundlePath
)

if (-not (Test-Path -LiteralPath $BundlePath)) {
    Write-Error "Bundle not found: $BundlePath"
    exit 1
}

$content = Get-Content -LiteralPath $BundlePath -Raw

$polyfill = 'if(typeof globalThis.ErrorUtils==="undefined"){globalThis.ErrorUtils={setGlobalHandler:function(){}}};if(typeof globalThis.HermesInternal!=="undefined"){if(typeof globalThis.HermesInternal.setGlobalHandler!=="function"){globalThis.HermesInternal.setGlobalHandler=function(){}}}else{globalThis.HermesInternal={setGlobalHandler:function(){}}};if(typeof globalThis.console==="undefined"){globalThis.console={log:function(){},warn:function(){},error:function(){},info:function(){},debug:function(){}}};__r(141);'

# Replace __r(141); with polyfill + __r(141);
$old = '__r(141);'
$new = $polyfill

if ($content -match [regex]::Escape($old)) {
    $content = $content -replace [regex]::Escape($old), $new
    Set-Content -LiteralPath $BundlePath -Value $content -NoNewline
    Write-Host "Patched bundle: $BundlePath"
} else {
    Write-Error "Could not find '__r(141);' in bundle"
    exit 1
}
