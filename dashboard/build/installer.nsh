!define MUI_BGCOLOR "050507"
!define MUI_TEXTCOLOR "F2F5F9"
!define MUI_INSTFILESPAGE_COLORS "C7CDD6 050507"
!define MUI_FINISHPAGE_NOAUTOCLOSE

!macro customHeader
  BrandingText "Eclipse Forge · Ultron ${VERSION}"
!macroend

!macro customInit
  IfFileExists "E:\*.*" 0 +2
  StrCpy $INSTDIR "E:\ADMIN_HOPSON_PC\Программы\Eclipse Ultron"
!macroend

!macro customCheckAppRunning
  ; Never let an installer kill an application/process tree implicitly. A
  ; same-named process blocks conservatively; it never authorizes termination.
  ${Do}
    nsProcess::_FindProcess /NOUNLOAD "${APP_EXECUTABLE_FILENAME}"
    Pop $0
    ${If} $0 == 603
      ${ExitDo}
    ${EndIf}
    ${If} $0 != 0
      SetErrorLevel 5
      Abort "Не удалось проверить, закрыт ли Eclipse Ultron. Установка остановлена."
    ${EndIf}
    ${If} ${Silent}
      SetErrorLevel 4
      Quit
    ${EndIf}
    MessageBox MB_RETRYCANCEL|MB_ICONEXCLAMATION "Закройте Eclipse Ultron через меню «Выход» в области уведомлений, затем нажмите «Повторить». Ollama завершать не нужно." /SD IDCANCEL IDRETRY +2
      Quit
  ${Loop}
!macroend

!macro verifyVoiceAccess
  nsExec::ExecToStack '"$SYSDIR\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -NonInteractive -File "$PLUGINSDIR\ultron-voice-acl.ps1" -VoiceDirectory "$INSTDIR\resources\voice-runtime"'
  Pop $0
  Pop $1
!macroend

!macro customInstall
  ; Same fixed AppContainer name/SID as AppContainerHost.cs. RX for this
  ; private voice package only; never grant capabilities or broad user rights.
  ; Run while the installer still owns the freshly installed resource folder.
  InitPluginsDir
  File /oname=$PLUGINSDIR\ultron-voice-acl.ps1 "${BUILD_RESOURCES_DIR}\verify-voice-acl.ps1"
  !insertmacro verifyVoiceAccess
  ${If} $0 != 0
    nsExec::ExecToStack '"$SYSDIR\icacls.exe" "$INSTDIR\resources\voice-runtime" /grant "*S-1-15-2-3401530238-3731070781-1353621829-3068759506-4022790450-2217579969-1039810395:(OI)(CI)(RX)" /q'
    Pop $0
    Pop $1
    ${If} $0 != 0
      DetailPrint "Cannot grant read-only access to the offline voice container."
      SetErrorLevel 3
      Abort "Не удалось подготовить изолированный голосовой модуль."
    ${EndIf}
    !insertmacro verifyVoiceAccess
    ${If} $0 != 0
      SetErrorLevel 6
      Abort "Не удалось проверить изоляцию голосового модуля. Установка остановлена."
    ${EndIf}
  ${EndIf}
!macroend
