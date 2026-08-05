/**
 * Values replaced by scripts/build.ts during Bun bundling.
 *
 * Keep this declaration synchronized with the build define map so TypeScript
 * validates macro consumers without introducing runtime globals.
 */
declare const MACRO: Readonly<{
  VERSION: string
  DISPLAY_VERSION: string
  BUILD_TIME: string
  ISSUES_EXPLAINER: string
  FEEDBACK_CHANNEL: string
  VERSION_CHANGELOG: string
  AUTOUPDATES_ENABLED: boolean
  PACKAGE_URL: string
  NATIVE_PACKAGE_URL: string | undefined
}>
