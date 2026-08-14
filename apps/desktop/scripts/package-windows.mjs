import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const require = createRequire(import.meta.url);

export function createWindowsPackagePlan(input) {
  if (typeof input.iexpressPath !== 'string' || input.iexpressPath.length === 0) {
    throw new Error('IEXPRESS_UNAVAILABLE');
  }
  if (
    typeof input.electronRuntimeDirectory !== 'string' ||
    input.electronRuntimeDirectory.length === 0
  ) {
    throw new Error('ELECTRON_RUNTIME_UNAVAILABLE');
  }
  if (typeof input.version !== 'string' || !/^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/u.test(input.version)) {
    throw new Error('PACKAGE_VERSION_INVALID');
  }
  const releaseDirectory = path.resolve(input.desktopDirectory, 'release');
  const applicationDirectory = path.join(releaseDirectory, 'win-unpacked');
  const installerName = `DataBreeze-Setup-${input.version}-unsigned.exe`;
  return Object.freeze({
    signing: 'UNSIGNED',
    executableName: 'DataBreeze.exe',
    installerName,
    installerPath: path.join(releaseDirectory, installerName),
    applicationDirectory,
    electronRuntimeDirectory: path.resolve(input.electronRuntimeDirectory),
    iexpressPath: path.resolve(input.iexpressPath),
  });
}

function powershellLiteral(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

function installerScript() {
  return `param([Parameter(Mandatory = $true)][string]$ArchivePath)
$ErrorActionPreference = 'Stop'
$programsRoot = [IO.Path]::GetFullPath((Join-Path $env:LOCALAPPDATA 'Programs'))
$installRoot = [IO.Path]::GetFullPath((Join-Path $programsRoot 'DataBreeze'))
if (-not $installRoot.StartsWith($programsRoot + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) { throw 'INSTALL_TARGET_REJECTED' }
$stagingRoot = [IO.Path]::GetFullPath((Join-Path $env:TEMP ('DataBreeze-install-' + [Guid]::NewGuid().ToString('N'))))
$backupRoot = $installRoot + '.previous'
try {
  New-Item -ItemType Directory -Path $stagingRoot | Out-Null
  Expand-Archive -LiteralPath $ArchivePath -DestinationPath $stagingRoot -Force
  if (-not (Test-Path -LiteralPath (Join-Path $stagingRoot 'DataBreeze.exe') -PathType Leaf)) { throw 'PACKAGE_EXECUTABLE_MISSING' }
  if (Test-Path -LiteralPath $backupRoot) { Remove-Item -LiteralPath $backupRoot -Recurse -Force }
  if (Test-Path -LiteralPath $installRoot) { Move-Item -LiteralPath $installRoot -Destination $backupRoot }
  Move-Item -LiteralPath $stagingRoot -Destination $installRoot
  $shortcutDirectory = Join-Path $env:APPDATA 'Microsoft\\Windows\\Start Menu\\Programs'
  $shortcutPath = Join-Path $shortcutDirectory 'DataBreeze.lnk'
  $shell = New-Object -ComObject WScript.Shell
  $shortcut = $shell.CreateShortcut($shortcutPath)
  $shortcut.TargetPath = Join-Path $installRoot 'DataBreeze.exe'
  $shortcut.WorkingDirectory = $installRoot
  $shortcut.Save()
  if (Test-Path -LiteralPath $backupRoot) { Remove-Item -LiteralPath $backupRoot -Recurse -Force }
} catch {
  if ((-not (Test-Path -LiteralPath $installRoot)) -and (Test-Path -LiteralPath $backupRoot)) { Move-Item -LiteralPath $backupRoot -Destination $installRoot }
  throw
} finally {
  if (Test-Path -LiteralPath $stagingRoot) { Remove-Item -LiteralPath $stagingRoot -Recurse -Force }
}
`;
}

function iexpressSed({ sourceDirectory, installerPath }) {
  const source = `${sourceDirectory.replaceAll('/', '\\')}\\`;
  return `[Version]
Class=IEXPRESS
SEDVersion=3
[Options]
PackagePurpose=InstallApp
ShowInstallProgramWindow=0
HideExtractAnimation=1
UseLongFileName=1
InsideCompressed=0
CAB_FixedSize=0
CAB_ResvCodeSigning=0
RebootMode=N
InstallPrompt=
DisplayLicense=
FinishMessage=
TargetName=${installerPath}
FriendlyName=DataBreeze
AppLaunched=cmd.exe /c install.cmd
PostInstallCmd=<None>
AdminQuietInstCmd=
UserQuietInstCmd=
SourceFiles=SourceFiles
[Strings]
FILE0="DataBreeze.zip"
FILE1="install.cmd"
FILE2="install.ps1"
[SourceFiles]
SourceFiles0=${source}
[SourceFiles0]
%FILE0%=
%FILE1%=
%FILE2%=
`;
}

function defaultInputs(desktopDirectory) {
  const packageJson = JSON.parse(readFileSync(path.join(desktopDirectory, 'package.json'), 'utf8'));
  const electronPackageDirectory = path.dirname(require.resolve('electron/package.json'));
  const iexpressPath = path.join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'iexpress.exe');
  return {
    desktopDirectory,
    electronRuntimeDirectory: path.join(electronPackageDirectory, 'dist'),
    iexpressPath: existsSync(iexpressPath) ? iexpressPath : null,
    version: packageJson.version,
  };
}

function buildUnsignedInstaller(plan, desktopDirectory) {
  const distDirectory = path.join(desktopDirectory, 'dist');
  for (const requiredPath of ['main/index.js', 'preload/index.cjs', 'renderer/index.html']) {
    if (!existsSync(path.join(distDirectory, requiredPath))) throw new Error(`BUILD_OUTPUT_MISSING:${requiredPath}`);
  }
  if (!existsSync(path.join(plan.electronRuntimeDirectory, 'electron.exe'))) {
    throw new Error('ELECTRON_RUNTIME_UNAVAILABLE');
  }
  rmSync(plan.applicationDirectory, { recursive: true, force: true });
  mkdirSync(plan.applicationDirectory, { recursive: true });
  cpSync(plan.electronRuntimeDirectory, plan.applicationDirectory, { recursive: true });
  renameSync(
    path.join(plan.applicationDirectory, 'electron.exe'),
    path.join(plan.applicationDirectory, plan.executableName),
  );
  const applicationResources = path.join(plan.applicationDirectory, 'resources', 'app');
  mkdirSync(applicationResources, { recursive: true });
  cpSync(distDirectory, path.join(applicationResources, 'dist'), { recursive: true });
  writeFileSync(
    path.join(applicationResources, 'package.json'),
    `${JSON.stringify({ name: 'databreeze-desktop', version: JSON.parse(readFileSync(path.join(desktopDirectory, 'package.json'), 'utf8')).version, private: true, type: 'module', main: 'dist/main/index.js' }, null, 2)}\n`,
    'utf8',
  );

  const installerInput = path.join(path.dirname(plan.applicationDirectory), 'installer-input');
  rmSync(installerInput, { recursive: true, force: true });
  mkdirSync(installerInput, { recursive: true });
  const archivePath = path.join(installerInput, 'DataBreeze.zip');
  execFileSync(
    'powershell.exe',
    [
      '-NoProfile',
      '-NonInteractive',
      '-Command',
      `Compress-Archive -Path ${powershellLiteral(path.join(plan.applicationDirectory, '*'))} -DestinationPath ${powershellLiteral(archivePath)} -CompressionLevel Optimal -Force`,
    ],
    { stdio: 'inherit' },
  );
  writeFileSync(
    path.join(installerInput, 'install.cmd'),
    '@echo off\r\npowershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "%~dp0install.ps1" -ArchivePath "%~dp0DataBreeze.zip"\r\nexit /b %errorlevel%\r\n',
    'utf8',
  );
  writeFileSync(path.join(installerInput, 'install.ps1'), installerScript(), 'utf8');
  const sedPath = path.join(installerInput, 'package.sed');
  writeFileSync(sedPath, iexpressSed({ sourceDirectory: installerInput, installerPath: plan.installerPath }), 'utf8');
  rmSync(plan.installerPath, { force: true });
  execFileSync(plan.iexpressPath, ['/N', '/Q', sedPath], { stdio: 'inherit' });
  if (!existsSync(plan.installerPath)) throw new Error('INSTALLER_BUILD_FAILED');
  const manifestPath = `${plan.installerPath}.json`;
  writeFileSync(
    manifestPath,
    `${JSON.stringify({ artifact: plan.installerName, signing: plan.signing, productionApproval: false }, null, 2)}\n`,
    'utf8',
  );
  return manifestPath;
}

async function main() {
  const desktopDirectory = path.resolve(import.meta.dirname, '..');
  const plan = createWindowsPackagePlan(defaultInputs(desktopDirectory));
  if (process.argv.includes('--plan')) {
    console.log(JSON.stringify(plan, null, 2));
    return;
  }
  const manifestPath = buildUnsignedInstaller(plan, desktopDirectory);
  console.log(`Created ${plan.installerPath}`);
  console.log(`Release status: ${plan.signing}; manifest: ${manifestPath}`);
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : 'WINDOWS_PACKAGE_FAILED');
    process.exitCode = 1;
  });
}
