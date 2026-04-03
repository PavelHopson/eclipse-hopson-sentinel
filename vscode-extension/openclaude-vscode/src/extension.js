const vscode = require('vscode');
const crypto = require('crypto');
const { exec } = require('child_process');
const { promisify } = require('util');

const execAsync = promisify(exec);
const REPO_URL = 'https://github.com/PavelHopson/eclipse-hopson-sentinel';

async function isCommandAvailable(command) {
  try {
    if (!command) {
      return false;
    }

    if (process.platform === 'win32') {
      await execAsync(`where ${command}`);
    } else {
      await execAsync(`command -v ${command}`);
    }

    return true;
  } catch {
    return false;
  }
}

function getExecutableFromCommand(command) {
  return command.trim().split(/\s+/)[0];
}

async function launchSentinel() {
  const configured = vscode.workspace.getConfiguration('sentinel');
  const launchCommand = configured.get('launchCommand', 'sentinel');
  const terminalName = configured.get('terminalName', 'Sentinel');
  const shimEnabled = configured.get('useOpenAIShim', false);
  const executable = getExecutableFromCommand(launchCommand);
  const installed = await isCommandAvailable(executable);

  if (!installed) {
    const action = await vscode.window.showErrorMessage(
      `Sentinel command not found: ${executable}. Install it with: npm install -g @eclipse-hopson/sentinel`,
      'Open Repository'
    );

    if (action === 'Open Repository') {
      await vscode.env.openExternal(vscode.Uri.parse(REPO_URL));
    }

    return;
  }

  const env = {};
  if (shimEnabled) {
    env.CLAUDE_CODE_USE_OPENAI = '1';
  }

  const terminal = vscode.window.createTerminal({
    name: terminalName,
    env,
  });

  terminal.show(true);
  terminal.sendText(launchCommand, true);
}

class SentinelControlCenterProvider {
  async resolveWebviewView(webviewView) {
    webviewView.webview.options = { enableScripts: true };
    const configured = vscode.workspace.getConfiguration('sentinel');
    const launchCommand = configured.get('launchCommand', 'sentinel');
    const executable = getExecutableFromCommand(launchCommand);
    const installed = await isCommandAvailable(executable);
    const shimEnabled = configured.get('useOpenAIShim', false);
    const shortcut = process.platform === 'darwin' ? 'Cmd+Shift+P' : 'Ctrl+Shift+P';

    webviewView.webview.html = this.getHtml({
      installed,
      shimEnabled,
      shortcut,
      executable,
    });

    webviewView.webview.onDidReceiveMessage(async (message) => {
      if (message?.type === 'launch') {
        await launchSentinel();
        return;
      }

      if (message?.type === 'docs') {
        await vscode.env.openExternal(vscode.Uri.parse(REPO_URL));
        return;
      }

      if (message?.type === 'commands') {
        await vscode.commands.executeCommand('workbench.action.showCommands');
      }
    });
  }

  getHtml(status) {
    const nonce = crypto.randomBytes(16).toString('base64');
    const runtimeLabel = status.installed ? 'available' : 'missing';
    const shimLabel = status.shimEnabled ? 'enabled (CLAUDE_CODE_USE_OPENAI=1)' : 'disabled';

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <style>
    :root {
      --pc-bg-1: #081018;
      --pc-bg-2: #0e1b29;
      --pc-line: #2f4d63;
      --pc-accent: #7fffd4;
      --pc-accent-dim: #4db89a;
      --pc-text-dim: #94a7b5;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: "Cascadia Code", "JetBrains Mono", Consolas, monospace;
      color: var(--vscode-foreground);
      background:
        radial-gradient(circle at 85% -10%, color-mix(in srgb, var(--pc-accent) 16%, transparent), transparent 45%),
        linear-gradient(165deg, var(--pc-bg-1), var(--pc-bg-2));
      padding: 14px;
      min-height: 100vh;
      line-height: 1.45;
      overflow-x: hidden;
    }
    .panel {
      border: 1px solid color-mix(in srgb, var(--pc-line) 80%, var(--vscode-editorWidget-border));
      border-radius: 10px;
      background: color-mix(in srgb, var(--pc-bg-1) 78%, var(--vscode-sideBar-background));
      box-shadow: 0 10px 24px rgba(0, 0, 0, 0.35);
      overflow: hidden;
    }
    .topbar {
      padding: 8px 10px;
      font-size: 10px;
      text-transform: uppercase;
      color: var(--pc-text-dim);
      border-bottom: 1px solid var(--pc-line);
      background: color-mix(in srgb, var(--pc-bg-2) 74%, black);
      display: flex;
      justify-content: space-between;
    }
    .content {
      padding: 12px;
      display: grid;
      gap: 14px;
    }
    .title {
      color: var(--pc-accent);
      font-size: 14px;
      font-weight: 700;
      margin-bottom: 4px;
    }
    .sub {
      color: var(--pc-text-dim);
      font-size: 11px;
    }
    .terminal-box {
      border: 1px dashed color-mix(in srgb, var(--pc-line) 78%, white);
      border-radius: 8px;
      padding: 10px;
      background: color-mix(in srgb, var(--pc-bg-2) 78%, black);
      font-size: 11px;
      display: grid;
      gap: 6px;
    }
    .terminal-row {
      color: var(--pc-text-dim);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .prompt { color: var(--pc-accent); }
    .actions {
      display: grid;
      gap: 8px;
    }
    .btn {
      width: 100%;
      border: 1px solid var(--pc-line);
      border-radius: 7px;
      padding: 10px;
      cursor: pointer;
      text-align: left;
      font-family: inherit;
      font-size: 11px;
      text-transform: uppercase;
      background: color-mix(in srgb, var(--pc-bg-2) 82%, black);
      color: var(--vscode-foreground);
    }
    .btn:hover {
      border-color: var(--pc-accent-dim);
      background: color-mix(in srgb, var(--pc-bg-2) 68%, #113642);
    }
    .btn.primary {
      border-color: color-mix(in srgb, var(--pc-accent) 50%, var(--pc-line));
    }
    .hint {
      font-size: 10px;
      color: var(--pc-text-dim);
      border-top: 1px solid var(--pc-line);
      padding-top: 10px;
    }
    .hint code {
      color: var(--pc-accent);
      background: rgba(0, 0, 0, 0.26);
      padding: 2px 5px;
      border-radius: 4px;
    }
  </style>
</head>
<body>
  <div class="panel">
    <div class="topbar">
      <span>sentinel control center</span>
      <span>online</span>
    </div>
    <div class="content">
      <div>
        <div class="title">SENTINEL READY</div>
        <div class="sub">Terminal-first launcher inside VS Code.</div>
      </div>
      <div class="terminal-box">
        <div class="terminal-row"><span class="prompt">$</span> sentinel --status</div>
        <div class="terminal-row">runtime: ${runtimeLabel}</div>
        <div class="terminal-row">shim: ${shimLabel}</div>
        <div class="terminal-row">command: ${status.executable}</div>
      </div>
      <div class="actions">
        <button class="btn primary" id="launch">Launch Sentinel</button>
        <button class="btn" id="docs">Open Repository</button>
        <button class="btn" id="commands">Open Command Palette</button>
      </div>
      <div class="hint">
        Quick trigger: use <code>${status.shortcut}</code> and run Sentinel from anywhere.
      </div>
    </div>
  </div>
  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    document.getElementById('launch').addEventListener('click', () => vscode.postMessage({ type: 'launch' }));
    document.getElementById('docs').addEventListener('click', () => vscode.postMessage({ type: 'docs' }));
    document.getElementById('commands').addEventListener('click', () => vscode.postMessage({ type: 'commands' }));
  </script>
</body>
</html>`;
  }
}

function activate(context) {
  const startCommand = vscode.commands.registerCommand('sentinel.start', async () => {
    await launchSentinel();
  });

  const openDocsCommand = vscode.commands.registerCommand('sentinel.openDocs', async () => {
    await vscode.env.openExternal(vscode.Uri.parse(REPO_URL));
  });

  const openUiCommand = vscode.commands.registerCommand('sentinel.openControlCenter', async () => {
    await vscode.commands.executeCommand('workbench.view.extension.sentinel');
  });

  const provider = new SentinelControlCenterProvider();
  const providerDisposable = vscode.window.registerWebviewViewProvider('sentinel.controlCenter', provider);

  context.subscriptions.push(startCommand, openDocsCommand, openUiCommand, providerDisposable);
}

function deactivate() {}

module.exports = {
  activate,
  deactivate,
};
