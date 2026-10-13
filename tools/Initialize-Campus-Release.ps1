param([string]$JavaHome='C:\Program Files\Eclipse Adoptium\jdk-21.0.8.9-hotspot')
$ErrorActionPreference='Stop'
$campusRoot=[IO.Path]::GetFullPath((Split-Path -Parent $PSScriptRoot))
$campusRelease=Join-Path $campusRoot '.release'
$campusKey=Join-Path $campusRelease 'campus-release.p12'
$campusProperties=Join-Path $campusRelease 'release-signing.properties'
$campusCert=Join-Path $campusRelease 'campus-release-cert.pem'
$campusKeytool=Join-Path $JavaHome 'bin\keytool.exe'
if (!(Test-Path -LiteralPath $campusKeytool)) {throw 'JDK keytool is missing.'}
if ((Test-Path -LiteralPath $campusKey) -or (Test-Path -LiteralPath $campusProperties)) {
 if (!(Test-Path -LiteralPath $campusKey) -or !(Test-Path -LiteralPath $campusProperties)) {throw 'Incomplete signing setup. Existing files were preserved.'}
 Write-Output 'Existing campus signing key preserved.'
 exit 0
}
New-Item -ItemType Directory -Path $campusRelease -Force | Out-Null
$campusRandom=New-Object byte[] 32
$campusRng=[Security.Cryptography.RandomNumberGenerator]::Create()
try {$campusRng.GetBytes($campusRandom)} finally {$campusRng.Dispose()}
$campusPassword=([BitConverter]::ToString($campusRandom)).Replace('-','').ToLowerInvariant()
$campusPasswordFile=Join-Path $campusRelease 'keytool-password.tmp'
[IO.File]::WriteAllText($campusPasswordFile,$campusPassword,[Text.Encoding]::ASCII)
try {
 & $campusKeytool -genkeypair -keystore $campusKey -storetype PKCS12 -alias campus-release -keyalg RSA -keysize 3072 -validity 10000 -dname 'CN=GVPCEW Campus Android Release' -storepass:file $campusPasswordFile -keypass:file $campusPasswordFile
 if ($LASTEXITCODE -ne 0) {throw 'Signing key creation failed.'}
 [IO.File]::WriteAllText($campusProperties,"storePassword=$campusPassword`nkeyPassword=$campusPassword`nkeyAlias=campus-release`n",[Text.Encoding]::ASCII)
 & $campusKeytool -exportcert -rfc -keystore $campusKey -alias campus-release -storepass:file $campusPasswordFile -file $campusCert
 if ($LASTEXITCODE -ne 0) {throw 'Certificate export failed.'}
 $campusCertificate=[Security.Cryptography.X509Certificates.X509Certificate2]::new($campusCert)
 $campusHasher=[Security.Cryptography.SHA256]::Create()
 try {$campusFingerprint=([BitConverter]::ToString($campusHasher.ComputeHash($campusCertificate.RawData))).Replace('-','').ToLowerInvariant()} finally {$campusHasher.Dispose();$campusCertificate.Dispose()}
 [IO.File]::WriteAllText((Join-Path $campusRoot 'docs\campus-release-certificate.json'),(@{sha256=$campusFingerprint;alias='campus-release';local_key='.release/campus-release.p12';play_app_signing_certificate_must_be_checked=$true}|ConvertTo-Json)+"`n")
 Write-Output 'Campus signing key created. Back up the .release directory securely; passwords were not printed.'
 Write-Output "Public certificate SHA-256: $campusFingerprint"
} finally {
 Remove-Item -LiteralPath $campusPasswordFile -ErrorAction SilentlyContinue
 [Array]::Clear($campusRandom,0,$campusRandom.Length)
 $campusPassword=$null
}
