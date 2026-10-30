param([string]$OutputDirectory = '')
$ErrorActionPreference = 'Stop'
$project = $PSScriptRoot
$workspace = (Resolve-Path (Join-Path $project '../..')).Path
$sdkRoot = Join-Path $workspace 'work/android-sdk'
$buildTools = Join-Path $sdkRoot 'build-tools-36/android-16'
$platformJar = Join-Path $sdkRoot 'platform-36/android-36/android.jar'
$jdkBin = 'D:/code/Java/Jetbrainstool/bin'
$build = Join-Path $project 'build'
$signing = Join-Path $workspace 'work/android-signing'
if (!$OutputDirectory) { $OutputDirectory = Join-Path $workspace 'outputs' }
New-Item -ItemType Directory -Path $OutputDirectory -Force | Out-Null
$output = Join-Path $OutputDirectory 'qingji-1.4.1.apk'
foreach ($directory in @($build, (Join-Path $build 'classes'), (Join-Path $build 'dex'), (Join-Path $build 'generated'), $signing)) {
    New-Item -ItemType Directory -Path $directory -Force | Out-Null
}
function Assert-Exit([string]$step) {
    if ($LASTEXITCODE -ne 0) { throw "$step failed ($LASTEXITCODE)" }
}
& node (Join-Path $project 'prepare-assets.cjs')
Assert-Exit 'Prepare assets'
& (Join-Path $buildTools 'aapt2.exe') compile --dir (Join-Path $project 'res') -o (Join-Path $build 'resources.zip')
Assert-Exit 'Compile Android resources'
& (Join-Path $buildTools 'aapt2.exe') link -I $platformJar --manifest (Join-Path $project 'AndroidManifest.xml') --min-sdk-version 26 --target-sdk-version 36 -A (Join-Path $project 'assets') --java (Join-Path $build 'generated') -o (Join-Path $build 'base.apk') (Join-Path $build 'resources.zip')
Assert-Exit 'Link Android resources'
$sources = @(Get-ChildItem -LiteralPath (Join-Path $project 'java') -Filter '*.java' -Recurse | ForEach-Object { $_.FullName })
& (Join-Path $jdkBin 'javac.exe') -encoding UTF-8 --release 8 -Xlint:-options -classpath $platformJar -d (Join-Path $build 'classes') @sources
Assert-Exit 'Compile Java'
& (Join-Path $jdkBin 'jar.exe') cf (Join-Path $build 'classes.jar') -C (Join-Path $build 'classes') .
Assert-Exit 'Package Java classes'
& (Join-Path $jdkBin 'java.exe') -cp (Join-Path $buildTools 'lib/d8.jar') com.android.tools.r8.D8 --release --min-api 26 --lib $platformJar --output (Join-Path $build 'dex') (Join-Path $build 'classes.jar')
Assert-Exit 'Compile Android bytecode'
& (Join-Path $jdkBin 'jar.exe') uf (Join-Path $build 'base.apk') -C (Join-Path $build 'dex') classes.dex
Assert-Exit 'Package Android bytecode'
& (Join-Path $buildTools 'zipalign.exe') -f -P 16 4 (Join-Path $build 'base.apk') (Join-Path $build 'aligned.apk')
Assert-Exit 'Align APK'
$keystore = Join-Path $signing 'qingji-release.p12'
$passwordFile = Join-Path $signing 'keystore.pass'
if (!(Test-Path -LiteralPath $keystore)) {
    $passwordBytes = [byte[]]::new(24)
    [Security.Cryptography.RandomNumberGenerator]::Fill($passwordBytes)
    [IO.File]::WriteAllText($passwordFile, [Convert]::ToHexString($passwordBytes))
    & (Join-Path $jdkBin 'keytool.exe') -genkeypair -keystore $keystore -storetype PKCS12 -alias qingji -storepass:file $passwordFile -keypass:file $passwordFile -keyalg RSA -keysize 3072 -sigalg SHA256withRSA -validity 36500 -dname 'CN=Qingji Local, O=Qingji, C=CN'
    Assert-Exit 'Create signing identity'
}
& (Join-Path $jdkBin 'java.exe') -jar (Join-Path $buildTools 'lib/apksigner.jar') sign --ks $keystore --ks-key-alias qingji --ks-pass "file:$passwordFile" --v1-signing-enabled true --v2-signing-enabled true --v3-signing-enabled true --out $output (Join-Path $build 'aligned.apk')
Assert-Exit 'Sign APK'
& (Join-Path $jdkBin 'java.exe') -jar (Join-Path $buildTools 'lib/apksigner.jar') verify --verbose --print-certs $output
Assert-Exit 'Verify APK signature'
& (Join-Path $buildTools 'zipalign.exe') -c -P 16 4 $output
Assert-Exit 'Verify APK alignment'
& (Join-Path $buildTools 'aapt2.exe') dump badging $output
Assert-Exit 'Inspect package'
Get-FileHash -Algorithm SHA256 -LiteralPath $output
Get-Item -LiteralPath $output | Select-Object FullName, Length
