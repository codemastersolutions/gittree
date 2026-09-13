import type { CommitLogEntry, Worktree, WorktreeState } from '@codemastersolutions/gittree-core';
import type { WebviewPanelStub, VsCodeApis, OutputChannelStub } from './extension';

export type WorktreeDetailsInput = {
  readonly worktree: Worktree;
  readonly state?: WorktreeState;
  readonly commits: readonly CommitLogEntry[];
  readonly dirtyFiles: readonly { readonly path: string; readonly status: string }[];
};

export type WorktreeDetailsOutgoing =
  | { readonly type: 'worktreeDetails:loaded'; readonly payload: WorktreeDetailsInput }
  | { readonly type: 'worktreeDetails:loading' }
  | { readonly type: 'worktreeDetails:error'; readonly message: string };

export type WorktreeDetailsIncoming = {
  readonly type: 'worktreeDetails:action';
  readonly action: 'openTerminal' | 'openFolder' | 'refresh';
};

type Action = 'openTerminal' | 'openFolder' | 'refresh';

export class WorktreeDetailsWebView {
  private readonly panel: WebviewPanelStub;
  private currentInput: WorktreeDetailsInput | null = null;
  private disposed = false;

  public static create(
    vscode: VsCodeApis,
    logger: OutputChannelStub,
    onAction: (action: Action) => void,
  ): WorktreeDetailsWebView {
    void logger;
    const panel = vscode.window.createWebviewPanel(
      'gittree.worktreeDetails',
      'Worktree Details',
      1 as unknown,
      { enableScripts: true, retainContextWhenHidden: true },
    );
    return new WorktreeDetailsWebView(panel, onAction);
  }

  private constructor(
    panel: WebviewPanelStub,
    private readonly onAction: (action: Action) => void,
  ) {
    this.panel = panel;
    this.panel.webview.html = buildHtml(this.panel.webview.cspSource);
    this.panel.webview.onDidReceiveMessage((msg: unknown) => {
      const m = msg as WorktreeDetailsIncoming | { type?: unknown; action?: unknown };
      if (
        m &&
        typeof m === 'object' &&
        m.type === 'worktreeDetails:action' &&
        (m.action === 'openTerminal' || m.action === 'openFolder' || m.action === 'refresh')
      ) {
        this.onAction(m.action);
      }
    });
    this.panel.onDidDispose(() => {
      this.disposed = true;
    });
  }

  public showLoading(): void {
    if (this.disposed) return;
    void this.panel.webview.postMessage({ type: 'worktreeDetails:loading' });
  }

  public showError(message: string): void {
    if (this.disposed) return;
    void this.panel.webview.postMessage({ type: 'worktreeDetails:error', message });
  }

  public update(input: WorktreeDetailsInput): void {
    if (this.disposed) return;
    this.currentInput = input;
    void this.panel.webview.postMessage({ type: 'worktreeDetails:loaded', payload: input });
    this.panel.title = 'Worktree: ' + shortBranch(input.worktree);
    this.panel.reveal(undefined, true);
  }

  public latestInput(): WorktreeDetailsInput | null {
    return this.currentInput;
  }

  public reveal(): void {
    if (this.disposed) return;
    this.panel.reveal(undefined, true);
  }

  public isDisposed(): boolean {
    return this.disposed;
  }

  public dispose(): void {
    if (!this.disposed) this.panel.dispose();
  }

  public _panel_unsafe(): WebviewPanelStub {
    return this.panel;
  }
}

function shortBranch(w: Worktree): string {
  const b = w.branch ?? '';
  const slash = b.lastIndexOf('/');
  return slash >= 0 ? b.slice(slash + 1) : b;
}

export function buildHtml(cspSource: string): string {
  const csp = `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src ${cspSource} 'unsafe-inline'; style-src ${cspSource} 'unsafe-inline';">`;
  const html = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8">
${csp}
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>
${cssTokens()}
</style></head><body class="gt-body">
<div id="app" class="gt-container">
  <div id="loading" class="gt-loading">Loading worktree details…</div>
  <div id="error" class="gt-error hidden"></div>
  <div id="content" class="hidden">
    <div class="gt-header">
      <div>
        <div class="gt-title" id="wt_title">—</div>
        <div class="gt-sub" id="wt_sub">—</div>
      </div>
      <div class="gt-actions">
        <button class="gt-btn secondary" data-action="refresh" title="Refresh">⟳ Refresh</button>
        <button class="gt-btn secondary" data-action="openFolder" title="Open Folder">📂 Open</button>
        <button class="gt-btn" data-action="openTerminal" title="Open Terminal">⌨ Terminal</button>
      </div>
    </div>
    <section class="gt-section">
      <h2 class="gt-section-title">Worktree Info</h2>
      <div class="gt-grid">
        <div><div class="gt-k">Path</div><div class="gt-v" id="info_path">—</div></div>
        <div><div class="gt-k">Branch</div><div class="gt-v" id="info_branch">—</div></div>
        <div><div class="gt-k">HEAD</div><div class="gt-v" id="info_head">—</div></div>
        <div><div class="gt-k">Main Worktree?</div><div class="gt-v" id="info_main">—</div></div>
      </div>
    </section>
    <section class="gt-section">
      <h2 class="gt-section-title">State</h2>
      <div class="gt-grid">
        <div><div class="gt-k">Kind</div><div class="gt-v" id="state_kind"><span class="gt-pill clean">—</span></div></div>
        <div><div class="gt-k">Upstream</div><div class="gt-v" id="state_upstream">—</div></div>
        <div><div class="gt-k">Ahead by</div><div class="gt-v" id="state_ahead">0</div></div>
        <div><div class="gt-k">Behind by</div><div class="gt-v" id="state_behind">0</div></div>
        <div><div class="gt-k">Dirty?</div><div class="gt-v" id="state_dirty">—</div></div>
        <div><div class="gt-k">Detached?</div><div class="gt-v" id="state_detached">—</div></div>
      </div>
    </section>
    <section class="gt-section">
      <h2 class="gt-section-title">Modified files</h2>
      <div id="dirty_wrap"><div class="gt-empty">No modified files.</div></div>
    </section>
    <section class="gt-section">
      <h2 class="gt-section-title">Recent commits</h2>
      <div id="commits_wrap"><div class="gt-empty">No commits.</div></div>
    </section>
  </div>
</div>
<script>
${webviewScriptText()}
</script>
</body></html>`;
  return html;
}

function cssTokens(): string {
  return `
.gt-body { margin:0; padding:0; font-family: var(--vscode-font-family,-apple-system,BlinkMacSystemFont,sans-serif); font-size: var(--vscode-font-size,13px); color: var(--vscode-editor-foreground,#cccccc); background: var(--vscode-editor-background,#1e1e1e); }
.gt-container { padding: 16px 20px; box-sizing: border-box; min-height: 100vh; }
.hidden { display: none !important; }
.gt-header { display:flex; align-items:center; justify-content:space-between; margin-bottom: 16px; flex-wrap: wrap; gap: 12px; }
.gt-title { font-size: 16px; font-weight: 600; color: var(--vscode-foreground,#e0e0e0); }
.gt-sub { font-size: 12px; color: var(--vscode-descriptionForeground,#999); margin-top: 2px; }
.gt-actions { display:flex; gap: 8px; flex-wrap: wrap; }
.gt-btn { font-family: inherit; font-size: 12px; padding: 4px 10px; border-radius: 2px; cursor: pointer; color: var(--vscode-button-foreground,#ffffff); background: var(--vscode-button-background,#0e639c); border: 1px solid var(--vscode-button-border,transparent); }
.gt-btn:hover { background: var(--vscode-button-hoverBackground,#1177bb); }
.gt-btn.secondary { background: transparent; color: var(--vscode-button-secondaryForeground,#ffffff); border-color: var(--vscode-button-border,transparent); background: var(--vscode-button-secondaryBackground,#3a3d41); }
.gt-btn.secondary:hover { background: var(--vscode-button-secondaryHoverBackground,#45494e); }
.gt-section { margin: 0 0 18px 0; padding: 12px 14px; border: 1px solid var(--vscode-panel-border,#333); border-radius: 4px; background: var(--vscode-sideBarBackground,#252526); }
.gt-section-title { font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: .04em; color: var(--vscode-descriptionForeground,#aaa); margin: 0 0 10px 0; }
.gt-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 8px 16px; }
.gt-k { color: var(--vscode-descriptionForeground,#999); font-size: 11px; margin-bottom: 2px; }
.gt-v { font-size: 13px; word-break: break-all; }
.gt-pill { display:inline-block; padding: 2px 8px; border-radius: 999px; font-size: 11px; font-weight: 600; letter-spacing:.02em; }
.gt-pill.clean { background: var(--vscode-terminal-ansiGreen,#4ec9b0); color: #000; }
.gt-pill.dirty { background: var(--vscode-terminal-ansiYellow,#dcdcaa); color: #000; }
.gt-pill.ahead { background: var(--vscode-terminal-ansiCyan,#4fc1ff); color: #000; }
.gt-pill.behind { background: var(--vscode-terminal-ansiRed,#f48771); color: #fff; }
.gt-pill.diverged { background: var(--vscode-terminal-ansiMagenta,#c586c0); color: #000; }
.gt-pill.detached { background: var(--vscode-terminal-ansiBlue,#569cd6); color: #fff; }
.gt-table { width:100%; border-collapse: collapse; font-size: 12px; }
.gt-table th { text-align:left; padding: 6px 8px; font-weight:600; color: var(--vscode-descriptionForeground,#aaa); border-bottom: 1px solid var(--vscode-panel-border,#333); font-size: 11px; }
.gt-table td { padding: 6px 8px; border-bottom: 1px solid var(--vscode-panel-border,#222); vertical-align: top; }
.gt-table tr:last-child td { border-bottom: none; }
.gt-commit-hash { font-family: var(--vscode-editor-font-family,ui-monospace,SFMono-Regular,Consolas,monospace); font-size: 12px; color: var(--vscode-terminal-ansiCyan,#4fc1ff); }
.gt-commit-subject { color: var(--vscode-editor-foreground,#ddd); }
.gt-commit-author { color: var(--vscode-descriptionForeground,#999); font-size: 11px; }
.gt-commit-date { color: var(--vscode-descriptionForeground,#999); font-size: 11px; white-space: nowrap; }
.gt-filepath { font-family: var(--vscode-editor-font-family,ui-monospace,SFMono-Regular,Consolas,monospace); font-size: 12px; color: var(--vscode-terminal-ansiGreen,#4ec9b0); word-break: break-all; }
.gt-file-status { font-size: 11px; color: var(--vscode-descriptionForeground,#aaa); white-space: nowrap; }
.gt-empty { padding: 12px; font-style: italic; color: var(--vscode-descriptionForeground,#999); font-size: 12px; }
.gt-loading { padding: 24px; color: var(--vscode-descriptionForeground,#aaa); font-size: 13px; }
.gt-error { padding: 12px 14px; border-radius: 4px; background: var(--vscode-inputValidation-errorBackground,#5a1d1d); color: var(--vscode-inputValidation-errorForeground,#f48771); border: 1px solid var(--vscode-inputValidation-errorBorder,#be1100); font-size: 12px; }
`;
}

function webviewScriptText(): string {
  return `
(function(){
  "use strict";
  var vscode = acquireVsCodeApi();
  function el(id) { return document.getElementById(id); }
  function send(action) { vscode.postMessage({ type: "worktreeDetails:action", action: action }); }
  var buttons = document.querySelectorAll(".gt-btn[data-action]");
  for (var i = 0; i < buttons.length; i++) {
    (function(btn) {
      btn.addEventListener("click", function() { send(btn.getAttribute("data-action")); });
    })(buttons[i]);
  }
  function setLoading() {
    el("loading").classList.remove("hidden");
    el("content").classList.add("hidden");
    el("error").classList.add("hidden");
  }
  function setError(message) {
    var e = el("error");
    e.textContent = message;
    e.classList.remove("hidden");
    el("loading").classList.add("hidden");
    el("content").classList.add("hidden");
  }
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function(c) {
      var map = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
      return map[c] || c;
    });
  }
  function stripRefs(branch) {
    return String(branch || "").replace(/^refs\\/heads\\//, "");
  }
  function render(input) {
    var w = input.worktree;
    el("loading").classList.add("hidden");
    el("error").classList.add("hidden");
    el("content").classList.remove("hidden");
    el("wt_title").textContent = "Worktree — " + (stripRefs(w.branch) || "(no branch)");
    el("wt_sub").textContent = String(w.path || "");
    el("info_path").textContent = String(w.path || "");
    el("info_branch").textContent = stripRefs(w.branch) || "—";
    el("info_head").textContent = String((w.head || "—").slice(0, 12));
    el("info_main").textContent = w.isMain ? "Yes" : "No";
    var st = input.state || { kind: "clean", aheadBy: 0, behindBy: 0, dirty: false, upstream: undefined };
    var pill = el("state_kind").querySelector(".gt-pill");
    if (pill) { pill.className = "gt-pill " + st.kind; pill.textContent = st.kind; }
    el("state_upstream").textContent = st.upstream || "—";
    el("state_ahead").textContent = String(st.aheadBy || 0);
    el("state_behind").textContent = String(st.behindBy || 0);
    el("state_dirty").textContent = st.dirty ? "Yes" : "No";
    el("state_detached").textContent = w.isDetached ? "Yes" : "No";
    var dw = el("dirty_wrap");
    if (!input.dirtyFiles || input.dirtyFiles.length === 0) {
      dw.innerHTML = '<div class="gt-empty">No modified files.</div>';
    } else {
      var rows = "";
      for (var i = 0; i < input.dirtyFiles.length; i++) {
        var f = input.dirtyFiles[i];
        rows += '<tr><td><span class="gt-filepath">' + esc(f.path) + '</span></td>' +
                '<td class="gt-file-status">' + esc(f.status) + '</td></tr>';
      }
      dw.innerHTML =
        '<table class="gt-table"><thead><tr><th>Path</th><th>Status</th></tr></thead><tbody>' +
        rows + "</tbody></table>";
    }
    var cw = el("commits_wrap");
    if (!input.commits || input.commits.length === 0) {
      cw.innerHTML = '<div class="gt-empty">No commits yet.</div>';
    } else {
      var rows2 = "";
      var limit = Math.min(input.commits.length, 10);
      for (var j = 0; j < limit; j++) {
        var c = input.commits[j];
        rows2 += "<tr>" +
          '<td><span class="gt-commit-hash">' + esc(c.hashShort) + "</span></td>" +
          '<td><div class="gt-commit-subject">' + esc(c.subject) + "</div>" +
          '<div class="gt-commit-author">' + esc(c.author) + "</div></td>" +
          '<td class="gt-commit-date">' + esc(c.dateIso) + "</td>" +
          "</tr>";
      }
      cw.innerHTML =
        '<table class="gt-table"><thead><tr><th>Hash</th><th>Message</th><th>Date</th></tr></thead><tbody>' +
        rows2 + "</tbody></table>";
    }
  }
  window.addEventListener("message", function(event) {
    var m = event.data;
    if (!m) return;
    if (m.type === "worktreeDetails:loading") return setLoading();
    if (m.type === "worktreeDetails:error") return setError(m.message || "Unknown error");
    if (m.type === "worktreeDetails:loaded") return render(m.payload);
  });
})();
`;
}

export function dirtyFilesFromStatusText(
  statusText: string,
): readonly { readonly path: string; readonly status: string }[] {
  const lines = statusText.split(/\r?\n/).filter((l) => l.length > 0);
  const out: { path: string; status: string }[] = [];
  const seen = new Set<string>();
  for (const line of lines) {
    if (line.startsWith('#')) continue;
    const trimmed = line.trimEnd();
    if (trimmed.length === 0) continue;
    const fallback = trimmed.split(/\s+/).slice(-1)[0];
    if (fallback && fallback.length > 0 && !seen.has(fallback)) {
      seen.add(fallback);
      out.push({ path: fallback, status: 'Modified' });
    }
  }
  return out;
}

export type { Worktree, WorktreeState, CommitLogEntry };
