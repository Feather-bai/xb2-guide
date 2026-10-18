/* =========================================================================
   跨设备同步：用户自定义 ID + 已完成标记同步
   -------------------------------------------------------------------------
   - 用户在一个输入框里填一个 ID（建议 8~32 位，含字母数字），
     同一 ID 在任何设备上打开本页都会拉到同一份「已完成标记」。
   - 存储：Cloudflare Pages Functions + KV（见仓库根目录 functions/api/sync.js、wrangler.toml、
     DEPLOY.md「跨设备同步（KV 配置）」）。没配置后端时自动降级为「仅本机」，界面上明确提示。
   - 冲突策略：**以最后修改时间为准（last-write-wins）**。
     每次上传都带 revision 时间戳；拉取到更新的一份时，用远端快照**整份替换**本机状态，
     因此「勾选」和「取消勾选」都能同步（纯合并只能加、不能删）。
     多个设备同时改动时，以最后写入的那台为准。
   - 隐私：ID 只是用户自己填的标识，不绑定邮箱/手机号；
     服务器只存「这个 ID 下哪些标记已勾选」与时间戳，不含任何浏览器指纹。
     用户可以随时「清空本机数据」或换一个 ID。
   ========================================================================= */
(function () {
  "use strict";

  var KEY_ID = "x2.sync.id";
  var KEY_REV = "x2.sync.rev";
  var API = "/api/sync";           // 相对路径，由 Worker 提供
  var pushTimer = null;
  var lastError = "";
  var lastSync = 0;
  var busy = 0;                      // 正在进行的同步操作数（用于按钮 loading 态）

  function $(s) { return document.querySelector(s); }
  function ls(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }

  function getUserId() { return (ls(KEY_ID) || "").trim(); }
  function getRev() { return +(ls(KEY_REV) || 0); }
  function setRev(n) { lsSet(KEY_REV, String(n)); }

  function mapApi() { return window.X2Map || null; }

  /** 读取本机已完成标记（由 map.js 提供） */
  function localDone() {
    var M = mapApi();
    return M && M.exportDone ? M.exportDone() : {};
  }
  /** 用远端快照整份替换本机（合并无法表达「取消勾选」） */
  function mergeIntoLocal(obj) {
    var M = mapApi();
    if (!M) return;
    if (M.replaceDone) M.replaceDone(obj);
    else if (M.importDone) M.importDone(obj);
  }

  /** 让当前页面按新的完成状态重绘 */
  function refreshView() {
    if (window.X2App && window.X2App.render) {
      try { window.X2App.render(); } catch (e) {}
    }
  }

  function statusText() {
    var id = getUserId();
    if (!id) return "未设置 ID：标记只保存在本机";
    if (lastError) return "同步失败：" + lastError + "（数据仍安全保存在本机）";
    if (!lastSync) return "已设置 ID「" + id + "」，正在同步…";
    return "已同步 · ID「" + id + "」· " + new Date(lastSync).toLocaleString();
  }

  function renderStatus() {
    var el = $("#syncStatus");
    if (el) {
      el.textContent = statusText();
      el.classList.toggle("is-error", !!lastError && !!getUserId());
    }
    var inp = $("#syncId");
    if (inp && document.activeElement !== inp) inp.value = getUserId();
  }

  function renderBusy() {
    ["#syncSave", "#syncNow"].forEach(function (sel) {
      var b = $(sel);
      if (!b) return;
      b.disabled = busy > 0;
      b.classList.toggle("is-busy", busy > 0);
      if (busy > 0) b.setAttribute("aria-busy", "true"); else b.removeAttribute("aria-busy");
    });
    var st = $("#syncStatus");
    if (st) st.classList.toggle("is-busy", busy > 0);
  }
  function begin() { busy++; renderBusy(); }
  function end() { busy = Math.max(0, busy - 1); renderBusy(); }

  /** 拉取远端数据（若更新则合并进本地） */
  function pull() {
    var id = getUserId();
    if (!id) return Promise.resolve(false);
    begin();
    return fetch(API + "?id=" + encodeURIComponent(id), { cache: "no-store" })
      .then(function (r) { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); })
      .then(function (d) {
        lastError = "";
        lastSync = Date.now();
        if (d && d.done && d.rev && d.rev > getRev()) {
          mergeIntoLocal(d.done);
          setRev(d.rev);
          refreshView();
        }
        renderStatus();
        return true;
      })
      .catch(function (e) {
        lastError = (e && e.message) || "网络错误";
        renderStatus();
        return false;
      })
      .finally(end);
  }

  /** 推送到远端（LWW：带上本机 revision） */
  function push() {
    var id = getUserId();
    if (!id) return Promise.resolve(false);
    var body = { done: localDone(), rev: Math.max(Date.now(), getRev() + 1) };
    begin();
    return fetch(API + "?id=" + encodeURIComponent(id), {
      method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    })
      .then(function (r) { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); })
      .then(function (d) {
        lastError = "";
        lastSync = Date.now();
        if (d && d.rev) setRev(d.rev);
        // 服务器上已有一份更新的数据：拉下来覆盖本机，避免用旧数据把新数据盖掉
        if (d && d.stale && d.done) { mergeIntoLocal(d.done); refreshView(); }
        renderStatus();
        return true;
      })
      .catch(function (e) {
        lastError = (e && e.message) || "网络错误";
        renderStatus();
        return false;
      })
      .finally(end);
  }

  function schedulePush() {
    if (!getUserId()) return;
    clearTimeout(pushTimer);
    pushTimer = setTimeout(push, 900);   // 防抖：连续勾选只推一次
  }

  /* 暴露给 map.js 调用 */
  window.X2Sync = {
    schedulePush: schedulePush,
    pull: pull,
    push: push,
    status: statusText,
    renderStatus: renderStatus,
  };

  /* ---- 设置界面 ---- */
  function ensurePanel() {
    if ($("#syncPanel")) return;
    var wrap = document.createElement("div");
    wrap.id = "syncPanel";
    wrap.className = "sync-panel";
    wrap.innerHTML =
      '<div class="sync-head"><strong>跨设备同步</strong>' +
        '<button id="syncClose" type="button" class="icon-btn sync-close" aria-label="关闭同步面板">' +
          '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg></button></div>' +
      '<div class="sync-row"><label for="syncId">用户 ID</label>' +
        '<input id="syncId" type="text" maxlength="32" placeholder="例如 my-blade-001" autocomplete="off" spellcheck="false">' +
        '<button id="syncSave" type="button" class="btn primary">保存并同步</button>' +
      "</div>" +
      '<p class="sync-note">同一 ID 在不同设备登录即可共享「已完成标记」。ID 可自定义，无需注册；' +
        '冲突时以最后修改时间为准。服务器只保存「哪些标记已勾选」与时间戳，不收集任何设备信息。</p>' +
      '<div class="sync-row"><span id="syncStatus" class="sync-status" role="status" aria-live="polite"></span>' +
        '<button id="syncNow" type="button" class="btn">立即同步</button>' +
        '<button id="syncClear" type="button" class="btn danger">清空本机标记</button></div>';
    document.body.appendChild(wrap);

    $("#syncClose").addEventListener("click", close);

    $("#syncSave").addEventListener("click", function () {
      var v = ($("#syncId").value || "").trim();
      if (v && !/^[A-Za-z0-9_-]{3,32}$/.test(v)) {
        lastError = "ID 只能用字母、数字、下划线或连字符（3~32 位）";
        renderStatus(); return;
      }
      lsSet(KEY_ID, v);
      lastError = "";
      if (!v) { renderStatus(); return; }
      pull().then(function (ok) { if (ok) push(); });
    });
    $("#syncNow").addEventListener("click", function () { pull().then(function (ok) { if (ok) push(); }); });
    $("#syncClear").addEventListener("click", function () {
      if (!confirm("清空本机的「已完成标记」？这个操作不会自动同步到其它设备。")) return;
      try { localStorage.removeItem("x2.map.done"); } catch (e) {}
      var M = mapApi(); if (M && M.importDone) { try { M.importDone({}); } catch (e) {} }
      renderStatus();
      if (window.X2App && window.X2App.render) window.X2App.render();
    });
    renderStatus();
  }

  /* 入口：URL 带 #/sync 或用户点「同步」按钮时打开 */
  function open() { ensurePanel(); $("#syncPanel").classList.add("open"); }
  function close() { var p = $("#syncPanel"); if (p) p.classList.remove("open"); }
  window.X2Sync.open = open;
  window.X2Sync.close = close;

  /* 启动时：如果已经设过 ID，静默拉取一次 */
  document.addEventListener("DOMContentLoaded", function () {
    ensurePanel();
    var btn = $("#syncBtn");
    if (btn) btn.addEventListener("click", function () {
      var p = $("#syncPanel");
      if (p.classList.contains("open")) close(); else open();
    });
    // 点面板外部 / 按 Esc 也能关（输入框留空时同样有效）
    document.addEventListener("click", function (e) {
      var p = $("#syncPanel");
      if (!p || !p.classList.contains("open")) return;
      if (p.contains(e.target)) return;
      if (e.target.closest && e.target.closest("#syncBtn")) return;
      close();
    });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape") {
        var p = $("#syncPanel");
        if (p && p.classList.contains("open")) { close(); return; }
      }
    });
    if (getUserId()) pull();
  });
})();
