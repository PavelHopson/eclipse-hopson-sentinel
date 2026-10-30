; A test executable containing ONLY the check. No install/uninstall/registry actions.
Unicode true
Name "Ultron installer guard test"
OutFile "${PROBE_OUT}"
RequestExecutionLevel user
SilentInstall silent
!include "LogicLib.nsh"
!addplugindir /x86-unicode "${PLUGIN_DIR}"
!define APP_EXECUTABLE_FILENAME "${PROBE_NAME}"
!include "${REPO_ROOT}\dashboard\build\installer.nsh"
Section
  !insertmacro customCheckAppRunning
  SetErrorLevel 0
SectionEnd
