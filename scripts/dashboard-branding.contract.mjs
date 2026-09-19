import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import test from 'node:test'

const repoRoot = fileURLToPath(new URL('../', import.meta.url))
const readText = (relativePath) => readFile(path.join(repoRoot, relativePath), 'utf8')
const readBinary = (relativePath) => readFile(path.join(repoRoot, relativePath))

test('desktop package uses the first-party Eclipse Forge assisted installer surface', async () => {
  const packageJson = JSON.parse(await readText('dashboard/package.json'))
  const { build, scripts } = packageJson

  assert.match(scripts['electron:build'], /assets:brand/)
  assert.match(scripts['electron:build'], /electronDist=node_modules\/electron\/dist/)
  assert.equal(build.productName, 'Eclipse Ultron')
  assert.equal(build.win.icon, 'build/eclipse-sentinel.ico')
  assert.equal(build.nsis.oneClick, false)
  assert.equal(build.nsis.perMachine, false)
  assert.equal(build.nsis.allowToChangeInstallationDirectory, true)
  assert.deepEqual(build.nsis.installerLanguages, ['ru_RU', 'en_US'])
  assert.equal(build.nsis.installerHeader, 'build/installerHeader.bmp')
  assert.equal(build.nsis.installerSidebar, 'build/installerSidebar.bmp')
  assert.equal(build.nsis.uninstallerSidebar, 'build/uninstallerSidebar.bmp')
  assert.equal(build.nsis.include, 'build/installer.nsh')
  assert.equal(build.nsis.shortcutName, 'Eclipse Ultron')
  assert.equal(build.nsis.artifactName, 'Eclipse-Ultron-${version}-Setup.${ext}')
})

test('committed NSIS artwork has exact supported bitmap and icon dimensions', async () => {
  for (const [relativePath, width, height] of [
    ['dashboard/build/installerSidebar.bmp', 164, 314],
    ['dashboard/build/uninstallerSidebar.bmp', 164, 314],
    ['dashboard/build/installerHeader.bmp', 150, 57],
  ]) {
    const bitmap = await readBinary(relativePath)
    assert.equal(bitmap.subarray(0, 2).toString('ascii'), 'BM')
    assert.equal(bitmap.readInt32LE(18), width)
    assert.equal(Math.abs(bitmap.readInt32LE(22)), height)
    assert.ok(bitmap.length > 1024)
  }

  const icon = await readBinary('dashboard/build/eclipse-sentinel.ico')
  assert.equal(icon.readUInt16LE(0), 0)
  assert.equal(icon.readUInt16LE(2), 1)
  assert.ok(icon.readUInt16LE(4) >= 1)
})

test('brand asset generation is local, deterministic and free of remote artwork', async () => {
  const source = await readText('dashboard/scripts/generate-installer-brand-assets.ps1')

  assert.doesNotMatch(source, /https?:\/\//i)
  assert.doesNotMatch(source, /Invoke-WebRequest|Invoke-RestMethod|WebClient|Start-Process/i)
  assert.match(source, /#FF304A/)
  assert.match(source, /#FF7B89/)
  assert.match(source, /ULTRON/)
  assert.match(source, /Format24bppRgb/)
  assert.match(source, /DestroyIcon/)
})

test('Ultron shell exposes branded, accessible and responsive primary paths', async () => {
  const [app, conversation, settings, baseCss, brandCss, ultronCss] = await Promise.all([
    readText('dashboard/src/App.tsx'),
    readText('dashboard/src/components/UltronVoiceConversation.tsx'),
    readText('dashboard/src/components/SettingsPanel.tsx'),
    readText('dashboard/src/index.css'),
    readText('dashboard/src/eclipse-forge.css'),
    readText('dashboard/src/ultron.css'),
  ])
  const css = `${baseCss}\n${brandCss}\n${ultronCss}`

  assert.match(app, /BrandLockup/)
  assert.match(app, /type Surface = 'conversation' \| 'operator' \| 'lab'/)
  assert.match(app, />Альтрон<\/button>/)
  assert.match(app, />Lab<\/button>/)
  assert.match(app, />Оператор<\/button>/)
  assert.match(app, /components\/Chat/)
  assert.match(app, /surface === 'lab'/)
  assert.doesNotMatch(app, /components\/Sidebar|UltronContactDock/)
  assert.match(conversation, /Включить живой разговор/)
  assert.match(conversation, /Последний голосовой обмен/)
  assert.doesNotMatch(conversation, /<input|<textarea/)
  assert.match(settings, /aria-modal="true"/)
  assert.match(settings, /event\.key === 'Escape'/)
  assert.match(css, /:focus-visible/)
  assert.match(css, /prefers-reduced-motion: reduce/)
  assert.match(css, /@media \(max-width: 480px\)/)
  assert.match(css, /--ultron-signal: #ff304a/i)
  assert.match(css, /\.ultron-voice/)
})

test('personal Windows installer prefers the approved E drive program root with a safe fallback', async () => {
  const nsis = await readText('dashboard/build/installer.nsh')

  assert.match(nsis, /!macro customInit/)
  assert.ok(nsis.includes('IfFileExists "E:\\*.*" 0 +2'))
  assert.ok(nsis.includes('StrCpy $INSTDIR "E:\\ADMIN_HOPSON_PC\\Программы\\Eclipse Ultron"'))
})
