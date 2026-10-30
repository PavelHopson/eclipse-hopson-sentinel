; Exercise the real post-install ACL check, without copying app files/registry writes.
Unicode true
Name "Ultron voice ACL prerequisite test"
OutFile "${PROBE_OUT}"
RequestExecutionLevel user
SilentInstall silent
!include "LogicLib.nsh"
!define BUILD_RESOURCES_DIR "${REPO_ROOT}\dashboard\build"
!include "${BUILD_RESOURCES_DIR}\installer.nsh"
Section
  StrCpy $INSTDIR "${PROBE_INSTALL_ROOT}"
  InitPluginsDir
  File /oname=$PLUGINSDIR\ultron-voice-acl.ps1 "${BUILD_RESOURCES_DIR}\verify-voice-acl.ps1"
  nsExec::ExecToStack '"$SYSDIR\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -NonInteractive -File "$PLUGINSDIR\ultron-voice-acl.ps1" -VoiceDirectory "$INSTDIR\resources\voice-runtime" -Verbose'
  Pop $0
  Pop $1
  FileOpen $3 "${PROBE_OUT}.log" w
  FileWrite $3 "Verifier exit: $0$\r$\n$1$\r$\n"
  FileClose $3
  !insertmacro customInstall
  SetErrorLevel 0
SectionEnd
