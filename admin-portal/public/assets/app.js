/* Baza-RMB admin portal: single-page app matching the Figma "RMB-AI" prototype (Admin flow).
 * Talks only to its own server (/portal/*, /api/* proxy). The admin API key never reaches the browser.
 * Icons: Heroicons v2 outline (window.hi). Every number shown comes from real data. */
(() => {
  "use strict";

  // ---------------------------------------------------------------- helpers
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({"&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"}[c]));
  const S = {me: null, days: 30, prefill: null, timers: [], convOpen: false};
  const can = (cap) => S.me && S.me.caps.includes(cap);
  const view = () => $("#view");
  const ic = (n, s = 20, sw = 1.5) => window.hi(n, s, sw);

  function toast(msg, ms = 3500) {
    const t = $("#toast"); t.hidden = true; void t.offsetWidth; t.textContent = msg; t.hidden = false;
    clearTimeout(t._h); t._h = setTimeout(() => { t.hidden = true; }, ms);
  }

  async function call(url, opts = {}) {
    const headers = {Accept: "application/json", ...(opts.headers || {})};
    if (opts.method && opts.method !== "GET") headers["X-CSRF-Token"] = S.me ? S.me.csrf : "";
    if (opts.json !== undefined) { headers["Content-Type"] = "application/json"; opts.body = JSON.stringify(opts.json); }
    const r = await fetch(url, {...opts, headers, credentials: "same-origin"});
    if (r.status === 401) { location.href = "/login"; throw new Error("logged out"); }
    const j = await r.json().catch(() => null);
    if (!r.ok) {
      const d = j && j.detail;
      const msg = typeof d === "string" ? d : Array.isArray(d) ? d.map((x) => x.msg).join("; ") : `Error ${r.status}`;
      toast(msg, 5000);
      throw new Error(msg);
    }
    return j;
  }
  const api = (path, opts) => call("/api/" + path, opts);

  // Translation (i18n.js): T("English text", {n: 3}) returns the text in the chosen language.
  const T = (s, vars) => (window.I18N ? window.I18N.t(s, vars) : String(s).replace(/\{(\w+)\}/g, (m, k) => (vars && k in vars ? vars[k] : m)));
  const LOC = window.I18N ? window.I18N.locale : "en-GB";
  const initials = (n) => String(n || "?").split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join("");
  const avatarClass = (n) => "c" + ((String(n).split("").reduce((a, c) => a + c.charCodeAt(0), 0) % 6) + 1);
  const pct = (v) => (v == null ? "–" : (Math.round(v * 1000) / 10) + "%");
  const num = (v) => (v == null ? "–" : Number(v).toLocaleString(LOC));
  const secs = (ms) => (ms == null ? "–" : (ms / 1000).toFixed(1) + "s");
  const date = (d) => (d ? new Date(d).toLocaleDateString(LOC, {day: "2-digit", month: "short", year: "numeric"}) : "–");
  function rel(d) {
    if (!d) return "–";
    const s = (Date.now() - new Date(d).getTime()) / 1000;
    if (s < 60) return T("just now");
    if (s < 3600) return T("{n} mins ago", {n: Math.round(s / 60)});
    if (s < 86400) return T("{n} hours ago", {n: Math.round(s / 3600)});
    if (s < 172800) return T("Yesterday");
    return date(d);
  }
  function stamp(d) {
    const t = new Date(d), today = new Date(), y = new Date(Date.now() - 864e5);
    const hm = t.toLocaleTimeString(LOC, {hour: "2-digit", minute: "2-digit"});
    if (t.toDateString() === today.toDateString()) return T("Today, {t}", {t: hm});
    if (t.toDateString() === y.toDateString()) return T("Yesterday, {t}", {t: hm});
    return `${t.toLocaleDateString(LOC, {day: "2-digit", month: "short"})}, ${hm}`;
  }

  const ask = (text) => confirmBox("Please confirm", text, "Confirm", true);
  /** Confirmation dialog (instead of the browser's confirm()). Resolves true when confirmed. */
  function confirmBox(title, text, okLabel = "Confirm", danger = false) {
    modal(`<h2>${esc(T(title))}</h2><p class="muted">${esc(T(text))}</p>
      <div class="modal-actions"><button type="button" class="btn" id="cbNo">${esc(T("Cancel"))}</button>
      <button type="button" class="btn ${danger ? "danger-solid" : "primary"}" id="cbYes">${esc(T(okLabel))}</button></div>`);
    return new Promise((resolve) => {
      $("#cbYes").addEventListener("click", () => { closeModal(); resolve(true); });
      $("#cbNo").addEventListener("click", () => { closeModal(); resolve(false); });
      $("#modal")._onClose = () => resolve(false);
    });
  }

  function csv(filename, rows) {
    if (!rows.length) { toast("Nothing to export"); return; }
    const cols = Object.keys(rows[0]);
    const q = (v) => `"${String(v == null ? "" : typeof v === "object" ? JSON.stringify(v) : v).replace(/"/g, '""')}"`;
    const text = [cols.join(","), ...rows.map((r) => cols.map((c) => q(r[c])).join(","))].join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob(["﻿" + text], {type: "text/csv;charset=utf-8"}));
    a.download = filename; a.click(); URL.revokeObjectURL(a.href);
  }

  /** Count numbers up from 0 for elements with data-count (respects reduced motion). */
  function countUp(root) {
    const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
    $$("[data-count]", root).forEach((el) => {
      const target = parseFloat(el.dataset.count), dec = +(el.dataset.dec || 0), suf = el.dataset.suffix || "";
      if (!isFinite(target) || reduce) return;
      const t0 = performance.now(), dur = 900;
      const step = (t) => {
        const k = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - k, 3), v = target * e;
        el.textContent = (dec ? v.toFixed(dec) : Math.round(v).toLocaleString("en")) + suf;
        if (k < 1) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    });
  }
  const cnum = (v, suf = "", dec = 0) => v == null ? "–" : `<span data-count="${v}" data-dec="${dec}" data-suffix="${suf}">${dec ? Number(v).toFixed(dec) : num(v)}${suf}</span>`;
  const cpct = (v) => v == null ? "–" : cnum(Math.round(v * 1000) / 10, "%", 1);
  const csec = (ms) => ms == null ? "–" : cnum(ms / 1000, "s", 1);

  // ---------------------------------------------------------------- domain labels
  const CAT = {
    licensing: ["Mining Licenses", "Artisanal, Small & Large Scale Concessions, Exploration renewals", "#016191"],
    investment: ["Investment & FDI", "Smelting incentives, Special Economic Zones, Foreign Cap repatriation", "#4b5f7f"],
    mineral_trading: ["Mineral Trading & ICGLR", "3T Tagging, Chain-of-Custody, Export Permits, Conflict-Free Seals", "#1e293b"],
    taxation: ["Taxes & Royalties", "Mining royalty, export tax, declaration and payment", "#f59e0b"],
    environment: ["Environmental Compliance", "REMA Environmental Audits, Rehabilitation, Tailings", "#10b981"],
    health_safety: ["Health & Safety", "Underground shaft ventilation, PPE compliance, accident protocols", "#f59e0b"],
    geology: ["Geological Data & GIS", "Subsurface core library, aeromagnetic surveys, lithium pegmatite maps", "#6366f1"],
    petroleum_gas: ["Petroleum & Gas", "Exploration and production licences, Lake Kivu basin", "#0097d8"],
    asm: ["Artisanal Mining", "Cooperatives, small-scale miners", "#9a3412"],
    complaints: ["Complaints & Warden Dispatch", "Illegal river dredging, unpermitted concessions, child labor alerts", "#ba1a1a"],
    general: ["General & Trade Delegations", "University research permits, press office queries, diplomatic visits", "#707880"],
  };
  const catLabel = (c) => (CAT[c] ? CAT[c][0] : c || "–");
  const catColor = (c) => (CAT[c] ? CAT[c][2] : "#707880");
  const catPill = (c) => `<span class="pill ${c === "complaints" ? "red" : c === "investment" ? "blue" : c === "general" ? "" : c === "geology" ? "purple" : "green"}">${esc(catLabel(c).replace(" & ICGLR", "").replace(" & Warden Dispatch", ""))}</span>`;
  const STATUS = {new: "New", assigned: "Assigned", in_progress: "In progress", waiting_for_user: "Waiting for user", resolved: "Resolved", closed: "Closed"};
  const CASE_TYPE = {grievance: "Grievance", illegal_mining_report: "Illegal mining report", meeting_request: "Meeting request",
    geodata_request: "Geological data", licence_status: "Licence status", legal_question: "Legal question", general_enquiry: "General enquiry"};
  const GAP_REASON = {not_covered: "Not in the documents", low_confidence: "Unsure match", error: "Technical error"};
  const priPill = (p) => `<span class="pill ${p === "urgent" ? "red" : p === "high" ? "amber" : ""}">${esc(p)}</span>`;
  const relPill = (r) => `<span class="pill ${r === "relevant" ? "green" : r === "spam" ? "red" : "amber"}">${esc(r)}</span>`;
  const docStatusPill = (d) => {
    const p = d.processing_status;
    if (p === "pending" || p === "processing") return `<span class="pill amber dot">Processing</span>`;
    if (p === "failed") return `<span class="pill red dot" title="${esc(d.processing_error)}">Failed</span>`;
    if (d.status === "retired") return `<span class="pill dot">Retired</span>`;
    if (d.status === "draft") return `<span class="pill amber dot">Draft, not used</span>`;
    if (p === "needs_review") return `<span class="pill amber dot" title="${esc(d.processing_error)}">Active, needs review</span>`;
    return `<span class="pill green dot">Indexed &amp; Active</span>`;
  };

  // Conversation sub-pages (Figma: Mining Licenses / Investment / Complaints / Other Inquiries)
  const SUBPAGES = [
    {id: "licensing", label: "Mining Licenses", cats: ["licensing", "asm"]},
    {id: "investment", label: "Investment", cats: ["investment", "petroleum_gas", "geology"]},
    {id: "complaints", label: "Complaints", cats: ["complaints"]},
    {id: "other", label: "Other Inquiries", cats: ["general", "mineral_trading", "taxation", "environment", "health_safety"]},
  ];

  const ROUTES = [
    {id: "dashboard", label: "Dashboard", icon: "squares-2x2", cap: "dashboard", render: dashboard},
    {id: "conversations", label: "Conversations", icon: "chat-bubble-left-right", cap: "conversations", render: conversations, sub: true},
    {id: "cases", label: "Cases", icon: "briefcase", cap: "cases_read", render: cases, count: "cases"},
    {id: "gaps", label: "Knowledge gaps", icon: "question-mark-circle", cap: "gaps_read", render: gaps, count: "gaps"},
    {id: "faq", label: "FAQ answers", icon: "chat-bubble-bottom-center-text", cap: "faq_read", render: faq},
    {id: "knowledge", label: "AI Knowledge", icon: "book-open", cap: "documents_read", render: knowledge, sepBefore: true},
    {id: "analytics", label: "Analytics", icon: "chart-bar", cap: "dashboard", render: analytics},
    {id: "users", label: "Users & Roles", icon: "users", cap: "users_manage", render: users},
    {id: "settings", label: "Settings", icon: "cog-6-tooth", cap: "settings_read", render: settings},
    {id: "audit", label: "Audit log", icon: "shield-check", cap: "audit_read", render: audit},
  ];

  // ---------------------------------------------------------------- layout pieces
  function renderNav(active, sub) {
    $("#nav").innerHTML = ROUTES.filter((r) => can(r.cap)).map((r) => {
      const on = r.id === active;
      let html = `${r.sepBefore ? '<div class="sep"></div>' : ""}<a href="#/${r.id}" class="${on ? "on" : ""} ${r.sub && S.convOpen ? "open" : ""}" data-route="${r.id}">
        ${ic(r.icon, 20)}<span>${T(r.label)}</span>${r.sub ? `<span class="chev">${ic("chevron-down", 14, 2)}</span>` : ""}
        ${r.count && S.badge && S.badge[r.count] ? `<span class="count">${S.badge[r.count] > 99 ? "99+" : S.badge[r.count]}</span>` : ""}</a>`;
      if (r.sub) {
        html += `<div class="sub ${S.convOpen ? "open" : ""}">${SUBPAGES.map((p) =>
          `<a href="#/conversations/${p.id}" class="${on && sub === p.id ? "on" : ""}">${p.label}</a>`).join("")}</div>`;
      }
      return html;
    }).join("");
    const conv = $('#nav a[data-route="conversations"]');
    if (conv) conv.addEventListener("click", (e) => {
      if (location.hash === "#/conversations") { e.preventDefault(); S.convOpen = !S.convOpen; renderNav(active, sub); }
      else S.convOpen = true;
    });
  }

  function head(title, sub, actions = "") {
    return `<div class="page-head"><div><h1>${esc(title)}</h1><p>${sub}</p></div><div class="actions">${actions}</div></div>`;
  }
  const periodSelect = () => `<label class="select-btn"><span class="ico-l">${ic("calendar", 16)}</span><select id="period" aria-label="Period">${[[7, "Last 7 Days"], [30, "Last 30 Days"], [90, "Last 3 Months"], [365, "Last 12 Months"]]
    .map(([d, l]) => `<option value="${d}" ${S.days === d ? "selected" : ""}>${l}</option>`).join("")}</select><span class="ico-r">${ic("chevron-down", 14, 2)}</span></label>`;
  const exportBtn = () => `<button class="btn primary" id="export">Export ${ic("chevron-down", 14, 2)}</button>`;
  function bindPeriod(rerender) {
    const p = $("#period");
    if (p) p.addEventListener("change", () => { S.days = +p.value; rerender(); });
  }
  const stat = (label, value, foot = "") => `<div class="card stat"><div class="label">${label}</div><div class="value">${value}</div><div class="foot">${foot}</div></div>`;

  function drawer(html) { $("#drawerBody").innerHTML = html; $("#drawer").hidden = false; $("#drawerClose").focus(); }
  function closeDrawer() { $("#drawer").hidden = true; }
  function modal(html, cls = "") {
    const m = $("#modal");
    m._onClose = null;
    $("#modalBody").className = "modal-card " + cls;
    $("#modalBody").innerHTML = html; m.hidden = false;
    const f = $("#modalBody input,#modalBody textarea,#modalBody button:not(.close)"); if (f) f.focus();
  }
  function closeModal() {
    const m = $("#modal"), cb = m._onClose;
    m._onClose = null; m.hidden = true;
    if (cb) cb();
  }

  function pager(total, page, size, onGo, label = "live indexed threads") {
    const pages = Math.max(1, Math.ceil(total / size));
    const nums = [];
    for (let i = 0; i < pages; i++) if (i < 3 || i === pages - 1 || Math.abs(i - page) <= 1) nums.push(i);
    let last = -1, btns = "";
    nums.forEach((i) => { if (i - last > 1) btns += '<span class="muted">…</span>'; btns += `<button data-p="${i}" class="${i === page ? "on" : ""}">${i + 1}</button>`; last = i; });
    const html = `<div class="pager"><span>Showing <b>${total ? page * size + 1 : 0}-${Math.min(total, (page + 1) * size)}</b> of <b>${num(total)}</b> ${label}</span>
      <span class="pages"><button data-p="${page - 1}" ${page ? "" : "disabled"} aria-label="Previous">${ic("chevron-left", 14, 2)}</button>${btns}
      <button data-p="${page + 1}" ${page + 1 < pages ? "" : "disabled"} aria-label="Next">${ic("chevron-right", 14, 2)}</button></span></div>`;
    return {html, bind: (root) => $$(".pages button[data-p]", root).forEach((b) => b.addEventListener("click", () => { if (!b.disabled) onGo(+b.dataset.p); }))};
  }

  // ---------------------------------------------------------------- time series
  function series(daily, days, mode) {
    const byDay = {};
    daily.forEach((d) => { byDay[d.day] = d; });
    const pts = [];
    for (let i = days - 1; i >= 0; i--) {
      const dt = new Date(Date.now() - i * 864e5), key = dt.toISOString().slice(0, 10), d = byDay[key] || {};
      pts.push({dt, conversations: d.conversations || 0, questions: d.questions || 0});
    }
    if (mode === "daily") return pts.map((p) => ({label: p.dt.toLocaleDateString(LOC, {day: "2-digit", month: "short"}), ...p}));
    const groups = new Map();
    pts.forEach((p) => {
      let key, label;
      if (mode === "weekly") {
        const m = new Date(p.dt); m.setDate(m.getDate() - ((m.getDay() + 6) % 7));
        key = m.toISOString().slice(0, 10); label = m.toLocaleDateString(LOC, {month: "short", day: "2-digit"});
      } else { key = p.dt.toISOString().slice(0, 7); label = p.dt.toLocaleDateString(LOC, {month: "short", year: "2-digit"}); }
      const g = groups.get(key) || {label, conversations: 0, questions: 0};
      g.conversations += p.conversations; g.questions += p.questions; groups.set(key, g);
    });
    return [...groups.values()];
  }

  function trendPanel(id, title, sub, legend = ["Total Conversations", "Questions asked"]) {
    return `<div class="panel"><div class="panel-head"><div><h2 class="sm">${title}</h2><p class="sub">${sub}</p></div>
      <div class="seg" id="${id}Seg"><button data-m="daily">Daily</button><button data-m="weekly">Weekly</button><button data-m="monthly">Monthly</button></div></div>
      <div class="legend"><span><i style="background:#016191"></i>${legend[0]}</span><span><i class="dash"></i>${legend[1]}</span></div>
      <div class="chart" id="${id}"></div></div>`;
  }
  function drawTrend(id, daily) {
    const draw = (mode) => {
      const pts = series(daily, S.days, mode);
      Charts.area($("#" + id), pts.map((p) => p.label), [
        {name: "conversations", color: "#016191", values: pts.map((p) => p.conversations)},
        {name: "questions", color: "#1e293b", values: pts.map((p) => p.questions), dashed: true, fill: false},
      ], {label: "Conversations over time"});
    };
    const seg = $("#" + id + "Seg");
    const def = S.days <= 14 ? "daily" : S.days > 120 ? "monthly" : "weekly";
    $$("button", seg).forEach((b) => {
      b.classList.toggle("on", b.dataset.m === def);
      b.addEventListener("click", () => { $$("button", seg).forEach((x) => x.classList.toggle("on", x === b)); draw(b.dataset.m); });
    });
    draw(def);
  }

  /** Monthly line per year (Figma "inquiries over years" charts). */
  function yearsChart(id, daily) {
    const years = {};
    daily.forEach((d) => { const y = d.day.slice(0, 4), m = +d.day.slice(5, 7) - 1; (years[y] = years[y] || Array(12).fill(0))[m] += d.questions || 0; });
    const cols = ["#016191", "#307aab", "#f59e0b"];
    const ys = Object.keys(years).sort().slice(-3);
    const labels = ["Jan", "Feb", "Mar", "Apr", "May", "June", "Jul", "Aug", "Sep", "October", "Nov", "December"];
    Charts.area($("#" + id), labels, ys.length ? ys.map((y, i) => ({name: y, color: cols[i], values: years[y], fill: false}))
      : [{name: "questions", color: cols[0], values: Array(12).fill(0), fill: false}], {label: "Inquiries by month"});
    return ys.map((y, i) => `<span><i class="round" style="background:${cols[i]}"></i>${y}</span>`).join("");
  }

  function topicsPanel(byCat, title = "Most Requested Topics", sub = "Automatic AI intent classification &amp; semantic cluster") {
    const total = byCat.reduce((a, b) => a + b.n, 0);
    const items = byCat.map((c) => ({label: catLabel(c.category), value: c.n, color: catColor(c.category)}));
    return {html: `<div class="panel"><h2 class="sm">${title}</h2><p class="sub">${sub}</p><div class="donut-wrap" id="donut"></div>
      <div class="bars">${items.slice(0, 6).map((it, i) => `<div class="bar-row"><div class="t"><span><i class="dotc" style="background:${it.color}"></i>${esc(it.label)}</span>
      <b>${total ? Math.round((100 * it.value) / total) : 0}% <span class="muted">(${num(it.value)})</span></b></div>
      <div class="track"><div class="fill" style="width:${total ? (100 * it.value) / total : 0}%;background:${it.color};animation-delay:${0.1 + i * 0.08}s"></div></div></div>`).join("") || '<div class="empty">No data yet</div>'}</div></div>`,
      draw: () => Charts.donut($("#donut"), items, Charts.fmt(total), "TOTAL ASKED")};
  }

  // ---------------------------------------------------------------- conversation tables
  /** What happened in a conversation, as one label (the most important outcome wins). */
  function outcome(c) {
    if (c.had_emergency) return ["Emergency", "red"];
    if (c.had_form) return ["Report / request form", "blue"];
    if (c.had_handover) return ["Passed to RMB staff", "blue"];
    if (c.had_unanswered) return ["Not answered", "amber"];
    if (c.had_answer) return ["Answered", "green"];
    if (c.had_request === false) return ["Greeting only", ""];
    return ["Replied", ""];
  }
  const outcomePill = (c) => { const [l, cls] = outcome(c); return `<span class="pill ${cls} dot">${esc(T(l))}</span>`; };

  function convTable(list, opts = {}) {
    if (!list.length) return `<div class="empty">${T("No conversations in this period.")}</div>`;
    return `<div class="table-wrap"><table class="conv-table"><thead><tr><th>${T("Question")}</th><th>${T("Topic")}</th><th>${T("Outcome")}</th><th>${T("When")}</th><th></th></tr></thead><tbody>
      ${list.map((c, i) => `<tr class="click" data-i="${i}" style="animation-delay:${i * 0.03}s">
        <td data-notr><span class="clip">${esc(c.first_question)}</span>${c.replies > 1 ? `<span class="muted small conv-n">${T("{n} messages", {n: c.replies})}</span>` : ""}</td>
        <td>${catPill(c.category)}</td><td>${outcomePill(c)}</td><td class="muted" style="white-space:nowrap">${rel(c.created_at)}</td>
        <td style="text-align:right"><span class="link">${T("Open")} ${ic("chevron-right", 14, 2)}</span></td></tr>`).join("")}</tbody></table></div>`;
  }
  function bindConvRows(list, root = document) {
    $$("tr.click[data-i]", root).forEach((tr) => tr.addEventListener("click", (e) => { e.preventDefault(); openConversation(list[+tr.dataset.i].session_id); }));
  }

  const INTENT_LABEL = {question: "Question", greeting: "Greeting", complaint: "Complaint", illegal_mining_report: "Illegal mining report",
    meeting_request: "Meeting request", geodata_request: "Geological data request", case_status: "Case status", legal_interpretation: "Legal question",
    emergency: "Emergency", about_assistant: "About the assistant", out_of_scope: "Out of scope", abusive: "Abusive"};
  const ACTION_LABEL = {none: "", form: "Form shown", emergency: "Emergency numbers shown", handover: "Passed to RMB staff", not_covered: "Not in the documents"};

  async function openConversation(id) {
    const d = await api(`conversations/${id}`);
    const first = d.messages[0];
    const started = first ? new Date(first.created_at).toLocaleString(LOC, {day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit"}) : "";
    const body = d.messages.map((m) => {
      if (m.role !== "assistant") return `<div class="bubble-row user"><div class="bubble user" data-notr>${esc(m.content)}</div></div>`;
      const tags = [
        m.category ? `<span class="tag">${esc(catLabel(m.category))}</span>` : "",
        m.intent ? `<span class="tag ${m.intent === "emergency" ? "red" : ""}">${esc(T(INTENT_LABEL[m.intent] || m.intent))}</span>` : "",
        ACTION_LABEL[m.action] ? `<span class="tag ${m.action === "not_covered" ? "amber" : "blue"}">${esc(T(ACTION_LABEL[m.action]))}</span>` : "",
        m.feedback ? `<span class="tag ${m.feedback > 0 ? "green" : "red"}">${T(m.feedback > 0 ? "Rated helpful" : "Rated not helpful")}</span>` : "",
      ].join("");
      const src = m.sources && m.sources.length ? `<div class="bubble-src"><b>${T("Sources")}</b>${m.sources.map((s) => `<span>[${s.n}] ${esc(s.short_title)}${s.section ? ", " + esc(s.section) : ""}</span>`).join("")}</div>` : "";
      const tech = `<details class="bubble-tech"><summary>${T("Details")}</summary>${T("Reply time")}: ${secs(m.latency_ms)}${m.model ? " · " + esc(m.model) : ""}
        ${m.standalone_query ? `<br>${T("Searched for")}: “<span data-notr>${esc(m.standalone_query)}</span>”` : ""}${m.feedback_comment ? `<br>${T("Comment")}: <span data-notr>${esc(m.feedback_comment)}</span>` : ""}</details>`;
      return `<div class="bubble-row bot"><span class="bot-ava">${ic("sparkles", 16)}</span><div><div class="bubble bot" data-notr>${esc(m.content)}</div>
        <div class="bubble-meta">${tags}</div>${src}${tech}</div></div>`;
    }).join("");
    modal(`<button class="icon-btn close" data-close aria-label="${T("Close")}">${ic("x-mark", 20)}</button>
      <div class="conv-head"><h2>${T("Conversation history")}</h2>
        <p class="muted small">${T("Started {d}", {d: started})} · ${T("{n} messages", {n: d.messages.length})} · <span data-notr>#${esc(String(id).slice(0, 8))}</span></p></div>
      <div class="conv-body">${body || `<div class="empty">${T("No messages")}</div>`}</div>`, "wide conv-modal");
  }

  // ---------------------------------------------------------------- Dashboard
  async function dashboard() {
    const [d, recent] = await Promise.all([api(`analytics/summary?days=${S.days}`), can("conversations") ? api(`conversations?limit=6&days=${S.days}`) : []]);
    const t = d.totals, topics = topicsPanel(d.by_category);
    view().innerHTML = head("Dashboard", "Overview of RMB chatbot activity, multilingual inference telemetry, and concession inquiry insights.",
      `${periodSelect()}${exportBtn()}`) +
      `<div class="cards">
        ${stat("Total conversations", cnum(t.conversations), `<span>Answered worldwide · ${num(t.questions)} questions</span>`)}
        ${stat("AI response rate", cpct(t.answer_rate), "<span>Answered from official documents</span>")}
        ${stat("Average latency", csec(t.median_latency_ms), `<span>RAG vector lookup · 90% under ${secs(t.p90_latency_ms)}</span>`)}
      </div>
      <div class="grid2">${trendPanel("trend", "Conversation &amp; Active User Trends", "Daily inquiry volume &amp; engagement across the selected period")}${topics.html}</div>
      ${can("conversations") ? `<div class="panel"><div class="panel-head"><div><h2 class="sm">Recent Conversations</h2><p class="sub">Incoming international inquiries and verified AI classifications</p></div>
        <a class="btn small" href="#/conversations">View all ${ic("chevron-right", 14, 2)}</a></div>${convTable(recent)}</div>` : ""}`;
    bindPeriod(dashboard);
    drawTrend("trend", d.daily);
    topics.draw();
    bindConvRows(recent);
    $("#export").addEventListener("click", () => csv(`rmb-dashboard-${S.days}d.csv`, [{period_days: S.days, ...t}, ...d.daily]));
  }

  // ---------------------------------------------------------------- All conversations
  async function conversations(params = {}) {
    if (params.sub) return categoryPage(params.sub, params);
    const q = params.q || "", cat = params.category || "", out = params.outcome || "", page = +(params.page || 0), size = 6;
    const [d, all] = await Promise.all([api(`analytics/summary?days=${S.days}`),
      api(`conversations?days=${S.days}&limit=2000${q ? "&q=" + encodeURIComponent(q) : ""}${cat ? "&category=" + cat : ""}`)]);
    const list = out ? all.filter((c) => outcome(c)[0] === out) : all;
    const t = d.totals, rows = list.slice(page * size, page * size + size);
    const OUTCOMES = ["Answered", "Not answered", "Report / request form", "Passed to RMB staff", "Emergency", "Greeting only"];
    const counts = {}; all.forEach((c) => { const k = outcome(c)[0]; counts[k] = (counts[k] || 0) + 1; });
    const filterBar = `<div class="conv-filters" role="group" aria-label="${T("Filter")}">
        <span class="filter-label">${ic("funnel", 16)} ${T("Filter")}</span>
        <label class="select-btn"><select id="fCat" aria-label="${T("Topic")}"><option value="">${T("All topics")}</option>
          ${Object.keys(CAT).map((k) => `<option value="${k}" ${k === cat ? "selected" : ""}>${esc(catLabel(k))}</option>`).join("")}</select><span class="ico-r">${ic("chevron-down", 14, 2)}</span></label>
        <label class="select-btn"><select id="fOut" aria-label="${T("Outcome")}"><option value="">${T("All outcomes")}</option>
          ${OUTCOMES.map((k) => `<option value="${esc(k)}" ${k === out ? "selected" : ""}>${esc(T(k))}${cat || q ? "" : ` (${counts[k] || 0})`}</option>`).join("")}</select><span class="ico-r">${ic("chevron-down", 14, 2)}</span></label>
        ${q ? `<span class="chip" data-notr>“${esc(q)}” <button type="button" class="chip-x" id="fQx" aria-label="${T("Clear")}">${ic("x-mark", 12, 2)}</button></span>` : ""}
        ${cat || out || q ? `<button type="button" class="btn small ghost" id="fClear">${T("Clear filters")}</button>` : ""}
        <span class="muted small filter-count">${T("{n} conversations", {n: num(list.length)})}</span></div>`;
    const totalTickets = d.by_category.reduce((a, b) => a + b.n, 0);
    const max = Math.max(1, ...d.by_category.map((c) => c.n));
    view().innerHTML = head("All Conversations", "Cross-sector registry, automated AI categorization telemetry, and live inquiry records across all mining governance domains in Rwanda.",
      `${periodSelect()}${exportBtn()}`) +
      `<div class="cards">${stat("Total logged records", cnum(t.conversations), "<span>conversations</span>")}
        ${stat("Autonomous resolution", cpct(t.answer_rate), `<span><b>${num(t.answered)}</b> Resolved</span>`)}
        ${stat("Triage &amp; latency", csec(t.median_latency_ms), `<span>${t.median_latency_ms && t.median_latency_ms < 3000 ? "Ultra-fast" : "Median response"}</span>`)}</div>
      <div class="panel"><h2>Sector Demand &amp; AI Classification Telemetry</h2><p class="sub">Distribution of ${num(totalTickets)} tickets categorized across Rwandan mineral regulatory mandates.</p>
        <div class="tiles">${d.by_category.map((c, i) => `<div class="tile ${c.category === "complaints" ? "danger" : ""}" data-cat="${esc(c.category)}">
          <div class="h"><span>${esc(catLabel(c.category))}</span><span>${num(c.n)}</span></div><div class="d">${esc((CAT[c.category] || ["", ""])[1])}</div>
          <div class="track" style="height:4px"><div class="fill" style="width:${(100 * c.n) / max}%;background:${catColor(c.category)};animation-delay:${0.1 + i * 0.05}s"></div></div></div>`).join("") || '<div class="empty">No data yet</div>'}</div></div>
      <div class="panel" id="recentPanel"><div class="panel-head"><div><h2 class="sm">Recent Conversations</h2><p class="sub">Incoming international inquiries and verified AI classifications</p></div></div>
        ${filterBar}
        <div id="rows">${convTable(rows, {dots: true})}</div><div id="pg"></div></div>`;
    bindPeriod(() => conversations(params));
    bindConvRows(rows);
    const pg = pager(list.length, page, size, (p) => conversations({...params, page: p}));
    $("#pg").innerHTML = pg.html; pg.bind($("#pg"));
    const go = (p) => conversations({...params, page: 0, ...p}).then(() => { if (p.scroll !== false) $("#recentPanel").scrollIntoView({block: "start"}); });
    $("#fCat").addEventListener("change", (e) => go({category: e.target.value}));
    $("#fOut").addEventListener("change", (e) => go({outcome: e.target.value}));
    if ($("#fQx")) $("#fQx").addEventListener("click", () => go({q: ""}));
    if ($("#fClear")) $("#fClear").addEventListener("click", () => go({category: "", outcome: "", q: ""}));
    $$("[data-cat]").forEach((el) => el.addEventListener("click", () => go({category: el.dataset.cat})));
    $("#export").addEventListener("click", () => csv("rmb-conversations.csv", list));
  }

  // ---------------------------------------------------------------- Category pages (Figma: Mining Licenses, Investment, Complaints, Other)
  const PAGE_COPY = {
    licensing: {title: "Mining Licenses & Concessions", sub: "Real-time AI inquiry telemetry, cadastre cross-verification, and complete applicant registry for artisanal, small-scale, and commercial exploitation licenses across Rwanda.",
      chart: ["Concessions in time", "Monthly licence inquiries and how the assistant handled them."], table: ["Citizen & Investor License Requests Roster", "All incoming requests categorized under Mining Licenses, with the assistant's handling and live AI status."]},
    investment: {title: "Mining Investment & Joint Ventures", sub: "Real-time telemetry on international capital commitments, mineral beneficiation incentives, RDB joint-venture agreements, and tax exemption inquiries across Rwanda's mining sector.",
      chart: ["Investments & funds-required inquires over years", "Inquiry intensity by month, compared year on year"], table: ["Investment inquires", "All incoming requests categorized under Investment, Petroleum & Gas and Geological data."]},
    complaints: {title: "Citizen Complaints & Whistleblower Registry", sub: "Automated triage, urgency scoring, and inspector assignment for mine concession disputes, illegal extraction, and river siltation reports across Rwanda.",
      chart: ["Complaints-related inquiry rise across the years", "Inquiry intensity by month, compared year on year"], table: ["Complaints inquires", "Complaints and illegal-mining reports submitted through the assistant, with triage and contact details when given."]},
    other: {title: "Other Inquiries", sub: "Trade, taxation, environment, health & safety and general enquiries handled by the assistant.",
      chart: ["Inquiries in time", "Monthly volume of other enquiries"], table: ["Recent Conversations", "Incoming inquiries and verified AI classifications"]},
  };

  async function categoryPage(id, params = {}) {
    const P = SUBPAGES.find((p) => p.id === id) || SUBPAGES[0], C = PAGE_COPY[P.id], page = +(params.page || 0), size = 8;
    const sums = await Promise.all(P.cats.map((c) => api(`analytics/summary?days=${Math.max(S.days, 365)}&category=${c}`)));
    const period = await Promise.all(P.cats.map((c) => api(`analytics/summary?days=${S.days}&category=${c}`)));
    const T = period.reduce((a, s) => { for (const [k, v] of Object.entries(s.totals)) if (typeof v === "number") a[k] = (a[k] || 0) + v; return a; }, {});
    const lat = period.map((s) => s.totals.median_latency_ms).filter((v) => v != null);
    const latency = lat.length ? lat.reduce((a, b) => a + b, 0) / lat.length : null;
    const answerRate = T.information_requests ? T.answered / T.information_requests : null;
    const dailyAll = {};
    sums.forEach((s) => s.daily.forEach((d) => { const x = dailyAll[d.day] || (dailyAll[d.day] = {day: d.day, conversations: 0, questions: 0}); x.conversations += d.conversations; x.questions += d.questions; }));
    const daily = Object.values(dailyAll).sort((a, b) => a.day.localeCompare(b.day));

    let casesList = [];
    if (P.id === "complaints" && can("cases_read")) {
      casesList = (await api("cases?relevance=all&limit=200")).filter((c) => c.type === "grievance" || c.type === "illegal_mining_report");
    }
    const convs = (await Promise.all(P.cats.map((c) => api(`conversations?days=${Math.max(S.days, 90)}&category=${c}&limit=200`)))).flat()
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

    // ---- cards
    let cards;
    if (P.id === "licensing") {
      cards = stat("Total sector requests", cnum(T.conversations || 0), `<span>requested about mining.</span><span>${secs(latency)}</span>`) +
        stat("AI first-contact resolution", cpct(answerRate), `<span>Avg Response Latency</span><span>${secs(latency)}</span>`) +
        stat("High-risk inquiries", cnum((T.not_covered || 0) + (T.handovers || 0) + (T.emergencies || 0)), "<span>Flagged</span>");
    } else if (P.id === "investment") {
      const meetings = can("cases_read") ? (await api("cases?relevance=all&limit=200")).filter((c) => c.type === "meeting_request" || c.type === "geodata_request").length : null;
      cards = stat("Prospective deals", cnum(T.conversations || 0), "<span>Inquiries Logged</span>") +
        stat("Answered from official documents", cpct(answerRate), "<span>RMB &amp; RDB investment prospectuses</span>") +
        stat("Meeting &amp; data requests", meetings == null ? "–" : cnum(meetings), "<span>Investor follow-ups</span>");
    } else if (P.id === "complaints") {
      const urgent = casesList.filter((c) => c.triage_priority === "urgent").length;
      const done = casesList.filter((c) => c.status === "resolved" || c.status === "closed");
      const hrs = done.length ? done.reduce((a, c) => a + (new Date(c.updated_at) - new Date(c.created_at)), 0) / done.length / 36e5 : null;
      cards = stat("Total reported complaints", cnum(casesList.length), "<span>Inquiries</span>") +
        stat("Urgent escalations", cnum(urgent), "<span>Automated triage &amp; officer notified</span>") +
        stat("Turnaround response", hrs == null ? "–" : cnum(Math.round(hrs), "h"), "<span>Average time to resolution</span>");
    } else {
      cards = stat("Total logged records", cnum(T.conversations || 0), "<span>conversations</span>") +
        stat("Autonomous resolution", cpct(answerRate), `<span><b>${num(T.answered || 0)}</b> Resolved</span>`) +
        stat("Triage &amp; latency", csec(latency), "<span>Median response</span>");
    }

    // ---- chart block
    let chart;
    if (P.id === "licensing" || P.id === "other") {
      const months = {};
      convs.forEach((c) => { const m = c.created_at.slice(0, 7); const x = months[m] || (months[m] = {answered: 0, flagged: 0, emergency: 0}); if (c.had_emergency) x.emergency++; else if (c.had_unanswered) x.flagged++; else x.answered++; });
      const keys = Object.keys(months).sort().slice(-6);
      const max = Math.max(1, ...keys.map((k) => months[k].answered + months[k].flagged + months[k].emergency));
      chart = `<div class="panel"><h2>${C.chart[0]}</h2><p class="sub">${C.chart[1]}</p>
        <div class="legend" style="justify-content:space-between"><span style="display:flex;gap:20px"><span><i style="background:#016191"></i>Answered from documents</span>
          <span><i style="background:#4b5f7f"></i>Needs staff (knowledge gap)</span><span><i style="background:#40484f"></i>Emergency</span></span><span>Requests</span></div>
        ${keys.length ? keys.map((k, i) => { const m = months[k], tot = m.answered + m.flagged + m.emergency, w = (v) => (100 * v) / max;
          return `<div class="stack-row"><span>${new Date(k + "-01").toLocaleDateString(LOC, {month: "short", year: "numeric"})}</span><div class="stack">
            <span style="width:${w(m.answered)}%;background:#016191;animation-delay:${i * 0.08}s"></span><span style="width:${w(m.flagged)}%;background:#4b5f7f;animation-delay:${i * 0.08 + 0.1}s"></span>
            <span style="width:${w(m.emergency)}%;background:#40484f;animation-delay:${i * 0.08 + 0.2}s"></span></div><b>${num(tot)}</b></div>`; }).join("") : '<div class="empty">No inquiries yet</div>'}</div>`;
    } else {
      chart = `<div class="panel"><h2>${C.chart[0]}</h2><p class="sub">${C.chart[1]}</p>
        <div class="legend" style="justify-content:space-between"><span class="muted">Inquiry Intensity by Month</span><span id="yl" style="display:flex;gap:16px"></span></div>
        <div class="chart" id="years"></div></div>`;
    }

    // complaints: two breakdown panels (status, topics)
    let breakdown = "";
    if (P.id === "complaints") {
      const byType = {}, byStatus = {};
      casesList.forEach((c) => { byType[c.type] = (byType[c.type] || 0) + 1; (byStatus[c.type] = byStatus[c.type] || {})[c.status] = ((byStatus[c.type] || {})[c.status] || 0) + 1; });
      const tot = casesList.length || 1;
      const reasons = {};
      casesList.forEach((c) => { const k = c.triage_priority; reasons[k] = (reasons[k] || 0) + 1; });
      breakdown = `<div class="grid-half"><div class="panel"><h2 class="sm">Reports by type &amp; status</h2><p class="sub">Where each kind of report stands</p>
          ${Object.keys(byType).map((t) => `<div class="card" style="padding:14px;margin-bottom:10px;box-shadow:none"><div class="kvrow"><b>${esc(CASE_TYPE[t] || t)}</b><span class="${t === "illegal_mining_report" ? "" : ""}" style="color:var(--red);font-weight:600">${num(byType[t])} Reports</span></div>
            <div class="stack" style="height:6px;margin:8px 0">${Object.entries(byStatus[t]).map(([s, n], i) => `<span style="width:${(100 * n) / byType[t]}%;background:${["#ba1a1a", "#f59e0b", "#016191", "#307aab", "#10b981", "#707880"][Object.keys(STATUS).indexOf(s)]};animation-delay:${i * .1}s"></span>`).join("")}</div>
            <div class="small muted">${Object.entries(byStatus[t]).map(([s, n]) => `${T(STATUS[s])}: ${n}`).join(" · ")}</div></div>`).join("") || '<div class="empty">No reports yet</div>'}</div>
        <div class="panel"><h2 class="sm">Urgency of reports</h2><p class="sub">AI triage of every submitted report</p><div class="bars">
          ${["urgent", "high", "normal", "low"].map((k, i) => `<div class="bar-row"><div class="t"><b>${k[0].toUpperCase() + k.slice(1)}</b><b>${Math.round((100 * (reasons[k] || 0)) / tot)}% <span class="muted">(${reasons[k] || 0})</span></b></div>
            <div class="track"><div class="fill" style="width:${(100 * (reasons[k] || 0)) / tot}%;background:${["#ba1a1a", "#f59e0b", "#016191", "#707880"][i]};animation-delay:${i * .08}s"></div></div></div>`).join("")}</div></div></div>`;
    }

    // ---- table (roster)
    let rows, total, tableHtml;
    if (P.id === "complaints") {
      total = casesList.length; rows = casesList.slice(page * size, page * size + size);
      const det = await Promise.all(rows.map((c) => api(`cases/${c.reference_number}`).catch(() => null)));
      tableHtml = `<div class="table-wrap"><table><thead><tr><th>Personal<br>information</th><th>Reference</th><th>Specific inquiry summary</th><th>Time &amp; date</th><th style="text-align:right">Actions</th></tr></thead><tbody>
        ${rows.map((c, i) => { const ct = det[i] && det[i].contact; return `<tr class="click" data-ref="${esc(c.reference_number)}" style="animation-delay:${i * .03}s">
          <td>${ct && ct.name ? `<div class="person"><span class="avatar ${avatarClass(ct.name)}">${esc(initials(ct.name))}</span><div><b>${esc(ct.name)}</b><small>${esc(ct.phone || ct.email || "")}</small></div></div>` : `<span class="muted">${c.anonymous ? "Anonymous" : "Not provided"}</span>`}</td>
          <td class="small">${esc(c.reference_number)}<br>${priPill(c.triage_priority)}</td><td><span class="two">${esc(c.summary)}</span></td><td>${stamp(c.created_at)}</td>
          <td style="text-align:right"><button class="icon-btn" aria-label="Open">${ic("ellipsis-vertical", 18)}</button></td></tr>`; }).join("") || '<tr><td colspan="5" class="empty">No complaints yet</td></tr>'}</tbody></table></div>`;
    } else {
      total = convs.length; rows = convs.slice(page * size, page * size + size);
      tableHtml = `<div class="table-wrap"><table><thead><tr><th>Personal<br>information</th><th>Session</th><th>Specific inquiry summary</th><th>Time &amp; date</th><th style="text-align:right">Actions</th></tr></thead><tbody>
        ${rows.map((c, i) => `<tr class="click" data-i="${i}" style="animation-delay:${i * .03}s"><td><span class="muted">Not provided</span></td>
          <td class="small muted">#${esc(c.session_id.slice(0, 8))}</td><td><span class="two">${esc(c.first_question)}</span></td><td>${stamp(c.created_at)}</td>
          <td style="text-align:right"><button class="icon-btn" aria-label="Open">${ic("ellipsis-vertical", 18)}</button></td></tr>`).join("") || '<tr><td colspan="5" class="empty">No inquiries yet</td></tr>'}</tbody></table></div>`;
    }

    view().innerHTML = head(C.title, C.sub, `${periodSelect()}<button class="btn primary" id="export">Export</button>`) +
      `<div class="cards">${cards}</div>${chart}${breakdown}
      <div class="panel"><h2>${C.table[0]}</h2><p class="sub">${C.table[1]}</p>${tableHtml}<div id="pg"></div></div>`;
    if ($("#years")) $("#yl").innerHTML = yearsChart("years", daily);
    bindPeriod(() => categoryPage(id, params));
    const pg = pager(total, page, size, (p) => categoryPage(id, {...params, page: p}), "");
    $("#pg").innerHTML = pg.html; pg.bind($("#pg"));
    if (P.id === "complaints") $$("tr.click[data-ref]").forEach((tr) => tr.addEventListener("click", () => openCase(tr.dataset.ref, () => categoryPage(id, params))));
    else bindConvRows(rows);
    $("#export").addEventListener("click", () => csv(`rmb-${P.id}.csv`, P.id === "complaints" ? casesList : convs));
  }

  // ---------------------------------------------------------------- Cases
  async function cases(params = {}) {
    const relv = params.relevance || "inbox", status = params.status || "";
    const list = await api(`cases?relevance=${relv}&limit=100${status ? "&status=" + status : ""}`);
    view().innerHTML = head("Cases", "Complaints, illegal-mining reports and requests submitted through the assistant. Triaged by AI: urgent first; likely spam is kept apart, never deleted.",
      `<button class="btn primary" id="export">Export</button>`) +
      `<div class="panel"><div class="tabs">${[["inbox", "Inbox"], ["spam", "Likely spam"], ["all", "All"]].map(([k, l]) =>
          `<button data-rel="${k}" class="${k === relv ? "on" : ""}">${l}</button>`).join("")}</div>
        <div class="filters"><select id="cstatus"><option value="">All statuses</option>${Object.entries(STATUS).map(([k, l]) => `<option value="${k}" ${k === status ? "selected" : ""}>${l}</option>`).join("")}</select>
          ${can("cases_confidential") ? "" : '<span class="muted small">Confidential reports are hidden for your role.</span>'}</div>
        ${list.length ? `<div class="table-wrap"><table><thead><tr><th>Priority</th><th>Reference</th><th>Type</th><th>Summary</th><th>Triage</th><th>Status</th><th>Assigned</th><th>Received</th></tr></thead><tbody>
        ${list.map((c, i) => `<tr class="click" data-i="${i}" style="animation-delay:${i * .03}s"><td>${priPill(c.triage_priority)}</td><td><b>${esc(c.reference_number)}</b></td>
          <td>${esc(CASE_TYPE[c.type] || c.type)}</td><td><span class="clip" style="max-width:280px">${esc(c.summary)}</span>
          ${c.anonymous ? '<span class="pill">anonymous</span> ' : ""}${c.confidential ? '<span class="pill red">confidential</span>' : ""}</td>
          <td>${relPill(c.triage_relevance)}</td><td><span class="pill blue">${esc(STATUS[c.status] || c.status)}</span></td><td>${esc(c.assigned_to || "–")}</td>
          <td class="muted">${rel(c.created_at)}</td></tr>`).join("")}</tbody></table></div>` : '<div class="empty">No cases here.</div>'}</div>`;
    $$("[data-rel]").forEach((b) => b.addEventListener("click", () => cases({...params, relevance: b.dataset.rel})));
    $("#cstatus").addEventListener("change", (e) => cases({...params, status: e.target.value}));
    $$("tr.click").forEach((tr) => tr.addEventListener("click", () => openCase(list[+tr.dataset.i].reference_number, () => cases(params))));
    $("#export").addEventListener("click", () => csv("rmb-cases.csv", list));
  }

  async function openCase(ref, refresh) {
    const c = await api(`cases/${ref}`);
    const q = (c.details && (c.details.question || c.details.description || c.details.topic || c.details.request)) || c.summary;
    const when = (d) => new Date(d).toLocaleString(LOC, {day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit"});
    const human = (k) => T(String(k).replace(/_/g, " ").replace(/^./, (m) => m.toUpperCase()));
    const fact = (label, value, notr = false) => `<div class="fact"><span>${T(label)}</span><b ${notr ? "data-notr" : ""}>${value}</b></div>`;
    const shown = String(c.summary || q || "").trim();
    const details = Object.entries(c.details || {}).filter(([, v]) => v !== null && v !== "" && v !== undefined && String(v).trim() !== shown);
    const contact = c.contact ? Object.entries(c.contact).filter(([, v]) => v) : [];
    const sel = (name, opts, cur) => `<select name="${name}">${opts.map(([k, l]) => `<option value="${k}" ${k === cur ? "selected" : ""}>${esc(T(l))}</option>`).join("")}</select>`;
    const cap = (s) => s[0].toUpperCase() + s.slice(1);
    // Events are "created", "note" or 'updated {"status":"in_progress",...}' (case service).
    const EVENT = {created: "Case received", note: "Note added", updated: "Case updated"};
    const FIELD = {status: "Status", assigned_to: "Assigned to", priority: "Priority", relevance: "Relevance"};
    const eventTitle = (ev) => T(EVENT[String(ev).split(" ")[0]] || human(ev));
    const eventChanges = (ev) => {
      const m = String(ev).match(/^updated (\{.*\})$/); if (!m) return "";
      let ch; try { ch = JSON.parse(m[1]); } catch (x) { return ""; }
      const val = (k, v) => (k === "status" ? T(STATUS[v] || v) : k === "priority" ? T(cap(String(v))) : String(v));
      return `<span class="tl-changes">${Object.entries(ch).map(([k, v]) => `${T(FIELD[k] || human(k))} → <b data-notr>${esc(val(k, v))}</b>`).join("<br>")}</span>`;
    };

    modal(`<button class="icon-btn close" data-close aria-label="${T("Close")}">${ic("x-mark", 20)}</button>
      <div class="conv-head case-head">
        <div class="case-title"><span class="case-ico ${c.triage_priority === "urgent" ? "red" : ""}">${ic(c.triage_priority === "urgent" ? "exclamation-triangle" : "briefcase", 20)}</span>
          <div><h2>${esc(T(CASE_TYPE[c.case_type] || c.case_type))}</h2>
          <p class="muted small"><span data-notr>${esc(c.reference)}</span> · ${T("Received")} ${when(c.created_at)}</p></div></div>
        <div class="case-pills">${priPill(c.triage_priority)} ${relPill(c.triage_relevance)} <span class="pill blue dot">${esc(T(STATUS[c.status] || c.status))}</span>
          ${c.anonymous ? `<span class="pill">${T("anonymous")}</span>` : ""}${c.confidential ? `<span class="pill red">${T("confidential")}</span>` : ""}</div>
      </div>
      <div class="conv-body case-body">
        <div class="case-main">
          <section class="case-card"><h3>${T("What was reported")}</h3>
            <p class="case-summary" data-notr>${esc(c.summary || q)}</p>
            ${details.length ? `<div class="facts">${details.map(([k, v]) => fact(human(k), esc(v), true)).join("")}</div>` : ""}</section>
          <section class="case-card"><h3>${T("Contact")}</h3>
            ${contact.length ? `<div class="facts">${contact.map(([k, v]) => fact(human(k), esc(v), true)).join("")}</div>`
              : `<p class="muted">${T("Anonymous / not given")}</p>`}</section>
          <section class="case-card"><h3>${T("Conversation before the form")}</h3>
            <div class="mini-chat">${(c.conversation_excerpt || []).map((m) => m.role === "user"
              ? `<div class="bubble-row user"><div class="bubble user" data-notr>${esc(m.content)}</div></div>`
              : `<div class="bubble-row bot"><span class="bot-ava">${ic("sparkles", 14)}</span><div><div class="bubble bot" data-notr>${esc(m.content)}</div></div></div>`).join("")
              || `<p class="muted">${T("None")}</p>`}</div></section>
        </div>
        <aside class="case-side">
          <section class="case-card"><h3>${T("Handling")}</h3><div class="facts one">
            ${fact("Routed to", esc(c.routed_to || "–"))}${fact("Expected response", esc(c.expected_response_time || "–"))}
            ${fact("Assigned to", esc(c.assigned_to || "–"), true)}
            ${fact("AI triage", `${esc(c.triage_reason || "–")} <span class="muted small">(${esc(c.triage_by || "")})</span>`, true)}</div></section>
          ${can("cases_write") ? `<section class="case-card"><h3>${T("Update")}</h3><form id="caseForm" class="vstack">
              <label class="field"><span>${T("Status")}</span>${sel("status", Object.entries(STATUS), c.status)}</label>
              <label class="field"><span>${T("Assign to")}</span><input name="assigned_to" value="${esc(c.assigned_to || "")}" placeholder="${T("Officer name")}"></label>
              <div class="row2"><label class="field"><span>${T("Priority")}</span>${sel("triage_priority", ["urgent", "high", "normal", "low"].map((k) => [k, cap(k)]), c.triage_priority)}</label>
                <label class="field"><span>${T("Relevance")}</span>${sel("triage_relevance", ["relevant", "unclear", "spam"].map((k) => [k, cap(k)]), c.triage_relevance)}</label></div>
              <label class="field"><span>${T("Note (internal)")}</span><textarea name="note" rows="2" placeholder="${T("e.g. inspector called the reporter")}"></textarea></label>
              <button class="btn primary">${ic("check", 16, 2)} ${T("Save changes")}</button>
              ${can("faq_write") ? `<button type="button" class="btn" id="toFaq">${ic("plus", 14, 2)} ${T("Write an official FAQ answer")}</button>` : ""}</form></section>` : ""}
          <section class="case-card"><h3>${T("Activity")}</h3><ol class="timeline">${c.events.slice().reverse().map((e) => `<li>
              <b>${esc(eventTitle(e.event))}</b>${eventChanges(e.event)}<span class="muted small">${when(e.created_at)} · <span data-notr>${esc(e.actor || "")}</span></span>
              ${e.note ? `<span class="tl-note" data-notr>${esc(e.note)}</span>` : ""}</li>`).join("") || `<li class="muted">${T("None")}</li>`}</ol></section>
        </aside>
      </div>`, "wide case-modal");
    const f = $("#caseForm");
    if (f) {
      f.addEventListener("submit", async (e) => {
        e.preventDefault();
        const v = Object.fromEntries(new FormData(f)), body = {};
        if (v.status !== c.status) body.status = v.status;
        if (v.assigned_to.trim() !== (c.assigned_to || "")) body.assigned_to = v.assigned_to.trim();
        if (v.triage_priority !== c.triage_priority) body.triage_priority = v.triage_priority;
        if (v.triage_relevance !== c.triage_relevance) body.triage_relevance = v.triage_relevance;
        if (v.note.trim()) body.note = v.note.trim();
        if (!Object.keys(body).length) { toast(T("Nothing to update")); return; }
        await api(`cases/${ref}`, {method: "PATCH", json: body});
        toast(T("Case updated")); openCase(ref, refresh); refresh && refresh();
      });
      const tf = $("#toFaq");
      if (tf) tf.addEventListener("click", () => { S.prefill = {question: q, source_type: "case", source_ref: c.reference}; closeModal(); location.hash = "#/faq"; });
    }
  }

  // ---------------------------------------------------------------- Knowledge gaps
  async function gaps(params = {}) {
    const st = params.status || "open";
    const list = await api(`unanswered?status=${st}&limit=200`);
    view().innerHTML = head("Knowledge Gaps", "Questions the assistant could not answer from the official documents. Answer them with an official FAQ answer, or add the missing document in AI Knowledge.",
      `<button class="btn primary" id="export">Export</button>`) +
      `<div class="panel"><div class="tabs">${[["open", "To review"], ["resolved", "Resolved"], ["ignored", "Ignored"]].map(([k, l]) => `<button data-st="${k}" class="${k === st ? "on" : ""}">${T(l)}</button>`).join("")}</div>
      ${list.length ? `<div class="table-wrap"><table><thead><tr><th>Question</th><th>Category</th><th>Reason</th><th>When</th><th>Note</th><th></th></tr></thead><tbody>
      ${list.map((g, i) => `<tr style="animation-delay:${Math.min(i, 20) * .02}s"><td data-notr>${esc(g.question)}</td><td>${catPill(g.category)}</td><td><span class="pill">${esc(T(GAP_REASON[g.reason] || g.reason))}</span></td>
        <td class="muted">${rel(g.created_at)}</td><td class="muted small" data-notr>${esc(g.note || "")}</td>
        <td><div class="row-actions">${st === "open" ? `${can("faq_write") ? `<button class="btn small primary" data-ans="${i}" title="${T("Write an official FAQ answer")}">${ic("plus", 14, 2)} ${T("Answer")}</button>` : ""}
          ${can("gaps_write") ? `<button class="btn small ok" data-res="${i}" data-v="resolved" title="${T("The answer now exists (document or FAQ added)")}">${ic("check", 14, 2)} ${T("Resolve")}</button>
            <button class="btn small ghost" data-res="${i}" data-v="ignored" title="${T("Not a real question, or nothing RMB needs to add")}">${ic("no-symbol", 14, 2)} ${T("Ignore")}</button>` : ""}`
          : can("gaps_write") ? `<button class="btn small" data-res="${i}" data-v="open">${ic("arrow-uturn-left", 14, 2)} ${T("Reopen")}</button>` : ""}</div></td></tr>`).join("")}</tbody></table></div>` : `<div class="empty">${T("Nothing here.")}</div>`}</div>`;
    $$("[data-st]").forEach((b) => b.addEventListener("click", () => gaps({status: b.dataset.st})));
    $$("[data-ans]").forEach((b) => b.addEventListener("click", () => {
      const g = list[+b.dataset.ans];
      S.prefill = {question: g.question, category: g.category, source_type: "gap", source_ref: String(g.id)};
      location.hash = "#/faq";
    }));
    const setStatus = async (g, status, note) => {
      await api(`unanswered/${g.id}`, {method: "PATCH", json: {status, note}});
      toast(T({resolved: "Marked as resolved", ignored: "Ignored", open: "Reopened"}[status]));
      refreshCounts(); gaps(params);
    };
    $$("[data-res]").forEach((b) => b.addEventListener("click", () => {
      const g = list[+b.dataset.res], v = b.dataset.v;
      if (v === "open") { setStatus(g, "open", null); return; }
      const resolve = v === "resolved";
      modal(`<h2>${T(resolve ? "Mark as resolved" : "Ignore this question")}</h2>
        <blockquote class="quote" data-notr>${esc(g.question)}</blockquote>
        <p class="muted">${T(resolve ? "Use this when the assistant can now answer it: you added a document or published an FAQ answer." : "Use this when it is not a real question for RMB (a test, spam, or something RMB does not need to add).")}</p>
        <form id="gapForm"><label class="field"><span>${T(resolve ? "What was done? (optional)" : "Reason (optional)")}</span>
          <input name="note" maxlength="300" placeholder="${T(resolve ? "e.g. FAQ #12 published" : "e.g. test message")}"></label>
          <div class="modal-actions"><button type="button" class="btn" data-close>${T("Cancel")}</button>
          <button class="btn ${resolve ? "primary" : ""}">${ic(resolve ? "check" : "no-symbol", 16, 2)} ${T(resolve ? "Mark as resolved" : "Ignore")}</button></div></form>`);
      $("#gapForm").addEventListener("submit", async (e) => {
        e.preventDefault();
        const note = new FormData(e.target).get("note").trim() || null;
        closeModal(); await setStatus(g, v, note);
      });
    }));
    $("#export").addEventListener("click", () => csv(`rmb-knowledge-gaps-${st}.csv`, list));
  }

  // ---------------------------------------------------------------- FAQ answers
  async function faq(params = {}) {
    const st = params.status || "";
    const list = await api(`faq${st ? "?status=" + st : ""}`);
    const p = S.prefill || {};
    S.prefill = null;
    const mine = (f) => S.me && String(f.created_by || "").toLowerCase().includes(S.me.email.toLowerCase());
    view().innerHTML = head("FAQ Answers", "Official answers written by RMB staff. The assistant cites a published answer as “RMB Official FAQ”. A draft goes live only when a <b>different</b> staff member publishes it.", "") +
      (can("faq_write") ? `<div class="panel" id="faqEditor"><h2 class="sm" id="faqTitle">${p.question ? "Answer this question" : "Write an official answer"}</h2>
        ${p.source_type ? `<p class="sub">From ${p.source_type === "gap" ? "knowledge gap #" : "case "}${esc(p.source_ref)}</p>` : '<p class="sub">Plain language. Include fees, steps and contacts only as officially confirmed.</p>'}
        <form id="faqForm"><input type="hidden" name="id"><input type="hidden" name="source_type" value="${esc(p.source_type || "manual")}"><input type="hidden" name="source_ref" value="${esc(p.source_ref || "")}">
          <label class="field"><span>Question (as people ask it)</span><input name="question" required value="${esc(p.question || "")}"></label>
          <label class="field"><span>Official answer</span><textarea name="answer" required rows="5"></textarea></label>
          <div class="row3"><label class="field"><span>Category</span><select name="category"><option value="">–</option>${Object.keys(CAT).map((c) => `<option value="${c}" ${c === p.category ? "selected" : ""}>${CAT[c][0]}</option>`).join("")}</select></label>
            <label class="field"><span>Owner department</span><input name="owner" required placeholder="e.g. Licensing"></label>
            <label class="field"><span>Review date</span><input type="date" name="review_date"></label></div>
          <button class="btn primary">Save draft</button> <button type="reset" class="btn">Clear</button>
          <span class="muted small" style="margin-left:8px">Saved as a draft. Another staff member must publish it.</span></form></div>` : "") +
      `<div class="panel"><div class="tabs">${[["", "All"], ["draft", "Awaiting approval"], ["active", "Published"], ["retired", "Retired"]].map(([k, l]) =>
          `<button data-st="${k}" class="${k === st ? "on" : ""}">${l}</button>`).join("")}</div>
        ${list.length ? `<div class="table-wrap"><table><thead><tr><th>#</th><th>Question &amp; answer</th><th>Status</th><th>Written by</th><th>Approved by</th><th></th></tr></thead><tbody>
        ${list.map((f, i) => `<tr><td>${f.id}</td><td><b>${esc(f.question)}</b><div style="white-space:pre-wrap;margin-top:4px;color:var(--ink-2)">${esc(f.answer)}</div>
            <div class="muted small" style="margin-top:4px">${esc(catLabel(f.category))} · ${T("owner")} <span data-notr>${esc(f.owner)}</span>${f.review_date ? ` · ${T("review")} ${esc(f.review_date)}` : ""}</div></td>
          <td><span class="pill ${f.status === "active" ? "green" : f.status === "retired" ? "" : "amber"} dot">${f.status === "active" ? "Published" : f.status === "draft" ? "Draft" : "Retired"}</span></td>
          <td class="small">${esc(f.created_by)}</td><td class="small">${esc(f.approved_by || "–")}</td>
          <td style="white-space:nowrap;text-align:right">${f.status === "draft" && can("faq_publish") ? (mine(f) ? '<span class="muted small">Needs another approver</span>' : `<button class="btn small primary" data-pub="${f.id}">Publish</button> `) : ""}
            ${f.status !== "retired" && can("faq_write") ? `<button class="btn small" data-edit="${i}">Edit</button>` : ""}
            ${f.status !== "retired" && can("faq_publish") ? `<button class="btn small danger" data-ret="${f.id}">Retire</button>` : ""}</td></tr>`).join("")}</tbody></table></div>` : '<div class="empty">No answers here yet.</div>'}</div>`;
    $$("[data-st]").forEach((b) => b.addEventListener("click", () => faq({status: b.dataset.st})));
    const form = $("#faqForm");
    if (form) {
      if (p.question) $("textarea[name=answer]", form).focus();
      form.addEventListener("submit", async (e) => {
        e.preventDefault();
        const v = Object.fromEntries(new FormData(form));
        const body = {question: v.question, answer: v.answer, category: v.category || null, owner: v.owner, review_date: v.review_date || null};
        if (v.id) await api(`faq/${v.id}`, {method: "PATCH", json: body});
        else await api("faq", {method: "POST", json: {...body, source_type: v.source_type, source_ref: v.source_ref || null}});
        toast("Saved as draft: another staff member must publish it."); faq(params);
      });
    }
    $$("[data-edit]").forEach((b) => b.addEventListener("click", () => {
      const f = list[+b.dataset.edit];
      for (const k of ["id", "question", "answer", "category", "owner", "review_date"]) $(`[name=${k}]`, form).value = f[k] || "";
      $("#faqTitle").textContent = `Edit FAQ #${f.id}` + (f.status === "active" ? " (saving takes it offline until approved again)" : "");
      $("#faqEditor").scrollIntoView({behavior: "smooth"});
    }));
    $$("[data-pub]").forEach((b) => b.addEventListener("click", async () => {
      await api(`faq/${b.dataset.pub}/publish`, {method: "POST", json: {}}); toast("Published: the assistant can now cite it."); faq(params);
    }));
    $$("[data-ret]").forEach((b) => b.addEventListener("click", async () => {
      if (!await ask("Retire this answer? The assistant will stop using it.")) return;
      await api(`faq/${b.dataset.ret}/retire`, {method: "POST", json: {}}); toast("Retired"); faq(params);
    }));
  }

  // ---------------------------------------------------------------- AI Knowledge
  async function knowledge(params = {}) {
    const page = +(params.page || 0), size = 6;
    const d = await api("documents");
    const s = d.summary, docs = d.documents.slice().reverse(), rows = docs.slice(page * size, page * size + size);
    view().innerHTML = head("AI Knowledge Base & RAG Vector Index", "Central vector index for Rwanda Mines, Petroleum and Gas Board statutes, gazettes, prospectuses and staff answers. Real-time document decomposition and embedding.",
      can("documents_write") ? `<button class="btn primary" id="toUpload">${ic("plus", 16, 2)} Upload Official Document</button>` : "") +
      `<div class="cards four">${stat("Knowledge volume", `${cnum(s.documents)} docs`, `<span>Official gazettes &amp; decrees</span><b>${num(s.active)} active</b>`)}
        ${stat("Indexed vectors", `${cnum(s.indexed_chunks)}`, "<span>Passages · EN / FR / RW</span>")}
        ${stat("Embedding queue", `${cnum(s.processing)} files`, "<span>Tokenization active</span>")}
        ${stat("Requires review", `${cnum(s.needs_review)} docs`, `<span>OCR / review flags</span><b>${num(s.review_overdue)} overdue</b>`)}</div>
      ${can("documents_write") ? `<div class="upload" id="drop"><div class="cloud">${ic("cloud-arrow-up", 30)}</div>
        <h3>Upload Official RMB Document.</h3><div class="types"><span>${ic("document-text", 14)} PDF (Scanned OCR &amp; Native)</span></div>
        <button type="button" class="btn primary" id="browse">${ic("folder-open", 16)} Browse Local Files</button>
        <p class="muted small" style="margin:12px 0 0">Max upload footprint: 50MB/file</p>
        <form id="upForm" hidden><label class="field"><span>Selected file</span><input type="file" name="file" accept="application/pdf" required></label>
          <div class="row2"><label class="field"><span>Title *</span><input name="title" required></label><label class="field"><span>Short title</span><input name="short_title"></label></div>
          <div class="row3"><label class="field"><span>Type</span><select name="doc_type">${["law", "regulation", "guide", "faq", "prospectus", "directory", "other"].map((t) => `<option>${t}</option>`).join("")}</select></label>
            <label class="field"><span>Owner department *</span><input name="owner" required></label><label class="field"><span>Version</span><input name="version"></label></div>
          <div class="row3"><label class="field"><span>Law reference</span><input name="law_reference" placeholder="Law n° …"></label>
            <label class="field"><span>Effective date</span><input type="date" name="effective_date"></label><label class="field"><span>Review date</span><input type="date" name="review_date"></label></div>
          <button class="btn primary">Upload</button> <span class="muted small" style="margin-left:8px">Stays a draft (not used by the assistant) until you publish it.</span></form></div>` : ""}
      <div class="panel"><div class="panel-head"><div><h2 class="sm">Registered Knowledge Documents</h2></div>
        <button class="icon-btn" id="dl" title="Export">${ic("arrow-down-tray", 18)}</button><button class="icon-btn" id="reload" title="Refresh">${ic("arrow-path", 18)}</button></div>
        <div class="table-wrap"><table><thead><tr><th>Document name &amp; code</th><th>Category</th><th>Format &amp; size</th><th>Uploader &amp; date</th><th>Processing status</th><th></th></tr></thead><tbody>
        ${rows.map((x, i) => `<tr style="animation-delay:${i * .04}s"><td><b>${esc(x.short_title)}</b><div class="muted small">${esc(x.id)}${x.law_reference ? " · " + esc(x.law_reference) : ""}</div></td>
          <td>${catPill(x.category)}</td><td><b>${x.doc_type === "webpage" ? "Web page" : x.doc_type === "faq" ? "Staff FAQ" : "PDF"}</b><div class="muted small">${x.page_count ? x.page_count + " pages · " : ""}${num(x.chunk_count)} passages</div></td>
          <td><b>${esc((x.owner || "–").replace(" (to be confirmed)", ""))}</b><div class="muted small">${date(x.indexed_at || x.created_at)}${x.review_overdue ? ' · <span style="color:var(--red)">review overdue</span>' : ""}</div></td>
          <td>${docStatusPill(x)}</td>
          <td style="white-space:nowrap;text-align:right"><button class="btn small" data-chunks="${esc(x.id)}">View</button>
            ${can("documents_write") && x.layout !== "faq" ? `${x.status !== "active" ? `<button class="btn small primary" data-st="active" data-id="${esc(x.id)}">Publish</button>` : `<button class="btn small" data-st="draft" data-id="${esc(x.id)}">Unpublish</button>`}
              <button class="btn small" data-reidx="${esc(x.id)}">Reindex</button>${x.status !== "retired" ? `<button class="btn small danger" data-st="retired" data-id="${esc(x.id)}">Retire</button>` : ""}` : ""}</td></tr>`).join("")}</tbody></table></div>
        <div id="pg"></div></div>`;
    const go = (p) => knowledge({...params, ...p});
    const pg = pager(docs.length, page, size, (p) => go({page: p}), "registered documents");
    $("#pg").innerHTML = pg.html; pg.bind($("#pg"));
    $("#reload").addEventListener("click", () => go({}));
    $("#dl").addEventListener("click", () => csv("rmb-knowledge-documents.csv", d.documents));
    $$("[data-chunks]").forEach((b) => b.addEventListener("click", () => openChunks(b.dataset.chunks)));
    $$("[data-st]").forEach((b) => b.addEventListener("click", async () => {
      if (b.dataset.st === "retired" && !await ask("Retire this document? The assistant will stop using it.")) return;
      await api(`documents/${b.dataset.id}`, {method: "PATCH", json: {status: b.dataset.st}}); toast("Document updated"); go({});
    }));
    $$("[data-reidx]").forEach((b) => b.addEventListener("click", async () => { await api(`documents/${b.dataset.reidx}/reindex`, {method: "POST", json: {}}); toast("Re-indexing in the background"); go({}); }));
    const tu = $("#toUpload");
    if (tu) tu.addEventListener("click", () => { $("#drop").scrollIntoView({behavior: "smooth"}); $("#upForm").hidden = false; });
    const drop = $("#drop"), up = $("#upForm");
    if (drop) {
      $("#browse").addEventListener("click", () => { up.hidden = false; $("[name=file]", up).click(); });
      ["dragenter", "dragover"].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add("drag"); }));
      ["dragleave", "drop"].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.remove("drag"); }));
      drop.addEventListener("drop", (e) => { if (e.dataTransfer.files[0]) { up.hidden = false; $("[name=file]", up).files = e.dataTransfer.files; } });
      up.addEventListener("submit", async (e) => {
        e.preventDefault();
        const r = await fetch("/api/documents", {method: "POST", body: new FormData(up), headers: {"X-CSRF-Token": S.me.csrf}, credentials: "same-origin"});
        const j = await r.json().catch(() => ({}));
        if (!r.ok) { toast(typeof j.detail === "string" ? j.detail : "Upload failed", 5000); return; }
        toast(`Uploaded as ${j.id}: indexing… (draft until published)`); go({page: 0});
      });
    }
    if (d.documents.some((x) => x.processing_status === "pending" || x.processing_status === "processing")) {
      S.timers.push(setTimeout(() => { if (location.hash.startsWith("#/knowledge")) go({}); }, 6000));
    }
  }

  async function openChunks(id) {
    const langs = id.startsWith("law-") ? ["en", "fr", "rw"] : ["en"];
    const draw = async (lang) => {
      const list = await api(`documents/${id}/chunks?language=${lang}&limit=500`);
      drawer(`<h2>${esc(id)}</h2><p class="muted">How the assistant read this document: ${list.length} passages. Check them against the source.</p>
        ${langs.length > 1 ? `<div class="tabs">${langs.map((l) => `<button data-l="${l}" class="${l === lang ? "on" : ""}">${{en: "English", fr: "Français", rw: "Kinyarwanda"}[l]}</button>`).join("")}</div>` : ""}
        ${list.map((c) => `<div style="margin:14px 0"><b>${esc(c.section_ref || "")}</b> <span class="muted small">${c.page_start ? "p. " + c.page_start + (c.page_end !== c.page_start ? "-" + c.page_end : "") : ""} ${esc(c.chapter || "")}</span>
          <div class="muted small">${esc(c.heading || "")}</div><div style="white-space:pre-wrap;background:var(--surface-2);border:1px solid var(--line);border-radius:8px;padding:10px 12px;margin-top:6px;font-size:13px;line-height:20px">${esc(c.text)}</div></div>`).join("")}`);
      $$("[data-l]", $("#drawerBody")).forEach((b) => b.addEventListener("click", () => draw(b.dataset.l)));
    };
    draw("en");
  }

  // ---------------------------------------------------------------- Analytics
  async function analytics() {
    const [d, openGaps] = await Promise.all([api(`analytics/summary?days=${S.days}`), can("gaps_read") ? api("unanswered?status=open&limit=5") : []]);
    const t = d.totals, topics = topicsPanel(d.by_category, "Service Distribution", "Ranked proportion of inquiries across statutory RMB mandates");
    const fb = t.thumbs_up + t.thumbs_down;
    view().innerHTML = head("Intelligence & Regulatory Analytics", "Real-time systemic oversight, investor inquiries, and algorithmic regulatory confidence.",
      `<div class="seg" id="chips">${[[7, "7D"], [30, "30D"], [90, "3M"], [180, "6M"], [365, "Custom"]].map(([n, l]) => `<button data-d="${n}" class="${S.days === n ? "on" : ""}">${l}</button>`).join("")}</div>
       ${exportBtn()}`) +
      `<div class="cards">${stat("Total global inquiries", cnum(t.questions), `<span>${num(t.conversations)} conversations</span>`)}
        ${stat("User satisfaction", fb ? cnum(Math.round((100 * t.thumbs_up) / fb), "%") : "–",
          fb ? `<span>${T("{n} ratings", {n: num(fb)})}: <b class="pos">${T("{n} helpful", {n: num(t.thumbs_up)})}</b> · <b class="neg">${T("{n} not helpful", {n: num(t.thumbs_down)})}</b></span>`
             : `<span>${T("No ratings yet")}</span>`)}
        ${stat("Gazette law alignment", cpct(t.answer_rate), "<span>Queries answered from official gazettes &amp; documents</span>")}</div>
      <div class="grid2">${trendPanel("trend2", "Conversation Volume &amp; Intent Trajectory", "Temporal distribution of inquiries over the selected period", ["Conversations", "Questions"])}${topics.html}</div>
      <div class="grid-half"><div class="panel"><h2 class="sm">Most Cited Official Documents</h2><p class="sub">Which documents the assistant's answers rely on</p>
          ${d.top_documents.length ? `<div class="table-wrap"><table><thead><tr><th>Document</th><th style="text-align:right">Citations</th><th style="text-align:right">Share</th></tr></thead><tbody>${(() => { const tot = d.top_documents.reduce((a, x) => a + x.citations, 0) || 1; return d.top_documents.map((x) =>
            `<tr><td><b>${esc(x.document)}</b></td><td style="text-align:right">${num(x.citations)}</td><td style="text-align:right;color:var(--brand);font-weight:600">${Math.round((100 * x.citations) / tot)}%</td></tr>`).join(""); })()}</tbody></table></div>` : '<div class="empty">No citations yet</div>'}</div>
        <div class="panel"><h2 class="sm">AI Performance &amp; Retrieval Quality</h2><p class="sub">Latency profile, answer quality and gazetted knowledge gap remediation</p>
          <div class="row2"><div class="mini"><div class="k">Query latency profile</div><div class="kvrow" style="margin-top:10px"><span>Median</span><b style="color:var(--green)">${secs(t.median_latency_ms)}</b></div>
            <div class="kvrow"><span>90% of answers under</span><b>${secs(t.p90_latency_ms)}</b></div><div class="kvrow"><span>AI tokens used</span><b>${num((t.input_tokens || 0) + (t.output_tokens || 0))}</b></div></div>
            <div class="mini"><div class="k">Answered from documents</div><div class="v brand">${cpct(t.answer_rate)}</div><div class="small muted">${num(t.not_covered)} questions not covered yet</div></div></div>
          <h3 style="font-size:11px;letter-spacing:.6px;color:var(--ink-3);margin:20px 0 10px;font-weight:600">KNOWLEDGE GAPS FLAGGED FOR EDITORIAL BOARD</h3>
          ${openGaps.length ? openGaps.map((g, i) => `<div class="gap-item"><span class="warnico">${ic("exclamation-triangle", 20)}</span><div class="q"><b>${esc(g.question)}</b><span class="muted small">${esc(catLabel(g.category))} · ${rel(g.created_at)}</span></div>
            ${can("faq_write") ? `<button class="btn small primary" data-gap="${i}">${ic("plus", 14, 2)} Add Knowledge</button>` : ""}</div>`).join("") : '<div class="empty">No open gaps</div>'}</div></div>`;
    $$("#chips button").forEach((b) => b.addEventListener("click", () => { S.days = +b.dataset.d; analytics(); }));
    drawTrend("trend2", d.daily);
    topics.draw();
    $$("[data-gap]").forEach((b) => b.addEventListener("click", () => {
      const g = openGaps[+b.dataset.gap];
      S.prefill = {question: g.question, category: g.category, source_type: "gap", source_ref: String(g.id)};
      location.hash = "#/faq";
    }));
    $("#export").addEventListener("click", () => csv(`rmb-analytics-${S.days}d.csv`, [{period_days: S.days, ...t}, ...d.by_category, ...d.top_documents]));
  }

  // ---------------------------------------------------------------- Users & Roles
  async function users() {
    const d = await call("/portal/users");
    S.usersCache = d;
    const today = d.users.filter((u) => u.active && u.logged_in_today).length;
    const with2fa = d.users.filter((u) => u.active && u.totp_enabled).length;
    const active = d.users.filter((u) => u.active).length;
    view().innerHTML = head("Users & Roles", "Manage administrator accounts, staff access credentials, and role-based access for RMB internal personnel.",
      `<button class="btn primary" id="add">${ic("user-plus", 16)} Add Staff Account</button>`) +
      `<div class="cards">${stat("Directory scope", cnum(active), '<span style="color:var(--brand);font-weight:600">Active accounts</span>')}
        ${stat("Two-factor sign-in", cnum(with2fa), `<span>of ${active} active accounts${d.require_2fa ? " · required" : ""}</span>`)}
        ${stat("Session integrity", cnum(today), "<span>Logged In Today</span>")}</div>
      <div class="panel"><h2>RMB Administrative Staff Directory</h2><p class="sub">Click an account to change its role, reset its password or two-factor sign-in, or deactivate it.</p>
        <div class="table-wrap"><table><thead><tr><th>Staff member</th><th>Email address</th><th>Assigned role</th><th>Two-factor</th><th>Date added</th><th>Last login</th><th></th></tr></thead><tbody>
        ${d.users.map((u, i) => `<tr class="click" data-user="${u.id}" style="${u.active ? "" : "opacity:.55;"}animation-delay:${i * .04}s">
          <td><div class="person"><span class="avatar ${avatarClass(u.name)}">${esc(initials(u.name))}</span><b>${esc(u.name)}</b>${u.id === S.me.id ? ' <span class="pill">you</span>' : ""}</div></td>
          <td>${esc(u.email)}</td><td>${esc(d.roles[u.role] || u.role)}</td>
          <td>${u.totp_enabled ? `<span style="color:var(--green);font-weight:600;display:inline-flex;align-items:center;gap:4px;white-space:nowrap">${ic("shield-check", 16)} On</span>` : '<span class="muted">Off</span>'}</td>
          <td class="muted">${date(u.created_at)}</td>
          <td>${u.active ? (u.must_change_password ? '<span class="pill">Awaiting first sign-in</span>' : u.last_login_at ? (Date.now() - new Date(u.last_login_at) < 9e5 ? '<span style="color:var(--green);font-weight:600">Active</span>' : rel(u.last_login_at)) : '<span class="muted">never</span>') : '<span class="pill">Deactivated</span>'}</td>
          <td style="text-align:right">${ic("chevron-right", 16)}</td></tr>`).join("")}</tbody></table></div>
        <div class="pager"><span>Displaying ${active} active RMB internal administrative personnel</span></div></div>
      <div class="panel"><h2 class="sm">What each role can do</h2><div class="table-wrap"><table><thead><tr><th>Role</th><th>Access</th></tr></thead><tbody>
        <tr><td><b>Super Admin</b></td><td>Everything, including staff accounts, the audit log and assistant settings</td></tr>
        <tr><td><b>Licensing Officer</b></td><td>Documents (upload, publish, retire), FAQ answers (write and approve others'), knowledge gaps, read cases</td></tr>
        <tr><td><b>Complaints Officer</b></td><td>Cases including confidential reports, conversations, knowledge gaps, FAQ drafts</td></tr>
        <tr><td><b>Analyst</b></td><td>Read-only: dashboard, analytics, conversations, documents, non-confidential cases</td></tr>
        <tr><td><b>Support Agent</b></td><td>Non-confidential cases, knowledge gaps, FAQ drafts (cannot publish)</td></tr></tbody></table></div></div>`;
    $("#add").addEventListener("click", () => {
      modal(`<h2>Add staff account</h2><p class="muted">A temporary password is created. The person must replace it at first sign-in${d.require_2fa ? " and set up an authenticator app" : ""}.</p>
        <form id="uf"><label class="field"><span>Full name</span><input name="name" required maxlength="120"></label>
        <label class="field"><span>Email</span><input name="email" type="email" required placeholder="name@rmb.gov.rw"></label>
        <label class="field"><span>Role</span><select name="role">${Object.entries(d.roles).map(([k, l]) => `<option value="${k}" ${k === "support_agent" ? "selected" : ""}>${l}</option>`).join("")}</select></label>
        <button class="btn primary">Create account</button> <button type="button" class="btn" data-close>Cancel</button></form>`);
      $("#uf").addEventListener("submit", async (e) => {
        e.preventDefault();
        const r = await call("/portal/users", {method: "POST", json: Object.fromEntries(new FormData(e.target))});
        showTemp(r.email, r.temporary_password); users();
      });
    });
    $$("[data-user]").forEach((tr) => tr.addEventListener("click", () => openUser(+tr.dataset.user)));
  }

  function openUser(id) {
    const d = S.usersCache, u = d.users.find((x) => x.id === id);
    if (!u) return;
    if (u.id === S.me.id) { account(); return; }
    drawer(`<div class="person" style="gap:12px;margin-bottom:6px"><span class="avatar ${avatarClass(u.name)}" style="width:44px;height:44px">${esc(initials(u.name))}</span>
        <div><h2 style="margin:0">${esc(u.name)}</h2><span class="muted">${esc(u.email)}</span></div></div>
      <p class="muted small">Added ${date(u.created_at)}${u.created_by ? " by " + esc(u.created_by) : ""} · last sign-in ${u.last_login_at ? rel(u.last_login_at) : "never"}</p>
      <form id="ue" class="vstack">
        <label class="field"><span>Full name</span><input name="name" value="${esc(u.name)}" required maxlength="120"></label>
        <label class="field"><span>Role</span><select name="role">${Object.entries(d.roles).map(([k, l]) => `<option value="${k}" ${k === u.role ? "selected" : ""}>${l}</option>`).join("")}</select></label>
        <button class="btn primary">Save changes</button></form>
      <h3 class="sm" style="margin-top:22px">Security</h3>
      <dl class="kv"><dt>Status</dt><dd><b>${u.active ? "Active" : "Deactivated"}</b></dd>
        <dt>Two-factor sign-in</dt><dd><b>${u.totp_enabled ? "On (authenticator app)" : "Off"}</b></dd>
        <dt>Password</dt><dd><b>${u.must_change_password ? "Temporary, not yet replaced" : "Set by the user"}</b></dd></dl>
      <div class="vstack" style="margin-top:14px">
        <button class="btn" id="uReset">${ic("lock-closed", 16)} Reset password</button>
        ${u.totp_enabled ? `<button class="btn" id="u2fa">${ic("shield-check", 16)} Reset two-factor sign-in</button>` : ""}
        <button class="btn ${u.active ? "danger" : ""}" id="uActive">${u.active ? "Deactivate account" : "Reactivate account"}</button>
      </div>
      <p class="muted small" style="margin-top:12px">Resetting the password or two-factor sign-in, or deactivating, signs the person out everywhere immediately.</p>`);
    const patch = async (json, msg) => { const r = await call(`/portal/users/${u.id}`, {method: "PATCH", json}); toast(msg); await users(); return r; };
    $("#ue").addEventListener("submit", async (e) => {
      e.preventDefault();
      const f = Object.fromEntries(new FormData(e.target));
      const json = {};
      if (f.name.trim() !== u.name) json.name = f.name.trim();
      if (f.role !== u.role) json.role = f.role;
      if (!Object.keys(json).length) { closeDrawer(); return; }
      await patch(json, "Account updated"); closeDrawer();
    });
    $("#uReset").addEventListener("click", async () => {
      if (!await ask(T("Create a new temporary password for {name}? Their current password stops working.", {name: u.name}))) return;
      const r = await patch({reset_password: true}, "Password reset"); closeDrawer(); showTemp(u.email, r.temporary_password);
    });
    if ($("#u2fa")) $("#u2fa").addEventListener("click", async () => {
      if (!await ask(T("Remove the authenticator of {name}? Do this only after checking who is asking (e.g. a lost phone).", {name: u.name}))) return;
      await patch({reset_2fa: true}, "Two-factor sign-in reset"); closeDrawer();
    });
    $("#uActive").addEventListener("click", async () => {
      if (u.active && !await ask(T("Deactivate {name}? They are signed out and can no longer sign in.", {name: u.name}))) return;
      await patch({active: !u.active}, u.active ? "Account deactivated" : "Account reactivated"); closeDrawer();
    });
  }

  function showTemp(email, pw) {
    modal(`<h2>Temporary password</h2><p>Give it to ${email ? esc(email) : "the staff member"} through a safe channel (in person or by phone, not by email together with the address). It is shown only once; they must replace it at first sign-in.</p>
      <p class="secret">${esc(pw)}</p><button class="btn" id="copyPw">Copy</button> <button class="btn primary" data-close>Done</button>`);
    $("#copyPw").addEventListener("click", () => { navigator.clipboard && navigator.clipboard.writeText(pw).then(() => toast("Copied")); });
  }

  // ---------------------------------------------------------------- My account (password + two-factor)
  function account() {
    const m = S.me;
    modal(`<h2>My account</h2><p class="muted">${esc(m.name)} · ${esc(m.email)} · ${esc(m.role_label)}</p>
      <h3 class="sm">Password</h3>
      <form id="pf"><label class="field"><span>Current password</span><input type="password" name="current" required autocomplete="current-password"></label>
      <label class="field"><span>New password (at least 12 characters)</span><input type="password" name="new" required minlength="12" autocomplete="new-password"></label>
      <button class="btn primary">Change password</button></form>
      <h3 class="sm" style="margin-top:22px">Two-factor sign-in</h3>
      <p class="muted">${m.totp_enabled ? `<span style="color:var(--green);vertical-align:-3px">${ic("shield-check", 16)}</span> ${T("On: you enter a code from your authenticator app after your password.")}` : T("Off. Add a second step to your sign-in with an authenticator app on your phone.")}</p>
      ${m.totp_enabled ? (m.require_2fa ? '<p class="muted small">Required by RMB for all staff accounts.</p>' : '<button class="btn" id="tOff">Turn off</button>') : '<button class="btn primary" id="tOn">Set up authenticator app</button>'}
      <div style="margin-top:20px"><button type="button" class="btn" data-close>Close</button></div>`);
    $("#pf").addEventListener("submit", async (e) => {
      e.preventDefault();
      await call("/portal/password", {method: "POST", json: Object.fromEntries(new FormData(e.target))});
      closeModal(); toast("Password changed. Your other sessions were signed out.");
    });
    if ($("#tOn")) $("#tOn").addEventListener("click", () => setup2fa(false));
    if ($("#tOff")) $("#tOff").addEventListener("click", () => {
      modal(`<h2>Turn off two-factor sign-in</h2><form id="tf"><label class="field"><span>Your password</span><input type="password" name="password" required autocomplete="current-password"></label>
        <button class="btn danger">Turn off</button> <button type="button" class="btn" data-close>Cancel</button></form>`);
      $("#tf").addEventListener("submit", async (e) => {
        e.preventDefault();
        await call("/portal/2fa/disable", {method: "POST", json: Object.fromEntries(new FormData(e.target))});
        S.me.totp_enabled = false; closeModal(); toast("Two-factor sign-in turned off");
      });
    });
  }

  async function setup2fa(forced) {
    const s = await call("/portal/2fa/setup", {method: "POST", json: {}});
    modal(`<h2>Set up two-factor sign-in</h2>${forced ? '<p class="warn">RMB requires an authenticator app for every staff account.</p>' : ""}
      <ol class="steps">
        <li>Install an authenticator app on your phone: Google Authenticator, Microsoft Authenticator or Authy.</li>
        <li>In the app, add an account, choose <b>Enter a setup key</b> and type this key (time-based):
          <p class="secret" style="margin:8px 0">${esc(s.secret)}</p>
          <span class="muted small">Account name: ${esc(S.me.email)}. On this phone? <a href="${esc(s.uri)}">Open in the authenticator app</a>.</span></li>
        <li>Enter the 6-digit code the app shows:</li></ol>
      <form id="tc"><input name="code" inputmode="numeric" autocomplete="one-time-code" maxlength="7" required class="code-input" placeholder="123 456">
        <div style="margin-top:14px"><button class="btn primary">Turn on</button> ${forced ? "" : '<button type="button" class="btn" data-close>Cancel</button>'}</div></form>`);
    return new Promise((resolve) => {
      $("#tc").addEventListener("submit", async (e) => {
        e.preventDefault();
        await call("/portal/2fa/enable", {method: "POST", json: Object.fromEntries(new FormData(e.target))});
        S.me.totp_enabled = true; closeModal(); toast("Two-factor sign-in is on"); resolve();
      });
    });
  }

  function changePassword() {
    modal(`<h2>Choose your own password</h2><p class="warn">You signed in with a temporary password. Choose a password only you know.</p>
      <form id="pf"><label class="field"><span>Temporary password</span><input type="password" name="current" required autocomplete="current-password"></label>
      <label class="field"><span>New password (at least 12 characters, not containing your name)</span><input type="password" name="new" required minlength="12" autocomplete="new-password"></label>
      <button class="btn primary">Save</button></form>`);
    return new Promise((resolve) => {
      $("#pf").addEventListener("submit", async (e) => {
        e.preventDefault();
        await call("/portal/password", {method: "POST", json: Object.fromEntries(new FormData(e.target))});
        closeModal(); toast("Password changed"); resolve();
      });
    });
  }

  // ---------------------------------------------------------------- Audit log
  const AUDIT_LABELS = {login: "Signed in", login_failed: "Failed sign-in", logout: "Signed out", user_created: "Account created",
    user_updated: "Account edited", role_changed: "Role changed", user_activated: "Account reactivated", user_deactivated: "Account deactivated",
    password_reset: "Password reset", password_changed: "Password changed", password_change_failed: "Wrong current password",
    "2fa_enabled": "Two-factor turned on", "2fa_disabled": "Two-factor turned off", "2fa_reset": "Two-factor reset", api_change: "Change"};
  async function audit(params = {}) {
    const page = +params.page || 0, q = params.q || "";
    const d = await call(`/portal/audit?page=${page + 1}&q=${encodeURIComponent(q)}`);
    const pg = pager(d.total, page, d.page_size, (p) => { location.hash = `#/audit?page=${p}&q=${encodeURIComponent(q)}`; }, "audit entries");
    view().innerHTML = head("Audit log", "Every sign-in, account change and change made through this portal: who, what and when.") +
      `<div class="panel"><form id="af" class="audit-filter"><input name="q" value="${esc(q)}" placeholder="Filter by email, action or page…" style="flex:1">
        <button class="btn">${ic("funnel", 16)} Filter</button></form>
      <div class="table-wrap"><table><thead><tr><th>When</th><th>Staff member</th><th>Action</th><th>Details</th><th>Result</th></tr></thead><tbody>
      ${d.items.map((a) => `<tr><td style="white-space:nowrap">${stamp(a.created_at)}</td><td>${esc(a.user_email)}</td>
        <td><b class="${/failed/.test(a.action) ? "danger-text" : ""}">${esc(AUDIT_LABELS[a.action] || a.action)}</b></td>
        <td class="muted">${esc(a.action === "api_change" ? `${a.method} ${a.path}` : a.detail || "")}</td>
        <td>${a.status ? (a.status < 400 ? '<span style="color:var(--green)">OK</span>' : `<span class="danger-text">${a.status}</span>`) : ""}</td></tr>`).join("")
        || '<tr><td colspan="5" class="empty">Nothing recorded yet.</td></tr>'}</tbody></table></div>
      ${pg.html}</div>`;
    pg.bind(view());
    $("#af").addEventListener("submit", (e) => { e.preventDefault(); location.hash = `#/audit?q=${encodeURIComponent(new FormData(e.target).get("q"))}`; });
  }

  // ---------------------------------------------------------------- Settings
  async function settings() {
    const d = await api("settings");
    const s = d.editable, ro = d.read_only, edit = can("settings_write"), dis = edit ? "" : "disabled";
    const LN = {en: "English", fr: "Français", rw: "Ikinyarwanda"};
    const floor = s.min_vector_score;
    view().innerHTML = head("Institutional Settings", "Real-time systemic oversight of the assistant on rmb.gov.rw. Its grounding and safety rules are fixed in code and cannot be changed here.",
      edit ? `<button class="btn" id="reset">Reset</button><button class="btn primary" id="save">Save All</button>` : '<span class="muted small">Read-only for your role</span>') +
      `<div class="grid-half"><div class="panel"><h2 class="sm">Section A: AI Model &amp; Inference Engine</h2><p class="sub">Runtime parameters and citation strictness</p>
          <div class="range-box"><div class="kvrow"><b>Classification Confidence Floor</b><span class="small muted">${floor == null ? "default" : "custom"}</span></div>
            <input type="range" id="floor" min="0.70" max="0.92" step="0.01" value="${floor == null ? ro.default_min_vector_score : floor}" ${floor == null || !edit ? "disabled" : ""}>
            <div class="small" style="display:flex;justify-content:space-between;color:var(--ink-3)"><span>0.70 (answers more)</span><b id="floorVal" style="color:var(--ink)">${floor == null ? ro.default_min_vector_score : floor}</b><span>0.92 (stricter)</span></div>
            <p class="small muted" style="margin:10px 0 6px">Queries below this similarity are answered “not covered” and flagged for RMB knowledge-gap review.</p>
            <label class="small"><input type="checkbox" id="floorDefault" ${floor == null ? "checked" : ""} ${dis}> Use the default (${ro.default_min_vector_score})</label></div>
          <label class="field"><span>System Persona (tone preferences)</span><textarea id="persona" maxlength="2000" rows="5" ${dis} placeholder="e.g. Address users politely; prefer short answers for artisanal miners.">${esc(s.persona_note || "")}</textarea>
            <div class="hint" style="display:flex;justify-content:space-between"><span>Tone only: cannot override the statutory rules (official documents only, cite sources, never guess fees).</span><span id="pcount">${(s.persona_note || "").length} / 2,000</span></div></label>
          <dl class="kv"><dt>Answer model</dt><dd>${esc(ro.answer_model)}</dd><dt>Classifier</dt><dd>${esc(ro.router_model)}</dd><dt>Search model</dt><dd>${esc(ro.embedding_model)}</dd>
            <dt>Rate limit</dt><dd>${esc(ro.rate_limit_per_minute)} messages / minute per visitor</dd></dl></div>
        <div class="panel"><h2 class="sm">Section B: Branding &amp; Persona</h2><p class="sub">Citizen-facing presence on rmb.gov.rw</p>
          <div class="toggle"><div><b>Public Web Widget Status</b><div class="muted">Embedding on rmb.gov.rw portal</div></div>
            <label class="switch"><input type="checkbox" id="enabled" ${s.widget_enabled ? "checked" : ""} ${dis}><span></span></label></div>
          <label class="field"><span>Assistant Public Display Name</span><input id="aname" value="${esc(s.assistant_name)}" ${dis}></label>
          <div class="tabs" id="langTabs">${ro.answer_languages.map((l, i) => `<button data-l="${l}" class="${i ? "" : "on"}">${LN[l] || l}</button>`).join("")}</div>
          ${ro.answer_languages.map((l, i) => `<div data-lp="${l}" ${i ? "hidden" : ""}>
            <label class="field"><span>Welcome Message Greeting</span><textarea data-welcome="${l}" rows="3" ${dis}>${esc((s.welcome_message || {})[l] || "")}</textarea></label>
            <label class="field"><span>Suggested questions (one per line)</span><textarea data-sugg="${l}" rows="4" ${dis}>${esc(((s.suggestions || {})[l] || []).join("\n"))}</textarea></label></div>`).join("")}
          <div class="field"><span>Supported Public Languages</span>${ro.answer_languages.map((l, i) => `<div class="toggle" style="padding:12px 16px;margin-bottom:8px"><span>${LN[l] || l}</span><b class="small" style="color:var(--brand);letter-spacing:.6px">${i ? "ACTIVE" : "DEFAULT"}</b></div>`).join("")}</div></div></div>
      <div class="grid-half"><div class="panel"><h2 class="sm">Section C: Emergency &amp; Contact Rules</h2><p class="sub">Shown instantly for accidents, collapses and spills</p>
          <div id="emerg">${(s.emergency_contacts || []).map((c) => emergRow(c, dis)).join("")}</div>
          ${edit ? `<button class="btn small" id="addEmerg">${ic("plus", 14, 2)} Add contact</button>` : ""}
          <h3 style="font-size:14px;margin:20px 0 10px">RMB contacts</h3>
          <div class="row2">${["email", "phone", "toll_free", "website"].map((k) => `<label class="field"><span>${k.replace("_", " ").replace(/^./, (m) => m.toUpperCase())}</span><input data-contact="${k}" value="${esc((s.rmb_contacts || {})[k] || "")}" ${dis}></label>`).join("")}</div>
          <label class="field"><span>Address</span><input data-contact="address" value="${esc((s.rmb_contacts || {}).address || "")}" ${dis}></label></div>
        <div class="panel"><h2 class="sm">Section D: Security &amp; Audit</h2><p class="sub">Statutory data governance and access control</p>
          <div class="toggle"><div><b>Session Inactivity Timeout</b><div class="muted">Forces re-authentication</div></div><b>${S.me.session_minutes} minutes inactivity</b></div>
          <div class="toggle"><div><b>Two-Factor Authentication (2FA)</b><div class="muted">Authenticator app code (Google Authenticator, Microsoft Authenticator, Authy) after the password</div></div>${S.me.require_2fa ? '<span class="pill green">REQUIRED FOR ALL STAFF</span>' : '<span class="pill amber">OPTIONAL</span>'}</div>
          <div class="toggle"><div><b>Login protection</b><div class="muted">Lockout after 5 failed attempts in 15 minutes</div></div><span class="pill green">ACTIVE</span></div>
          <div class="toggle"><div><b>Admin API isolation</b><div class="muted">The admin key stays on the server; the public website cannot reach admin endpoints</div></div><span class="pill green">ACTIVE</span></div>
          <div class="toggle" style="display:block"><b>Data Privacy Certification</b><div class="muted" style="margin-top:4px">Visitor IP addresses are never stored (only a salted hash for rate limiting). Anonymous reports keep no contact details.
            Compliance with Law N° 058/2021 relating to the protection of personal data and privacy to be confirmed by RMB's legal and ICT teams.</div></div></div></div>`;
    const floorBox = $("#floor"), floorDef = $("#floorDefault");
    floorBox.addEventListener("input", () => { $("#floorVal").textContent = floorBox.value; });
    floorDef.addEventListener("change", () => { floorBox.disabled = floorDef.checked || !edit; $("#floorVal").textContent = floorDef.checked ? ro.default_min_vector_score : floorBox.value; });
    $("#persona").addEventListener("input", (e) => { $("#pcount").textContent = `${e.target.value.length} / 2,000`; });
    $$("#langTabs button").forEach((b) => b.addEventListener("click", () => {
      $$("#langTabs button").forEach((x) => x.classList.toggle("on", x === b));
      $$("[data-lp]").forEach((p) => { p.hidden = p.dataset.lp !== b.dataset.l; });
    }));
    const bindRemove = () => $$("[data-rm]").forEach((b) => { b.onclick = () => b.closest(".emerg-row").remove(); });
    bindRemove();
    const ae = $("#addEmerg");
    if (ae) ae.addEventListener("click", () => { $("#emerg").insertAdjacentHTML("beforeend", emergRow({label: "", value: ""}, "")); bindRemove(); });
    if (!edit) return;
    $("#reset").addEventListener("click", settings);
    $("#save").addEventListener("click", async () => {
      const welcome = {}, sugg = {};
      $$("[data-welcome]").forEach((t) => { if (t.value.trim()) welcome[t.dataset.welcome] = t.value.trim(); });
      $$("[data-sugg]").forEach((t) => { const v = t.value.split("\n").map((x) => x.trim()).filter(Boolean); if (v.length) sugg[t.dataset.sugg] = v; });
      const contacts = {...(s.rmb_contacts || {})};
      $$("[data-contact]").forEach((i) => { contacts[i.dataset.contact] = i.value.trim(); });
      const emergency = $$(".emerg-row").map((r) => ({label: $("[data-k=label]", r).value.trim(), value: $("[data-k=value]", r).value.trim(), placeholder: $("[data-k=ph]", r).checked}))
        .filter((c) => c.label && c.value);
      const values = {
        min_vector_score: floorDef.checked ? null : +floorBox.value, persona_note: $("#persona").value,
        widget_enabled: $("#enabled").checked, assistant_name: $("#aname").value.trim() || "Baza-RMB",
        welcome_message: welcome, suggestions: sugg, rmb_contacts: contacts, emergency_contacts: emergency,
      };
      await api("settings", {method: "PUT", json: {values}});
      toast("Settings saved: live on the website within 30 seconds");
    });
  }
  const emergRow = (c, dis) => `<div class="emerg-row row3" style="grid-template-columns:2fr 1fr auto;align-items:end">
    <label class="field"><span>Label</span><input data-k="label" value="${esc(c.label)}" ${dis}></label>
    <label class="field"><span>Number</span><input data-k="value" value="${esc(c.value)}" ${dis}></label>
    <div class="field" style="display:flex;gap:8px;align-items:center;height:42px"><label class="small"><input type="checkbox" data-k="ph" ${c.placeholder ? "checked" : ""} ${dis}> example</label>${dis ? "" : `<button type="button" class="icon-btn" data-rm aria-label="Remove">${ic("x-mark", 16)}</button>`}</div></div>`;

  // ---------------------------------------------------------------- notifications & counts
  // Badges count what this staff member has not seen yet: opening Cases clears the Cases badge, opening
  // Knowledge gaps clears that one, opening the bell clears the bell. "Seen" is remembered per staff member
  // in this browser, as the time of the newest item seen (server time, so clock differences do not matter).
  const POLL_MS = 15000;
  const seenKey = () => `baza.seen.${S.me.id}`;
  function seenGet() { try { return JSON.parse(localStorage.getItem(seenKey()) || "{}") || {}; } catch (e) { return S.seenMem || {}; } }
  function seenSet(v) { S.seenMem = v; try { localStorage.setItem(seenKey(), JSON.stringify(v)); } catch (e) { /* private mode */ } }
  const newest = (list) => list.reduce((m, x) => (x.created_at > m ? x.created_at : m), "");
  function markSeen(...kinds) {
    const s = seenGet(), feed = S.feed || {cases: [], gaps: []};
    for (const k of kinds) {
      const latest = k === "bell" ? [newest(feed.cases), newest(feed.gaps)].sort().pop() : newest(feed[k] || []);
      if (latest && latest > (s[k] || "")) s[k] = latest;
    }
    seenSet(s); updateBadges();
  }
  const isUnseen = (x, kind, s) => x.created_at > (s[kind] || "");

  function updateBadges() {
    const feed = S.feed; if (!feed) return;
    const s = seenGet();
    const newCases = feed.cases.filter((c) => isUnseen(c, "cases", s)), newGaps = feed.gaps.filter((g) => isUnseen(g, "gaps", s));
    S.badge = {cases: newCases.length, gaps: newGaps.length};
    const bellN = newCases.filter((c) => isUnseen(c, "bell", s)).length + newGaps.filter((g) => isUnseen(g, "bell", s)).length;
    $("#bellCount").hidden = !bellN; $("#bellCount").textContent = bellN > 99 ? "99+" : bellN;
    for (const k of ["cases", "gaps"]) {
      const a = $(`#nav a[data-route="${k}"]`); if (!a) continue;
      let el = $(".count", a);
      if (!S.badge[k]) { if (el) el.remove(); continue; }
      if (!el) { el = document.createElement("span"); el.className = "count"; a.appendChild(el); }
      el.textContent = S.badge[k] > 99 ? "99+" : S.badge[k];
    }
    if (!$("#notif").hidden) renderBell();
  }

  async function refreshCounts() {
    if (!S.me || S.me.restriction) return;
    try {
      const [cs, gs] = await Promise.all([can("cases_read") ? api("cases?relevance=inbox&status=new&limit=100") : [],
                                          can("gaps_read") ? api("unanswered?status=open&limit=500") : []]);
      const before = S.feed;
      S.feed = {cases: cs, gaps: gs, at: Date.now()};
      const page = (location.hash.slice(2).split(/[/?]/)[0] || "dashboard");
      if (page === "cases" || page === "gaps") markSeen(page);
      if (before) {
        // Only items created since the last check (a reopened old question is not "new").
        const lastC = newest(before.cases), lastG = newest(before.gaps);
        const fresh = [...cs.filter((c) => c.created_at > lastC), ...gs.filter((g) => g.created_at > lastG)];
        if (fresh.length) {
          const urgent = fresh.find((c) => c.triage_priority === "urgent");
          toast(urgent ? T("New urgent case: {s}", {s: urgent.summary}) : T("{n} new item(s): see the bell", {n: fresh.length}), 6000);
          liveRerender(page, fresh);
        }
      }
      updateBadges();
    } catch (e) { /* non-blocking */ }
  }

  /** New items arrived while their page is open: redraw it in place (not while a dialog is open). */
  function liveRerender(page, fresh) {
    if (!$("#drawer").hidden || !$("#modal").hidden) return;
    const hasCase = fresh.some((x) => x.reference_number), hasGap = fresh.some((x) => x.question !== undefined && !x.reference_number);
    if ((page === "cases" && hasCase) || (page === "gaps" && hasGap) || page === "dashboard") route(true);
  }

  function renderBell() {
    const feed = S.feed || {cases: [], gaps: []}, s = {...seenGet()};
    if (S.bellOpenedAt != null) s.bell = S.bellOpenedAt;  // keep highlighting what was unread when the list was opened
    const items = [
      ...feed.cases.map((c) => ({at: c.created_at, unread: isUnseen(c, "bell", s) && isUnseen(c, "cases", s), href: "#/cases", ref: c.reference_number,
        icon: c.triage_priority === "urgent" ? "exclamation-triangle" : "briefcase", cls: c.triage_priority === "urgent" ? "red" : "",
        title: (c.triage_priority === "urgent" ? T("Urgent") + " · " : "") + T(CASE_TYPE[c.type] || c.type), text: c.summary})),
      ...feed.gaps.map((g) => ({at: g.created_at, unread: isUnseen(g, "bell", s) && isUnseen(g, "gaps", s), href: "#/gaps",
        icon: "question-mark-circle", cls: "amber", title: T("Unanswered question"), text: g.question})),
    ].sort((a, b) => (b.unread - a.unread) || b.at.localeCompare(a.at)).slice(0, 8);
    const unread = items.filter((x) => x.unread).length;
    $("#notif").innerHTML = `<div class="notif-head"><b>${T("Notifications")}</b>${unread ? `<button class="link" id="notifRead">${T("Mark all as read")}</button>` : ""}</div>
      <div class="notif-list">${items.map((x, i) => `<a href="${x.href}" data-n="${i}" class="${x.unread ? "unread" : ""}"><span class="n-ico ${x.cls}">${ic(x.icon, 18)}</span>
        <span class="n-txt"><b>${esc(x.title)}</b><span data-notr>${esc(x.text)}</span><small>${rel(x.at)}</small></span></a>`).join("")
        || `<div class="empty">${T("No new notifications")}</div>`}</div>
      <div class="notif-foot">${can("cases_read") ? `<a href="#/cases">${T("All cases")}</a>` : ""}${can("gaps_read") ? `<a href="#/gaps">${T("Knowledge gaps")}</a>` : ""}</div>`;
    $$("#notif a[data-n]").forEach((a) => a.addEventListener("click", (e) => {
      const x = items[+a.dataset.n];
      if (x.ref) { e.preventDefault(); $("#notif").hidden = true; location.hash = "#/cases"; setTimeout(() => openCase(x.ref), 300); }
    }));
    const rd = $("#notifRead");
    if (rd) rd.addEventListener("click", (e) => { e.stopPropagation(); markSeen("bell", "cases", "gaps"); S.bellOpenedAt = seenGet().bell; renderBell(); });
  }

  // ---------------------------------------------------------------- router & boot
  /** Draw the page for the current #hash. silent = live refresh: no skeleton, no animation, keep the scroll position. */
  async function route(silent = false) {
    if (silent !== true) silent = false;  // hashchange passes an Event
    S.timers.forEach(clearTimeout); S.timers = [];
    if (!silent) closeDrawer();
    const [path, qs] = (location.hash.slice(2) || "dashboard").split("?");
    const [id, sub] = path.split("/");
    const r = ROUTES.find((x) => x.id === id && can(x.cap)) || ROUTES.find((x) => can(x.cap));
    S.convOpen = r.id === "conversations";  // Figma: sub-menu open only inside Conversations
    renderNav(r.id, sub);
    if (r.id === "cases" || r.id === "gaps") markSeen(r.id);
    const v = view(), y = window.scrollY;
    if (!silent) {
      v.classList.remove("view-enter");
      v.innerHTML = '<div class="skeleton" style="height:64px;width:50%"></div><div class="cards"><div class="skeleton"></div><div class="skeleton"></div><div class="skeleton"></div></div><div class="skeleton" style="height:280px"></div>';
    }
    try {
      await r.render({...Object.fromEntries(new URLSearchParams(qs || "")), ...(sub ? {sub} : {})});
      if (!silent) { void v.offsetWidth; v.classList.add("view-enter"); countUp(v); }
    } catch (e) {
      v.innerHTML = `<div class="alert">${esc(e.message)}</div>`;
    }
    if (silent) { window.scrollTo(0, y); return; }
    v.focus({preventScroll: true});
    window.scrollTo({top: 0, behavior: "instant" in window ? "instant" : "auto"});
  }

  async function boot() {
    S.me = await call("/portal/me");
    $("#userName").textContent = S.me.name; $("#userRole").textContent = S.me.role_label;
    $("#topAvatar").textContent = $("#sideAvatar").textContent = initials(S.me.name);
    $("#logoutCsrf").value = S.me.csrf;
    $("#topAvatar").title = "My account: password and two-factor sign-in"; $("#topAvatar").style.cursor = "pointer";
    $("#topAvatar").addEventListener("click", () => { if (!S.me.restriction) account(); });
    $("#drawer").addEventListener("click", (e) => { if (e.target.id === "drawer") closeDrawer(); });
    $("#drawerClose").addEventListener("click", closeDrawer);
    $("#modal").addEventListener("click", (e) => { if (e.target.id === "modal" || e.target.closest("[data-close]")) { if (!S.me.restriction) closeModal(); } });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") { closeDrawer(); if (!S.me.restriction) closeModal(); $("#notif").hidden = true; }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") { e.preventDefault(); $("#searchInput").focus(); }
    });
    $("#search").addEventListener("submit", (e) => {
      e.preventDefault();
      const q = $("#searchInput").value.trim();
      if (/^RMB-\d{4}-[A-Z0-9]{6}$/i.test(q) && can("cases_read")) openCase(q.toUpperCase());
      else if (can("conversations")) location.hash = "#/conversations?q=" + encodeURIComponent(q);
    });
    $("#bell").addEventListener("click", (e) => {
      e.stopPropagation();
      const n = $("#notif");
      $("#langMenu").hidden = true;
      if (!n.hidden) { n.hidden = true; return; }
      S.bellOpenedAt = seenGet().bell || "";
      renderBell(); n.hidden = false;
      markSeen("bell");  // the badge clears; unread items stay highlighted while the list is open
      refreshCounts();
    });
    $("#notif").addEventListener("click", (e) => { if (!e.target.closest("a")) e.stopPropagation(); });
    document.addEventListener("click", () => { $("#notif").hidden = true; $("#langMenu").hidden = true; S.bellOpenedAt = null; });

    // Language of the portal (English, French, Kinyarwanda): remembered in this browser.
    const lang = window.I18N ? window.I18N.lang : "en";
    $("#langBtn").innerHTML = `${ic("language", 16)} ${lang.toUpperCase()} ${ic("chevron-down", 12, 2)}`;
    $("#langMenu").innerHTML = [["en", "English"], ["fr", "Français"], ["rw", "Ikinyarwanda"]].map(([k, l]) =>
      `<button type="button" data-lang="${k}" class="${k === lang ? "on" : ""}" role="menuitemradio" aria-checked="${k === lang}"><b>${k.toUpperCase()}</b> ${l}</button>`).join("");
    $("#langBtn").addEventListener("click", (e) => { e.stopPropagation(); $("#notif").hidden = true; $("#langMenu").hidden = !$("#langMenu").hidden; });
    $$("#langMenu [data-lang]").forEach((b) => b.addEventListener("click", () => { if (window.I18N) window.I18N.set(b.dataset.lang); }));

    // Sign out: ask first.
    $("#logoutForm").addEventListener("submit", async (e) => {
      if ($("#logoutForm").dataset.ok) return;
      e.preventDefault();
      if (await confirmBox("Sign out?", "Are you sure you want to sign out of the staff portal?", "Sign out", true)) {
        $("#logoutForm").dataset.ok = "1"; $("#logoutForm").submit();
      }
    });
    // Unfinished account set-up (temporary password, or 2FA required): finish it before anything else.
    while (S.me.restriction) {
      view().innerHTML = "";
      if (S.me.restriction === "change_password") await changePassword(); else await setup2fa(true);
      S.me = await call("/portal/me");
    }
    window.addEventListener("hashchange", route);
    await refreshCounts();
    await route();
    // Near real time: check for new cases and questions every 15 s while the tab is visible, and at once on return.
    setInterval(() => { if (!document.hidden) refreshCounts(); }, POLL_MS);
    document.addEventListener("visibilitychange", () => { if (!document.hidden) refreshCounts(); });
  }

  boot().catch((e) => { view().innerHTML = `<div class="alert">${esc(e.message)}</div>`; });
})();
