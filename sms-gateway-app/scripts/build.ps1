# Build script for NeoFit SMS Gateway
# Generates JS bundle, patches it with Hermes polyfills, then builds APK

$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path -Parent $PSScriptRoot

# 1. Generate JS bundle
Write-Host "=== Generating JS bundle ==="
Push-Location -LiteralPath $ProjectRoot
try {
    npx react-native bundle `
        --platform android `
        --dev false `
        --entry-file index.js `
        --bundle-output android/app/src/main/assets/index.android.bundle `
        --assets-dest android/app/src/main/res/
    if (-not $?) { throw "Bundle generation failed" }
} finally {
    Pop-Location
}

# 2. Patch bundle with polyfills
Write-Host "=== Patching bundle ==="
& "$PSScriptRoot\patch-bundle.ps1" -BundlePath "$ProjectRoot\android\app\src\main\assets\index.android.bundle"
if (-not $?) { throw "Bundle patching failed" }

# 3. Build APK
Write-Host "=== Building APK ==="
Push-Location -LiteralPath "$ProjectRoot\android"
try {
    ./gradlew clean assembleDebug
    if (-not $?) { throw "Gradle build failed" }

    $apk = "app\build\outputs\apk\debug\app-debug.apk"
    if (Test-Path -LiteralPath $apk) {
        Write-Host "=== APK built: $((Get-Item $apk).FullName) ==="
    }
} finally {
    Pop-Location
}
