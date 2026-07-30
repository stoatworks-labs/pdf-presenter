import { app, shell } from 'electron'
import { execFile } from 'child_process'
import { promisify } from 'util'
import { readdir, readFile } from 'fs/promises'
import { join, basename } from 'path'

const execFileAsync = promisify(execFile)

export interface SetDefaultPdfResult {
  status: 'success' | 'manual' | 'error'
  message: string
}

function encodePowerShellCommand(script: string): string {
  return Buffer.from(script, 'utf16le').toString('base64')
}

// Matches this app's electron-builder.yml appId — hardcoded rather than read
// from the running app bundle, since that's simpler and exactly as reliable
// (it's fixed at build time either way).
const MAC_BUNDLE_ID = 'com.allansargeant.pdf-presenter-lite'
const WIN_PROG_ID = 'PDFPresenterLite.pdf'
const WIN_REG_SUBKEY = 'PDFPresenterLite'
const APP_NAME = 'PDF Presenter Lite'

/**
 * Makes this app the OS default handler for .pdf files. Real behavior
 * differs meaningfully by platform — neither Windows nor macOS let a
 * third-party app silently seize the default-app slot (by design, to
 * prevent hijacking), so this is honest about what each platform actually
 * lets an app do rather than faking a uniform "just works" result.
 */
export async function setAsDefaultPdfHandler(): Promise<SetDefaultPdfResult> {
  if (process.platform === 'win32') return setDefaultWindows()
  if (process.platform === 'darwin') return setDefaultMac()
  return setDefaultLinux()
}

/**
 * This app ships portable-only on Windows (no NSIS installer), so there's
 * no install-time step that registers file associations the way an
 * installer-based app could. Instead, on button click, we self-register the
 * standard user-scope (HKCU, no admin needed) registry keys that make an app
 * *eligible* to appear in "Open with" / Default Apps — a ProgID pointing at
 * this executable, and a RegisteredApplications/Capabilities entry. Actually
 * setting it as the user's chosen default is then a required manual step:
 * Windows has protected the real "UserChoice" registry key since Windows 8
 * specifically to stop apps silently hijacking file associations, so we open
 * Settings' Default Apps page for the user to make the final pick — that
 * last step genuinely cannot be automated away.
 *
 * Not verified on a real Windows machine — implemented against the
 * documented registry keys Windows itself uses for this (the same shape
 * portable apps like this one commonly self-register), not live-tested.
 */
async function setDefaultWindows(): Promise<SetDefaultPdfResult> {
  const exePath = process.execPath.replace(/'/g, "''")
  const script = `
$exePath = '${exePath}'
$progId = '${WIN_PROG_ID}'
$regSubkey = '${WIN_REG_SUBKEY}'
$appName = '${APP_NAME}'

New-Item -Path "HKCU:\\Software\\Classes\\$progId\\shell\\open\\command" -Force | Out-Null
$commandValue = '"' + $exePath + '" "%1"'
Set-ItemProperty -Path "HKCU:\\Software\\Classes\\$progId\\shell\\open\\command" -Name '(default)' -Value $commandValue

New-Item -Path "HKCU:\\Software\\Classes\\.pdf\\OpenWithProgids" -Force | Out-Null
Set-ItemProperty -Path "HKCU:\\Software\\Classes\\.pdf\\OpenWithProgids" -Name $progId -Value ''

New-Item -Path "HKCU:\\Software\\$regSubkey\\Capabilities\\FileAssociations" -Force | Out-Null
Set-ItemProperty -Path "HKCU:\\Software\\$regSubkey\\Capabilities\\FileAssociations" -Name '.pdf' -Value $progId
Set-ItemProperty -Path "HKCU:\\Software\\$regSubkey\\Capabilities" -Name 'ApplicationName' -Value $appName
Set-ItemProperty -Path "HKCU:\\Software\\$regSubkey\\Capabilities" -Name 'ApplicationDescription' -Value "$appName (PDF viewer)"

New-Item -Path "HKCU:\\Software\\RegisteredApplications" -Force | Out-Null
Set-ItemProperty -Path "HKCU:\\Software\\RegisteredApplications" -Name $appName -Value "Software\\$regSubkey\\Capabilities"
`
  await execFileAsync('powershell.exe', [
    '-NoProfile',
    '-NonInteractive',
    '-EncodedCommand',
    encodePowerShellCommand(script)
  ])

  await shell.openExternal('ms-settings:defaultapps')

  return {
    status: 'manual',
    message:
      `Registered ${APP_NAME} as a PDF app. Windows requires you to pick it yourself — ` +
      'the Default Apps settings page just opened; search for it there, or pick any ' +
      '.pdf file, right-click → "Open with" → "Choose another app".'
  }
}

/**
 * CFBundleDocumentTypes (declared via electron-builder.yml's
 * fileAssociations, baked into Info.plist at build time) is what makes this
 * app a valid .pdf candidate at all — that can't be done at runtime, only
 * at build time. Given that's already in place, actually setting the
 * default: `lsregister -f` first forces Launch Services to notice this app
 * bundle (helpful right after a fresh install/update), then `duti` — if
 * installed — genuinely sets it. If `duti` isn't present, there's no public
 * API for a third-party app to do this silently without a native helper, so
 * real manual steps are shown instead of a fake success message.
 */
async function setDefaultMac(): Promise<SetDefaultPdfResult> {
  const appBundleMatch = process.execPath.match(/^(.*\.app)\//)
  const appBundlePath = appBundleMatch?.[1]
  const lsregister =
    '/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister'

  if (appBundlePath) {
    await execFileAsync(lsregister, ['-f', appBundlePath]).catch(() => {})
  }

  try {
    await execFileAsync('which', ['duti'])
  } catch {
    return {
      status: 'manual',
      message:
        "duti isn't installed (install it with `brew install duti` for one-click default-setting) — " +
        `until then: right-click any PDF in Finder → Get Info → Open with → ${APP_NAME} → "Change All…".`
    }
  }

  try {
    await execFileAsync('duti', ['-s', MAC_BUNDLE_ID, 'com.adobe.pdf', 'all'])
    return { status: 'success', message: `${APP_NAME} is now the default app for PDF files.` }
  } catch (err) {
    return {
      status: 'error',
      message: `duti failed to set the default (${(err as Error).message}) — try Finder's Get Info → Open with → "Change All…" instead.`
    }
  }
}

/**
 * The one platform where this is genuinely fully automatable: no OS-level
 * lockout like Windows/macOS. Relies on electron-builder.yml's
 * fileAssociations (mimeType: application/pdf) generating a proper
 * shared-mime-info registration alongside the .desktop file — this doesn't
 * assume that .desktop file's exact name (which depends on electron-builder
 * internals we can't fully pin down without a real Linux build), instead
 * searching installed .desktop files for whichever one actually launches
 * this executable.
 *
 * Not verified on a real Linux machine — implemented against documented
 * xdg-mime/freedesktop.org conventions, not live-tested.
 */
async function setDefaultLinux(): Promise<SetDefaultPdfResult> {
  try {
    await execFileAsync('which', ['xdg-mime'])
  } catch {
    return {
      status: 'manual',
      message:
        "xdg-mime isn't available — set the default PDF app via your desktop " +
        "environment's Settings → Default Applications instead."
    }
  }

  const desktopFile = await findOwnDesktopFile()
  if (!desktopFile) {
    return {
      status: 'manual',
      message:
        "Could not find this app's installed .desktop file — set the default PDF app " +
        "via your desktop environment's Settings → Default Applications instead."
    }
  }

  try {
    await execFileAsync('xdg-mime', ['default', desktopFile, 'application/pdf'])
    return { status: 'success', message: `Set ${desktopFile} as the default handler for PDFs.` }
  } catch (err) {
    return {
      status: 'error',
      message: `xdg-mime failed (${(err as Error).message}) — set the default via your desktop environment's settings instead.`
    }
  }
}

async function findOwnDesktopFile(): Promise<string | null> {
  const dirs = ['/usr/share/applications', join(app.getPath('home'), '.local/share/applications')]
  const exeBasename = basename(process.execPath)
  for (const dir of dirs) {
    let entries: string[]
    try {
      entries = await readdir(dir)
    } catch {
      continue
    }
    for (const entry of entries) {
      if (!entry.endsWith('.desktop')) continue
      try {
        const content = await readFile(join(dir, entry), 'utf8')
        if (content.includes(exeBasename)) return entry
      } catch {
        continue
      }
    }
  }
  return null
}
