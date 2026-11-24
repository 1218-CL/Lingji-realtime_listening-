Unicode true
!include "MUI2.nsh"
!include "LogicLib.nsh"

!define APP_NAME "聆记 LingJi"
!define APP_VERSION "1.2.0"
!define APP_PUBLISHER "LingJi"
!define APP_ENTRY "app.mjs"
!define APP_REG_KEY "Software\LingJi"
!define UNINSTALL_KEY "Software\Microsoft\Windows\CurrentVersion\Uninstall\LingJi"

!cd "${__FILEDIR__}\.."

Name "${APP_NAME}"
OutFile "release\LingJi-Setup-${APP_VERSION}.exe"
InstallDir "$LOCALAPPDATA\Programs\LingJi"
InstallDirRegKey HKCU "${APP_REG_KEY}" "InstallDir"
RequestExecutionLevel user
SetCompressor /SOLID lzma
SetCompressorDictSize 64
BrandingText "${APP_NAME} · 本地课堂助手"

Icon "build\icon.ico"
UninstallIcon "build\icon.ico"

VIProductVersion "1.2.0.0"
VIAddVersionKey /LANG=2052 "ProductName" "${APP_NAME}"
VIAddVersionKey /LANG=2052 "FileDescription" "聆记 LingJi 安装程序"
VIAddVersionKey /LANG=2052 "CompanyName" "${APP_PUBLISHER}"
VIAddVersionKey /LANG=2052 "FileVersion" "${APP_VERSION}"
VIAddVersionKey /LANG=2052 "ProductVersion" "${APP_VERSION}"
VIAddVersionKey /LANG=2052 "OriginalFilename" "LingJi-Setup-${APP_VERSION}.exe"
VIAddVersionKey /LANG=2052 "LegalCopyright" "© 2026 LingJi"

!define MUI_ABORTWARNING
!define MUI_ICON "build\icon.ico"
!define MUI_UNICON "build\icon.ico"
!define MUI_WELCOMEPAGE_TITLE "安装 ${APP_NAME}"
!define MUI_WELCOMEPAGE_TEXT "聆记是一款本地优先的课堂记录工具：实时转写、实时纪要、随堂问答和老师画像。$\r$\n$\r$\n安装到当前用户，不需要管理员权限。课堂数据默认保存在 %LOCALAPPDATA%\LingJi。$\r$\n$\r$\n录音前请获得老师或课堂许可，并尊重知识产权。"
!define MUI_FINISHPAGE_TITLE "安装完成"
!define MUI_FINISHPAGE_TEXT "聆记已经安装完成。$\r$\n$\r$\n双击桌面的「${APP_NAME}」即可启动；第一次使用请注册账号。$\r$\n关闭启动时出现的黑色命令行窗口即可停止本地服务。"
!define MUI_FINISHPAGE_RUN "$INSTDIR\node.exe"
!define MUI_FINISHPAGE_RUN_PARAMETERS '$\"$INSTDIR\${APP_ENTRY}$\"'
!define MUI_FINISHPAGE_RUN_TEXT "立即启动 ${APP_NAME}"

!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH

!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES

!insertmacro MUI_LANGUAGE "SimpChinese"

Var DesktopDir
Var StartMenuDir

Function .onInit
  SetShellVarContext current
  StrCpy $DesktopDir "$DESKTOP"
  ${If} $DesktopDir == ""
    StrCpy $DesktopDir "$PROFILE\Desktop"
  ${EndIf}
  StrCpy $StartMenuDir "$SMPROGRAMS"
  ${If} $StartMenuDir == ""
    StrCpy $StartMenuDir "$APPDATA\Microsoft\Windows\Start Menu\Programs"
  ${EndIf}
FunctionEnd

Function un.onInit
  SetShellVarContext current
  StrCpy $DesktopDir "$DESKTOP"
  ${If} $DesktopDir == ""
    StrCpy $DesktopDir "$PROFILE\Desktop"
  ${EndIf}
  StrCpy $StartMenuDir "$SMPROGRAMS"
  ${If} $StartMenuDir == ""
    StrCpy $StartMenuDir "$APPDATA\Microsoft\Windows\Start Menu\Programs"
  ${EndIf}
FunctionEnd

Section "安装 聆记 LingJi" SecInstall
  SetOutPath "$INSTDIR"
  File /r "release\LingJi-Portable-NoAdmin\*.*"
  File /oname=LingJi.ico "build\icon.ico"

  WriteUninstaller "$INSTDIR\Uninstall.exe"

  CreateDirectory "$StartMenuDir\${APP_NAME}"
  CreateShortCut "$StartMenuDir\${APP_NAME}\${APP_NAME}.lnk" "$INSTDIR\node.exe" '"$INSTDIR\${APP_ENTRY}"' "$INSTDIR\LingJi.ico" 0
  CreateShortCut "$DesktopDir\${APP_NAME}.lnk" "$INSTDIR\node.exe" '"$INSTDIR\${APP_ENTRY}"' "$INSTDIR\LingJi.ico" 0
  CreateShortCut "$StartMenuDir\${APP_NAME}\卸载 ${APP_NAME}.lnk" "$INSTDIR\Uninstall.exe"

  WriteRegStr HKCU "${APP_REG_KEY}" "InstallDir" "$INSTDIR"
  WriteRegStr HKCU "${UNINSTALL_KEY}" "DisplayName" "${APP_NAME}"
  WriteRegStr HKCU "${UNINSTALL_KEY}" "DisplayVersion" "${APP_VERSION}"
  WriteRegStr HKCU "${UNINSTALL_KEY}" "DisplayIcon" "$INSTDIR\LingJi.ico"
  WriteRegStr HKCU "${UNINSTALL_KEY}" "Publisher" "${APP_PUBLISHER}"
  WriteRegStr HKCU "${UNINSTALL_KEY}" "InstallLocation" "$INSTDIR"
  WriteRegStr HKCU "${UNINSTALL_KEY}" "UninstallString" '"$INSTDIR\Uninstall.exe"'
  WriteRegDWORD HKCU "${UNINSTALL_KEY}" "NoModify" 1
  WriteRegDWORD HKCU "${UNINSTALL_KEY}" "NoRepair" 1
SectionEnd

Section "Uninstall"
  Delete "$DesktopDir\${APP_NAME}.lnk"
  RMDir /r "$StartMenuDir\${APP_NAME}"

  DeleteRegKey HKCU "${UNINSTALL_KEY}"
  DeleteRegKey HKCU "${APP_REG_KEY}"

  ; Never remove classroom data in silent mode (used by update/uninstall scripts).
  IfSilent keep_data

  MessageBox MB_YESNO|MB_ICONQUESTION "是否同时删除课堂数据、录音和已保存的 API 设置？$\r$\n$\r$\n选择“否”会保留 %LOCALAPPDATA%\LingJi，之后重新安装仍可继续使用。" IDNO keep_data
  RMDir /r "$LOCALAPPDATA\LingJi"

keep_data:
  RMDir /r "$INSTDIR"
SectionEnd
