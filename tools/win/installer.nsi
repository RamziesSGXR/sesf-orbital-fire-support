; Orbital Fury - Windows installer (0.62.26). Built by tools/package.py with NSIS (makensis), on Linux or Windows.
; Installs for the current user only (no administrator needed) into %LocalAppData%\OrbitalFury: the one-file game, its icon
; and an uninstaller. The Start menu and desktop shortcuts open the game in its own window with Microsoft Edge (part of
; Windows 10 and 11), or Chrome, or the default browser if neither is found. Everything plays offline.
Unicode true
!include "MUI2.nsh"
!include "WordFunc.nsh"

!ifndef VERSION
  !define VERSION "0.0.0"
!endif
!ifndef SRC
  !define SRC "."
!endif
!ifndef OUT
  !define OUT "Orbital-Fury-Setup.exe"
!endif

Name "Orbital Fury"
OutFile "${OUT}"
InstallDir "$LOCALAPPDATA\OrbitalFury"
RequestExecutionLevel user
SetCompressor /SOLID lzma
BrandingText "Orbital Fury ${VERSION} - unofficial fan project"

VIProductVersion "${VERSION}.0"
VIAddVersionKey "ProductName" "Orbital Fury"
VIAddVersionKey "FileDescription" "Orbital Fury installer"
VIAddVersionKey "FileVersion" "${VERSION}"
VIAddVersionKey "ProductVersion" "${VERSION}"
VIAddVersionKey "LegalCopyright" "Unofficial fan project"

!define MUI_ICON "${SRC}\orbital-fury.ico"
!define MUI_UNICON "${SRC}\orbital-fury.ico"
!define MUI_ABORTWARNING
!define MUI_WELCOMEPAGE_TITLE "Orbital Fury ${VERSION}"
!define MUI_WELCOMEPAGE_TEXT "This installs Orbital Fury on this computer for you. It plays with no internet connection.$\r$\n$\r$\nNo administrator rights are needed. Your progress is kept between sessions.$\r$\n$\r$\nUnofficial fan project: no game assets, text or audio from Helldivers."
!define MUI_FINISHPAGE_RUN
!define MUI_FINISHPAGE_RUN_TEXT "Play Orbital Fury now"
!define MUI_FINISHPAGE_RUN_FUNCTION Launch

!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH
!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES
!insertmacro MUI_LANGUAGE "English"

Var Browser
Var Args

; The browser to open the game with, and its arguments. The game's address as a file:/// URL: forward slashes, spaces as %20.
Function FindBrowser
  StrCpy $Browser ""
  IfFileExists "$PROGRAMFILES32\Microsoft\Edge\Application\msedge.exe" 0 +2
    StrCpy $Browser "$PROGRAMFILES32\Microsoft\Edge\Application\msedge.exe"
  StrCmp $Browser "" 0 found
  IfFileExists "$PROGRAMFILES64\Microsoft\Edge\Application\msedge.exe" 0 +2
    StrCpy $Browser "$PROGRAMFILES64\Microsoft\Edge\Application\msedge.exe"
  StrCmp $Browser "" 0 found
  IfFileExists "$LOCALAPPDATA\Google\Chrome\Application\chrome.exe" 0 +2
    StrCpy $Browser "$LOCALAPPDATA\Google\Chrome\Application\chrome.exe"
  StrCmp $Browser "" 0 found
  IfFileExists "$PROGRAMFILES64\Google\Chrome\Application\chrome.exe" 0 +2
    StrCpy $Browser "$PROGRAMFILES64\Google\Chrome\Application\chrome.exe"
  StrCmp $Browser "" 0 found
  IfFileExists "$PROGRAMFILES32\Google\Chrome\Application\chrome.exe" 0 +2
    StrCpy $Browser "$PROGRAMFILES32\Google\Chrome\Application\chrome.exe"
  found:
  ${WordReplace} "$INSTDIR\Orbital-Fury.html" "\" "/" "+" $0
  ${WordReplace} "$0" " " "%20" "+" $0
  StrCpy $Args '--app="file:///$0" --window-size=1366,880 --start-maximized'
FunctionEnd

Function Launch
  Call FindBrowser
  StrCmp $Browser "" 0 +3
    ExecShell "open" "$INSTDIR\Orbital-Fury.html"
    Return
  Exec '"$Browser" $Args'
FunctionEnd

Section "Orbital Fury"
  SetOutPath "$INSTDIR"
  File "${SRC}\Orbital-Fury.html"
  File "${SRC}\orbital-fury.ico"
  File "${SRC}\README.txt"
  WriteUninstaller "$INSTDIR\Uninstall.exe"
  Call FindBrowser
  StrCmp $Browser "" plain
    CreateShortCut "$SMPROGRAMS\Orbital Fury.lnk" "$Browser" "$Args" "$INSTDIR\orbital-fury.ico" 0
    CreateShortCut "$DESKTOP\Orbital Fury.lnk" "$Browser" "$Args" "$INSTDIR\orbital-fury.ico" 0
    Goto done
  plain:
    CreateShortCut "$SMPROGRAMS\Orbital Fury.lnk" "$INSTDIR\Orbital-Fury.html" "" "$INSTDIR\orbital-fury.ico" 0
    CreateShortCut "$DESKTOP\Orbital Fury.lnk" "$INSTDIR\Orbital-Fury.html" "" "$INSTDIR\orbital-fury.ico" 0
  done:
  ; Settings > Apps lists it, with Uninstall
  !define UK "Software\Microsoft\Windows\CurrentVersion\Uninstall\OrbitalFury"
  WriteRegStr HKCU "${UK}" "DisplayName" "Orbital Fury"
  WriteRegStr HKCU "${UK}" "DisplayVersion" "${VERSION}"
  WriteRegStr HKCU "${UK}" "Publisher" "Orbital Fury (fan project)"
  WriteRegStr HKCU "${UK}" "DisplayIcon" "$INSTDIR\orbital-fury.ico"
  WriteRegStr HKCU "${UK}" "InstallLocation" "$INSTDIR"
  WriteRegStr HKCU "${UK}" "UninstallString" '"$INSTDIR\Uninstall.exe"'
  WriteRegDWORD HKCU "${UK}" "NoModify" 1
  WriteRegDWORD HKCU "${UK}" "NoRepair" 1
SectionEnd

Section "Uninstall"
  Delete "$SMPROGRAMS\Orbital Fury.lnk"
  Delete "$DESKTOP\Orbital Fury.lnk"
  Delete "$INSTDIR\Orbital-Fury.html"
  Delete "$INSTDIR\orbital-fury.ico"
  Delete "$INSTDIR\README.txt"
  Delete "$INSTDIR\Uninstall.exe"
  RMDir "$INSTDIR"
  DeleteRegKey HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\OrbitalFury"
SectionEnd
