import * as vscode from "vscode";

// ── Helpers ────────────────────────────────────────────────────────────────

function getApiUrl(): string {
  return vscode.workspace
    .getConfiguration("queryPro")
    .get<string>("apiUrl", "http://localhost:8000");
}

function getDefaultDialect(): string {
  return vscode.workspace
    .getConfiguration("queryPro")
    .get<string>("defaultDialect", "postgresql");
}

// ── Webview panel ──────────────────────────────────────────────────────────

let panel: vscode.WebviewPanel | undefined;

function openWorkspace(context: vscode.ExtensionContext, prefillPrompt?: string) {
  const apiUrl = getApiUrl();

  if (panel) {
    panel.reveal(vscode.ViewColumn.Beside);
    if (prefillPrompt) {
      panel.webview.postMessage({ type: "prefill", prompt: prefillPrompt });
    }
    return;
  }

  panel = vscode.window.createWebviewPanel(
    "queryPro",
    "Query Pro",
    vscode.ViewColumn.Beside,
    {
      enableScripts: true,
      retainContextWhenHidden: true,
    }
  );

  panel.webview.html = buildWebviewHtml(panel.webview, apiUrl);

  // Forward messages from the webview to VS Code
  panel.webview.onDidReceiveMessage(
    (message: { type: string; sql?: string }) => {
      if (message.type === "insertSql" && message.sql) {
        const editor = vscode.window.activeTextEditor;
        if (editor) {
          editor.edit((editBuilder) => {
            editBuilder.insert(editor.selection.active, message.sql!);
          });
          vscode.window.showInformationMessage("SQL inserted into editor.");
        }
      }
    },
    undefined,
    context.subscriptions
  );

  panel.onDidDispose(() => { panel = undefined; }, null, context.subscriptions);

  if (prefillPrompt) {
    // Small delay so the webview finishes loading before we post
    setTimeout(() => {
      panel?.webview.postMessage({ type: "prefill", prompt: prefillPrompt });
    }, 1500);
  }
}

// ── Webview HTML ───────────────────────────────────────────────────────────
// Embeds the running Query Pro web app in an <iframe> and provides a thin
// bridge for insert-SQL messages. If the user is not running the dev server,
// they see a clear "Start the server" message.

function buildWebviewHtml(_webview: vscode.Webview, apiUrl: string): string {
  const appUrl = apiUrl.replace(":8000", ":5173"); // Vite dev server default

  return /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Query Pro</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body { height: 100%; background: #1e1e1e; color: #d4d4d4; font-family: system-ui, sans-serif; }
    #frame { width: 100%; height: calc(100vh - 48px); border: none; }
    #toolbar {
      height: 48px; display: flex; align-items: center; gap: 8px;
      padding: 0 12px; background: #252526; border-bottom: 1px solid #2a2d2e;
    }
    #toolbar span { font-size: 12px; color: #8b949e; flex: 1; }
    #insert-btn {
      font-size: 11px; padding: 4px 10px; border-radius: 6px;
      border: 1px solid #2a2d2e; background: #1e1e1e; color: #9cdcfe;
      cursor: pointer;
    }
    #insert-btn:hover { border-color: #007acc; }
    #error {
      display: none; padding: 32px; text-align: center;
      font-size: 13px; color: #f48771;
    }
    #error code { display: block; margin-top: 8px; font-family: monospace; color: #8b949e; font-size: 11px; }
  </style>
</head>
<body>
  <div id="toolbar">
    <span>Query Pro — <a href="${appUrl}" style="color:#569cd6">${appUrl}</a></span>
    <button id="insert-btn" title="Insert last generated SQL into the active editor">Insert SQL</button>
  </div>

  <iframe
    id="frame"
    src="${appUrl}"
    allow="microphone"
    onerror="showError()"
  ></iframe>

  <div id="error">
    Query Pro web app is not running.
    <code>cd apps/web &amp;&amp; npm run dev</code>
  </div>

  <script>
    const vscode = acquireVsCodeApi();
    const frame = document.getElementById('frame');
    let lastSql = '';

    // Listen for prefill messages from the extension host
    window.addEventListener('message', (event) => {
      const msg = event.data;
      if (!msg) return;
      // From extension host → forward into iframe
      if (msg.type === 'prefill') {
        frame.contentWindow?.postMessage(msg, '*');
      }
      // From iframe → intercept SQL
      if (msg.type === 'querypro:sql') {
        lastSql = msg.sql;
      }
    });

    document.getElementById('insert-btn').addEventListener('click', () => {
      if (lastSql) {
        vscode.postMessage({ type: 'insertSql', sql: lastSql });
      } else {
        // Ask the iframe for its current SQL
        frame.contentWindow?.postMessage({ type: 'querypro:requestSql' }, '*');
        setTimeout(() => {
          if (lastSql) vscode.postMessage({ type: 'insertSql', sql: lastSql });
        }, 300);
      }
    });

    frame.addEventListener('error', () => {
      frame.style.display = 'none';
      document.getElementById('error').style.display = 'block';
    });
  </script>
</body>
</html>`;
}

// ── Activation ─────────────────────────────────────────────────────────────

export function activate(context: vscode.ExtensionContext) {
  context.subscriptions.push(
    vscode.commands.registerCommand("queryPro.open", () => {
      openWorkspace(context);
    }),

    vscode.commands.registerCommand("queryPro.generateFromSelection", () => {
      const editor = vscode.window.activeTextEditor;
      const selection = editor?.selection;
      const text = editor?.document.getText(selection).trim();
      openWorkspace(context, text || undefined);
    })
  );
}

export function deactivate() {
  panel?.dispose();
}
