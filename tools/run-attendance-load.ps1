param(
 [Parameter(Mandatory=$true)][string]$PostgresBin,
 [ValidateRange(1024,65535)][int]$Port=55432,
 [ValidateRange(0,5000)][int]$IntegrityDelayMs=120,
 [switch]$AccelerateClose,
 [switch]$LocalDemo,
 [switch]$Portal
)
$ErrorActionPreference='Stop'
$attendanceWorkspace=[IO.Path]::GetFullPath((Split-Path -Parent $PSScriptRoot))
$attendanceTempRoot=[IO.Path]::GetFullPath((Join-Path $attendanceWorkspace '.tmp'))
$attendanceCluster=[IO.Path]::GetFullPath((Join-Path $attendanceTempRoot ('attendance-load-'+[Guid]::NewGuid().ToString('N'))))
if (-not $attendanceCluster.StartsWith($attendanceTempRoot+[IO.Path]::DirectorySeparatorChar,[StringComparison]::OrdinalIgnoreCase)) { throw 'Temporary cluster must be inside this workspace .tmp.' }
$attendanceBinaries=(Resolve-Path -LiteralPath $PostgresBin).Path
foreach ($attendanceExecutable in @('initdb.exe','pg_ctl.exe','createdb.exe')) { if (-not (Test-Path -LiteralPath (Join-Path $attendanceBinaries $attendanceExecutable))) { throw "Missing PostgreSQL binary: $attendanceExecutable" } }
$attendanceProbe=[Net.Sockets.TcpClient]::new()
try { $attendanceConnect=$attendanceProbe.ConnectAsync('127.0.0.1',$Port); if ($attendanceConnect.Wait(1000) -and $attendanceProbe.Connected) { throw "Port $Port is already in use; choose a free test port." } } catch [AggregateException] {} finally { $attendanceProbe.Dispose() }
New-Item -ItemType Directory -Path $attendanceCluster -Force | Out-Null
$attendanceData=Join-Path $attendanceCluster 'data'
$attendanceStarted=$false
$attendanceSavedTestUrl=$env:ATTENDANCE_TEST_DATABASE_URL
try {
 & (Join-Path $attendanceBinaries 'initdb.exe') -D $attendanceData -U attendance_simulator -A trust --encoding=UTF8 --no-locale
 if ($LASTEXITCODE -ne 0) { throw 'Temporary PostgreSQL initialization failed.' }
 # This helper starts only a new loopback cluster, never the installed campus service.
 $attendanceStartArgs=@('-D',('"'+$attendanceData+'"'),'-l',('"'+(Join-Path $attendanceCluster 'postgres.log')+'"'),'-o',('"-h 127.0.0.1 -p '+$Port+' -c max_connections=50"'),'-w','start')
 $attendanceProcess=Start-Process -FilePath (Join-Path $attendanceBinaries 'pg_ctl.exe') -ArgumentList $attendanceStartArgs -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $attendanceCluster 'start.out') -RedirectStandardError (Join-Path $attendanceCluster 'start.err')
 $attendanceProcessHandle=$attendanceProcess.Handle
 $attendanceProcess.WaitForExit()
 if ($attendanceProcess.ExitCode -ne 0) { throw "Temporary server failed to start. Inspect $attendanceCluster\postgres.log." }
 $attendanceStarted=$true
 & (Join-Path $attendanceBinaries 'createdb.exe') -h 127.0.0.1 -p $Port -U attendance_simulator attendance_load_test
 if ($LASTEXITCODE -ne 0) { throw 'Temporary test database creation failed.' }
 $env:ATTENDANCE_TEST_DATABASE_URL="postgresql://attendance_simulator@127.0.0.1:$Port/attendance_load_test"
 $attendanceScriptName=if ($Portal) { 'backend\scripts\test-portal-concurrency.mjs' } elseif ($LocalDemo) { 'backend\scripts\test-local-attendance-demo.mjs' } else { 'backend\scripts\simulate-mobile-attendance.mjs' }
 $attendanceSimulation=Join-Path $attendanceWorkspace $attendanceScriptName
 $attendanceArguments=@($attendanceSimulation,'--report',(Join-Path $attendanceWorkspace '.tmp\attendance-load-results.json'),'--integrity-delay-ms',$IntegrityDelayMs)
 if ($AccelerateClose) { $attendanceArguments+='--accelerate-close' }
 if ($LocalDemo -or $Portal) { & node $attendanceSimulation } else { & node @attendanceArguments }
 if ($LASTEXITCODE -ne 0) { throw 'Attendance simulation failed; inspect the matching results JSON under .tmp.' }
} finally {
 $env:ATTENDANCE_TEST_DATABASE_URL=$attendanceSavedTestUrl
 if ($attendanceStarted) {
  $attendanceStopArgs=@('-D',('"'+$attendanceData+'"'),'-m','fast','-w','stop')
  $attendanceStop=Start-Process -FilePath (Join-Path $attendanceBinaries 'pg_ctl.exe') -ArgumentList $attendanceStopArgs -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $attendanceCluster 'stop.out') -RedirectStandardError (Join-Path $attendanceCluster 'stop.err')
  $attendanceStopHandle=$attendanceStop.Handle
  $attendanceStop.WaitForExit()
  if ($attendanceStop.ExitCode -ne 0) { Write-Warning "Temporary server did not stop. Stop only the cluster at $attendanceData with pg_ctl." }
 }
 Write-Host "Temporary cluster logs retained at $attendanceCluster"
}
