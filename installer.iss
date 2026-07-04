; Inno Setup script for Rateify — compile with ISCC.exe installer.iss
#define MyAppName "Rateify"
#define MyAppVersion "1.1.0"
#define MyAppExeName "Rateify.exe"

[Setup]
AppId={{B3A7F2C4-9D1E-4A6B-8C05-2F7E9A31D6C4}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppPublisher=Kaan
DefaultDirName={localappdata}\Programs\{#MyAppName}
DisableProgramGroupPage=yes
; per-user install: no admin prompt, and the app can write its library next to itself
PrivilegesRequired=lowest
OutputDir=release
OutputBaseFilename=Rateify-Setup-{#MyAppVersion}
SetupIconFile=rateify.ico
Compression=lzma
SolidCompression=yes
WizardStyle=modern
UninstallDisplayIcon={app}\{#MyAppExeName}
LicenseFile=LICENSE

[Tasks]
Name: "desktopicon"; Description: "{cm:CreateDesktopIcon}"; GroupDescription: "{cm:AdditionalIcons}"

[Files]
Source: "dist\{#MyAppExeName}"; DestDir: "{app}"; Flags: ignoreversion

[Icons]
Name: "{autoprograms}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"
Name: "{autodesktop}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"; Tasks: desktopicon

[Run]
Filename: "{app}\{#MyAppExeName}"; Description: "{cm:LaunchProgram,{#MyAppName}}"; Flags: nowait postinstall skipifsilent

; NB: uninstall deliberately leaves {app}\data and {app}\covers behind —
; those are the user's ratings, not ours to delete.
