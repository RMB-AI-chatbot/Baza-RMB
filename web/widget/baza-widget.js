/*!
 * baza-RMB chat widget (Figma: "RMB AI Assistant" floating panel)
 *
 * Embed on any page, no build step:
 *   <script src="/widget/baza-widget.js" data-api-base="/api/v1" data-lang="en" defer></script>
 *
 * - Shadow DOM: the host site's CSS cannot affect the widget (and vice versa).
 * - Streams answers (Server-Sent Events over fetch), renders citations, sources, disclaimer,
 *   forms (complaints, reports, requests), emergency contacts and feedback.
 * - The conversation survives page navigation within the tab (sessionStorage), not across visits.
 * API contract: docs/FRONTEND_INTEGRATION.md
 */
(() => {
  "use strict";
  if (customElements.get("baza-rmb-widget")) return;

  const script = document.currentScript;
  const CFG = {
    apiBase: (script && script.dataset.apiBase) || "/api/v1",
    lang: (script && script.dataset.lang) || (document.documentElement.lang || "en").slice(0, 2),
  };
  const STORE_KEY = "baza-rmb-widget-v1";

  // ------------------------------------------------------------------ UI texts
  // FR/RW drafts: to be reviewed by RMB's translators.
  const UI = {
    en: {
      org: "Rwanda Mines, Petroleum and Gas Board", sub: "AI Assistant", ask: "Here are some things you can ask me:",
      placeholder: "Type your message...", footer: "AI can make mistakes. Please verify from official resources.",
      hello: "Hi 👋 I'm", open: "Open the RMB assistant", close: "Close the assistant", send: "Send", language: "Language", newChat: "New conversation",
      sources: "Sources", helpful: "Was this helpful?", thanks: "Thank you for your feedback.",
      anonymous: "Stay anonymous", confidential: "Your report is confidential.", submit: "Submit", check: "Check status",
      sending: "Sending…", required: "Please fill in the required fields.", copy: "Copy", copied: "Copied",
      emergency: "Emergency contacts", example: "example", error: "The assistant is unavailable right now. Please try again later, or contact RMB:",
      status: {new: "Received", assigned: "Assigned to an officer", in_progress: "In progress", waiting_for_user: "Waiting for your reply",
               resolved: "Resolved", closed: "Closed"},
      statusLine: "Status", routed: "Handled by", tooLong: "Your message is too long (2000 characters maximum).",
    },
    fr: {
      org: "Office rwandais des mines, du pétrole et du gaz", sub: "Assistant IA", ask: "Voici quelques questions que vous pouvez me poser :",
      placeholder: "Écrivez votre message...", footer: "L'IA peut se tromper. Vérifiez auprès des sources officielles.",
      hello: "Bonjour 👋 je suis", open: "Ouvrir l'assistant RMB", close: "Fermer l'assistant", send: "Envoyer", language: "Langue", newChat: "Nouvelle conversation",
      sources: "Sources", helpful: "Cette réponse vous a-t-elle aidé ?", thanks: "Merci pour votre avis.",
      anonymous: "Rester anonyme", confidential: "Votre signalement est confidentiel.", submit: "Envoyer", check: "Vérifier",
      sending: "Envoi…", required: "Veuillez remplir les champs obligatoires.", copy: "Copier", copied: "Copié",
      emergency: "Contacts d'urgence", example: "exemple", error: "L'assistant est indisponible pour le moment. Réessayez plus tard ou contactez RMB :",
      status: {new: "Reçue", assigned: "Attribuée à un agent", in_progress: "En cours", waiting_for_user: "En attente de votre réponse",
               resolved: "Résolue", closed: "Clôturée"},
      statusLine: "État", routed: "Traitée par", tooLong: "Votre message est trop long (2000 caractères maximum).",
    },
    rw: {
      org: "Urwego rw'Igihugu rushinzwe Mine, Peteroli na Gaz", sub: "Umufasha wa AI", ask: "Dore ibyo ushobora kumbaza:",
      placeholder: "Andika ubutumwa bwawe...", footer: "AI ishobora kwibeshya. Genzura mu nyandiko z'ubuyobozi.",
      hello: "Muraho 👋 ndi", open: "Fungura umufasha wa RMB", close: "Funga umufasha", send: "Ohereza", language: "Ururimi", newChat: "Ikiganiro gishya",
      sources: "Aho byavuye", helpful: "Iki gisubizo cyagufashije?", thanks: "Murakoze ku gitekerezo cyanyu.",
      anonymous: "Ntushaka kumenyekana", confidential: "Amakuru utanze ni ibanga.", submit: "Ohereza", check: "Reba",
      sending: "Biroherezwa…", required: "Uzuza ibisabwa byose.", copy: "Kopiya", copied: "Byakopowe",
      emergency: "Nimero z'ubutabazi", example: "urugero", error: "Umufasha ntaboneka ubu. Ongera ugerageze nyuma cyangwa uvugane na RMB:",
      status: {new: "Byakiriwe", assigned: "Byahawe umukozi", in_progress: "Birimo gukorwa", waiting_for_user: "Turategereje igisubizo cyawe",
               resolved: "Byakemutse", closed: "Byarangiye"},
      statusLine: "Aho bigeze", routed: "Bikurikiranwa na", tooLong: "Ubutumwa bwawe ni burebure cyane (inyuguti 2000 ntarengwa).",
    },
  };
  const LANG_NAMES = {en: "English", fr: "Français", rw: "Kinyarwanda"};

  // ------------------------------------------------------------------ icons (inline SVG, stroke = currentColor)
  // Heroicons v2 outline (Tailwind Labs, MIT): https://heroicons.com
  const svg = (d, s = 20, sw = 1.5) => `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${d}"/></svg>`;
  const H = {
    x: "M6 18 18 6M6 6l12 12",
    send: "M6 12 3.269 3.125A59.769 59.769 0 0 1 21.485 12 59.768 59.768 0 0 1 3.27 20.875L5.999 12Zm0 0h7.5",
    globe: "M12 21a9.004 9.004 0 0 0 8.716-6.747M12 21a9.004 9.004 0 0 1-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 0 1 7.843 4.582M12 3a8.997 8.997 0 0 0-7.843 4.582m15.686 0A11.953 11.953 0 0 1 12 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0 1 21 12c0 .778-.099 1.533-.284 2.253m0 0A17.919 17.919 0 0 1 12 16.5c-3.162 0-6.133-.815-8.716-2.247m0 0A9.015 9.015 0 0 1 3 12c0-1.605.42-3.113 1.157-4.418",
    chevron: "m19.5 8.25-7.5 7.5-7.5-7.5",
    refresh: "M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99",
    doc: "M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z",
    shield: "M9 12.75 11.25 15 15 9.75m-3-7.036A11.959 11.959 0 0 1 3.598 6 11.99 11.99 0 0 0 3 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285Z",
    book: "M12 6.042A8.967 8.967 0 0 0 6 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 0 1 6 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 0 1 6-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0 0 18 18a8.967 8.967 0 0 0-6 2.292m0-14.25v14.25",
    chart: "M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 0 1 3 19.875v-6.75ZM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V8.625ZM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V4.125Z",
    phone: "M2.25 6.75c0 8.284 6.716 15 15 15h2.25a2.25 2.25 0 0 0 2.25-2.25v-1.372c0-.516-.351-.966-.852-1.091l-4.423-1.106c-.44-.11-.902.055-1.173.417l-.97 1.293c-.282.376-.769.542-1.21.38a12.035 12.035 0 0 1-7.143-7.143c-.162-.441.004-.928.38-1.21l1.293-.97c.363-.271.527-.734.417-1.173L6.963 3.102a1.125 1.125 0 0 0-1.091-.852H4.5A2.25 2.25 0 0 0 2.25 4.5v2.25Z",
    thumb: "M6.633 10.25c.806 0 1.533-.446 2.031-1.08a9.041 9.041 0 0 1 2.861-2.4c.723-.384 1.35-.956 1.653-1.715a4.498 4.498 0 0 0 .322-1.672V2.75a.75.75 0 0 1 .75-.75 2.25 2.25 0 0 1 2.25 2.25c0 1.152-.26 2.243-.723 3.218-.266.558.107 1.282.725 1.282m0 0h3.126c1.026 0 1.945.694 2.054 1.715.045.422.068.85.068 1.285a11.95 11.95 0 0 1-2.649 7.521c-.388.482-.987.729-1.605.729H13.48c-.483 0-.964-.078-1.423-.23l-3.114-1.04a4.501 4.501 0 0 0-1.423-.23H5.904m10.598-9.75H14.25M5.904 18.5c.083.205.173.405.27.602.197.4-.078.898-.523.898h-.908c-.889 0-1.713-.518-1.972-1.368a12 12 0 0 1-.521-3.507c0-1.553.295-3.036.831-4.398C3.387 9.953 4.167 9.5 5 9.5h1.053c.472 0 .745.556.5.96a8.958 8.958 0 0 0-1.302 4.665c0 1.194.232 2.333.654 3.375Z",
    alert: "M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z",
  };
  const ICON = {
    // Heroicons has no headset icon; this one is drawn to match the Figma launcher.
    headset: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 14v-2a8 8 0 0 1 16 0v2"/><rect x="3" y="14" width="4" height="6" rx="1.5"/><rect x="17" y="14" width="4" height="6" rx="1.5"/><path d="M19 20a4 4 0 0 1-4 2h-2"/></svg>`,
    close: svg(H.x, 22, 1.8), send: svg(H.send, 16, 1.8), globe: svg(H.globe, 19), chevron: svg(H.chevron, 12, 2), refresh: svg(H.refresh, 17),
    doc: svg(H.doc, 18), shield: svg(H.shield, 18), book: svg(H.book, 18), chart: svg(H.chart, 18), phone: svg(H.phone, 16),
    up: svg(H.thumb, 15), down: `<span style="display:inline-flex;transform:rotate(180deg)">${svg(H.thumb, 15)}</span>`, alert: svg(H.alert, 18),
  };
  // RMB mark drawn inline: the white version sits on the blue launcher (Figma), the blue one is the
  // fallback when the official logo file (rmb-logo.png next to this script, or data-logo) is missing.
  const mark = (gear, inner) => `<svg viewBox="0 0 48 48" width="100%" height="100%" aria-hidden="true">
    <g fill="none" stroke="${gear}" stroke-width="3.2" stroke-linecap="round">
      ${Array.from({length: 10}, (_, i) => { const a = (i * 36 - 90) * Math.PI / 180;
        return `<line x1="${24 + 17 * Math.cos(a)}" y1="${24 + 17 * Math.sin(a)}" x2="${24 + 21 * Math.cos(a)}" y2="${24 + 21 * Math.sin(a)}"/>`; }).join("")}
      <circle cx="24" cy="24" r="14.5"/></g>
    <path d="M24 13c4 5 7 8 7 13a7 7 0 0 1-14 0c0-3 1.5-5 3-6.5.3 2.2 1.2 3.5 2.5 4-.6-4 0-7.5 1.5-10.5z" fill="#f08a24"/>
    <path d="M24 23c1.8 2 3 3.4 3 5.2a3 3 0 0 1-6 0c0-1.6 1.2-3 3-5.2z" fill="${inner}"/></svg>`;
  const LOGO_SVG = mark("#2a9fd8", "#fff"), LOGO_WHITE = mark("#fff", "#1670e0");
  const LOGO_URL = (script && script.dataset.logo) || (script && script.src ? new URL("rmb-logo.png", script.src).href : "");
  const LOGO_WHITE_URL = (script && script.dataset.logoWhite) || (script && script.src ? new URL("rmb-logo-white.png", script.src).href : "");
  const img = (url, cls) => `<img class="${cls}" src="${url.replace(/[<>"]/g, encodeURIComponent)}" alt="">`;
  const LOGO = LOGO_URL ? img(LOGO_URL, "mark") : LOGO_SVG;
  // Launcher shape: circle with a speech-bubble tail at the bottom right (Figma), blue gradient.
  const BUBBLE = `<svg class="bub" viewBox="0 0 50 48.48" aria-hidden="true"><defs><linearGradient id="bzg" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="#2b95f6"/><stop offset="1" stop-color="#0a4fd1"/></linearGradient></defs>
    <path fill="url(#bzg)" d="M24 0.5a23.5 23.5 0 1 0 15.6 41.1L49.5 48 44.35 35.75A23.5 23.5 0 0 0 24 0.5z"/></svg>`;
  const LAUNCHER_LOGO =LOGO_WHITE_URL ? img(LOGO_WHITE_URL, "mark white") : LOGO_WHITE;

  if (!document.querySelector("link[data-baza-font]")) {
    const l = document.createElement("link");
    l.rel = "stylesheet"; l.dataset.bazaFont = "1";
    l.href = "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap";
    document.head.appendChild(l);
  }

  // ------------------------------------------------------------------ helpers
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({"&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"}[c]));

  /** Minimal, safe Markdown: escape first, then **bold**, lists, paragraphs, [n] citations. */
  function renderMarkdown(text, sources) {
    const byN = {};
    (sources || []).forEach((s) => { byN[s.n] = s; });
    const inline = (t) => esc(t)
      .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
      .replace(/\[(\d{1,2})\]/g, (m, n) => {
        const s = byN[n];
        if (!s) return "";
        const label = `${s.short_title}${s.section ? ", " + s.section : ""}${s.page ? ", p. " + s.page : ""}`;
        return s.url ? `<sup><a class="cite" href="${esc(s.url)}" target="_blank" rel="noopener" title="${esc(label)}">${n}</a></sup>`
                     : `<sup class="cite" title="${esc(label)}">${n}</sup>`;
      });
    const out = [];
    let list = null;
    const closeList = () => { if (list) { out.push(`</${list}>`); list = null; } };
    for (const raw of String(text || "").split(/\n/)) {
      const line = raw.trim();
      const ul = line.match(/^[-*•]\s+(.*)/), ol = line.match(/^\d+[.)]\s+(.*)/);
      if (ul || ol) {
        const tag = ul ? "ul" : "ol";
        if (list !== tag) { closeList(); out.push(`<${tag}>`); list = tag; }
        out.push(`<li>${inline((ul || ol)[1])}</li>`);
      } else if (!line) {
        closeList();
      } else {
        closeList();
        out.push(`<p>${inline(line)}</p>`);
      }
    }
    closeList();
    return out.join("");
  }

  function chipIcon(text) {
    const t = text.toLowerCase();
    if (/licen|permis|uruhushya|impushya/.test(t)) return ICON.doc;
    if (/safe|sécur|umutekano|report|signal|illegal|ill[ée]gal|butemewe/.test(t)) return ICON.shield;
    if (/law|loi|itegeko|amategeko|tax|royalt|redevance|umusoro/.test(t)) return ICON.book;
    if (/invest|kivu|ishoramari/.test(t)) return ICON.chart;
    return ICON.doc;
  }

  // ------------------------------------------------------------------ styles (scoped by Shadow DOM)
  const CSS = `
  :host { all: initial; --brand:#016191; --brand-dark:#014f77; --accent:#0097d8; --ink:#181c1f; --muted:#535d65;
          --line:#e5e8ec; --bg:#f8fafc; --bubble:#ffffff; --danger:#ba1a1a; --ease: cubic-bezier(.2,.7,.2,1);
          font-family: "Inter", system-ui, -apple-system, "Segoe UI", sans-serif; -webkit-font-smoothing: antialiased; }
  * { box-sizing: border-box; }
  [hidden] { display: none !important; }
  button { font: inherit; cursor: pointer; }
  /* Launcher (Figma): blue speech bubble with the white RMB mark and a green "online" dot; navy circle with X when open. */
  /* Figma "Baza widget button" (50 x 48.48): gradient speech bubble with its tail at the bottom right, the white RMB mark,
     and a 10px green dot (#41A42A) at top -2 / left 32. */
  .launcher { position: fixed; right: 24px; bottom: 24px; width: 50px; height: 48.48px; border: 0; padding: 0; background: none;
    color: #fff; display: block; z-index: 2147483000; filter: drop-shadow(0 4px 10px rgba(16,94,214,.35));
    transition: transform .25s var(--ease), filter .25s; transform-origin: 70% 70%; }
  .launcher .bub { position: absolute; inset: 0; width: 100%; height: 100%; }
  .launcher .lmark { position: absolute; left: 8px; top: 7.5px; width: 32px; height: 32px; }
  .launcher .dot { position: absolute; top: -2px; left: 32px; width: 10px; height: 10px; border-radius: 50%; background: #41a42a; }
  .launcher:hover { transform: scale(1.08); filter: drop-shadow(0 8px 16px rgba(16,94,214,.42)); }
  .launcher.open { width: 56px; height: 56px; border-radius: 50%; background: var(--brand-dark); display: grid; place-items: center;
    filter: none; box-shadow: 0 6px 20px rgba(9,70,105,.35); }
  .launcher.open:hover { background: var(--brand); transform: scale(1.06); }
  .launcher.spin svg, .launcher.spin .lmark { animation: spin .35s var(--ease); }
  /* Hover greeting (Figma): white pill "Hi 👋 I'm Baza-RMB" slides out to the left of the closed launcher. */
  .hello { position: fixed; right: 84px; bottom: 28px; background: #fff; color: var(--ink); border-radius: 12px; padding: 9px 18px;
    font-size: 14px; line-height: 20px; white-space: nowrap; box-shadow: 0 2px 10px rgba(15,35,55,.12); border: 1.5px solid #d3dce5;
    z-index: 2147483000; pointer-events: none; opacity: 0; transform: translateX(10px); transition: opacity .2s ease, transform .25s var(--ease); }
  .hello b { font-weight: 700; }
  .launcher:not(.open):hover ~ .hello, .launcher:not(.open):focus-visible ~ .hello { opacity: 1; transform: none; }
  img.mark { width: 100%; height: 100%; object-fit: contain; display: block; }
  .launcher:focus-visible, button:focus-visible, input:focus-visible, textarea:focus-visible, a:focus-visible { outline: 3px solid #8cc8ea; outline-offset: 2px; }
  .panel { position: fixed; right: 24px; bottom: 92px; width: 380px; height: min(640px, calc(100vh - 120px)); background: var(--bg);
    border-radius: 22px; box-shadow: 0 18px 50px rgba(15,35,55,.28); display: flex; flex-direction: column; overflow: hidden;
    z-index: 2147483000; color: var(--ink); font-size: 14px; line-height: 20px; transform-origin: bottom right;
    animation: panelIn .32s var(--ease); }
  .panel.closing { animation: panelOut .2s ease forwards; }
  .panel[hidden] { display: none; }
  header { background: var(--brand); color: #fff; padding: 16px 16px 18px; display: flex; align-items: center; gap: 12px; position: relative; }
  .logo { width: 44px; height: 44px; background: #fff; border-radius: 10px; padding: 4px; flex: none; box-shadow: 0 1px 3px rgba(0,0,0,.15); }
  .titles { flex: 1; min-width: 0; }
  .titles b { display: block; font-size: 16px; font-weight: 650; line-height: 1.25; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .titles span { font-size: 12.5px; opacity: .85; }
  .hbtn { background: transparent; border: 0; color: #fff; display: inline-flex; align-items: center; gap: 2px; padding: 6px; border-radius: 8px; }
  .hbtn:hover { background: rgba(255,255,255,.14); }
  .hbtn.closeb { display: none; }
  .menu { position: absolute; right: 12px; top: 58px; background: #fff; color: var(--ink); border-radius: 10px; box-shadow: 0 8px 24px rgba(0,0,0,.18);
    padding: 6px; min-width: 170px; z-index: 2; }
  .menu button { display: block; width: 100%; text-align: left; border: 0; background: none; padding: 8px 10px; border-radius: 7px; font-size: 14px; }
  .menu button:hover, .menu button[aria-checked="true"] { background: #e9f2f8; }
  .log { flex: 1; overflow-y: auto; padding: 18px 16px 8px; scroll-behavior: smooth; }
  .row { display: flex; gap: 10px; margin-bottom: 14px; align-items: flex-start; animation: msgIn .35s var(--ease) both; }
  .suggest { animation: msgIn .4s .08s var(--ease) both; }
  .row.user { justify-content: flex-end; }
  .avatar { width: 38px; height: 38px; border-radius: 10px; background: #fff; padding: 3px; flex: none; border: 1px solid var(--line); }
  .bubble { background: var(--bubble); border: 1px solid var(--line); border-radius: 4px 16px 16px 16px; padding: 10px 13px; max-width: 290px;
    overflow-wrap: anywhere; box-shadow: 0 1px 2px rgba(16,40,60,.05); }
  .row.user .bubble { background: var(--brand); color: #fff; border-color: var(--brand); border-radius: 16px 4px 16px 16px; }
  .bubble p { margin: 0 0 6px; } .bubble p:last-child { margin-bottom: 0; }
  .bubble ul, .bubble ol { margin: 4px 0 6px; padding-left: 20px; } .bubble li { margin: 2px 0; }
  .cite { font-size: 10.5px; color: var(--brand); text-decoration: none; font-weight: 700; padding: 0 1px; }
  a.cite:hover { text-decoration: underline; }
  .typing { display: inline-flex; gap: 4px; padding: 4px 2px; }
  .typing i { width: 7px; height: 7px; border-radius: 50%; background: #9fb3c3; animation: blink 1.2s infinite; }
  .typing i:nth-child(2) { animation-delay: .2s; } .typing i:nth-child(3) { animation-delay: .4s; }
  @keyframes blink { 0%, 80%, 100% { opacity: .25; } 40% { opacity: 1; } }
  .extra { margin-top: 8px; padding-top: 8px; border-top: 1px solid #edf1f4; font-size: 12.5px; }
  .sources b { display: block; font-size: 11.5px; text-transform: uppercase; letter-spacing: .04em; color: var(--muted); margin-bottom: 3px; }
  .sources a, .sources span { display: block; color: var(--brand); text-decoration: none; margin: 2px 0; }
  .sources a:hover { text-decoration: underline; }
  .disclaimer { color: var(--muted); font-size: 11.5px; margin-top: 6px; }
  .notice { color: var(--muted); font-style: italic; font-size: 12px; margin-top: 6px; }
  .feedback { display: flex; align-items: center; gap: 6px; color: var(--muted); font-size: 11.5px; margin-top: 6px; }
  .feedback button { border: 1px solid var(--line); background: #fff; color: var(--muted); border-radius: 7px; padding: 3px 7px; display: inline-flex; }
  .feedback button:hover { color: var(--brand); border-color: var(--brand); }
  .emergency { background: #fdecea; border: 1px solid #f4b8b0; color: #7a1a10; border-radius: 12px; padding: 10px 12px; margin-top: 8px; }
  .emergency b { display: flex; gap: 6px; align-items: center; margin-bottom: 6px; }
  .emergency a { display: flex; align-items: center; gap: 8px; color: #7a1a10; font-weight: 700; font-size: 15px; text-decoration: none;
    background: #fff; border-radius: 8px; padding: 7px 10px; margin-top: 6px; }
  .emergency small { font-weight: 400; font-size: 11.5px; color: #8a4a42; display: block; }
  .chips-title { color: var(--ink); margin: 2px 0 10px 4px; font-size: 13.5px; }
  .chips { display: flex; flex-direction: column; gap: 8px; margin: 0 4px 14px; }
  .chip { display: flex; align-items: center; gap: 10px; background: #fff; border: 1px solid #cfdae3; color: var(--brand-dark);
    border-radius: 22px; padding: 9px 14px; text-align: left; font-size: 13.5px; }
  .chip { transition: border-color .2s, background .2s, transform .2s var(--ease), box-shadow .2s; }
  .chip:hover { border-color: var(--brand); background: #f2f8fc; transform: translateX(3px); box-shadow: 0 1px 2px rgba(0,0,0,.05); }
  .chips .chip:nth-child(1) { animation: msgIn .4s .12s var(--ease) both; } .chips .chip:nth-child(2) { animation: msgIn .4s .18s var(--ease) both; }
  .chips .chip:nth-child(3) { animation: msgIn .4s .24s var(--ease) both; } .chips .chip:nth-child(4) { animation: msgIn .4s .3s var(--ease) both; }
  .sendbtn { transition: transform .15s, background .2s; } .sendbtn:not(:disabled):hover { transform: scale(1.06); background: var(--brand-dark); }
  .menu { animation: menuIn .16s var(--ease); transform-origin: top right; }
  form.case { animation: msgIn .35s .1s var(--ease) both; }
  .emergency { animation: shake .45s .1s ease both; }
  @keyframes panelIn { from { opacity: 0; transform: translateY(16px) scale(.96); } to { opacity: 1; transform: none; } }
  @keyframes panelOut { to { opacity: 0; transform: translateY(12px) scale(.97); } }
  @keyframes msgIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }
  @keyframes menuIn { from { opacity: 0; transform: scale(.95); } to { opacity: 1; transform: none; } }
  @keyframes spin { from { transform: rotate(-90deg) scale(.6); opacity: 0; } to { transform: none; opacity: 1; } }
  @keyframes shake { 0%,100% { transform: none; } 25% { transform: translateX(-3px); } 75% { transform: translateX(3px); } }
  @media (prefers-reduced-motion: reduce) { *, *::before, *::after { animation-duration: .001ms !important; transition-duration: .001ms !important; } }
  .chip svg { flex: none; color: var(--brand); }
  form.case { background: #fff; border: 1px solid var(--line); border-radius: 14px; padding: 12px; margin: 0 0 14px 48px; }
  form.case h4 { margin: 0 0 4px; font-size: 14px; }
  form.case .conf { font-size: 12px; color: var(--muted); margin-bottom: 6px; }
  form.case label { display: block; font-size: 12.5px; margin-top: 8px; color: #33424f; }
  form.case input:not([type=checkbox]), form.case textarea { width: 100%; margin-top: 3px; padding: 8px 10px; border: 1px solid #cdd8e1; border-radius: 9px;
    font: inherit; font-size: 13.5px; background: #fbfcfd; }
  form.case .check { display: flex; gap: 8px; align-items: center; }
  form.case .btn { margin-top: 10px; background: var(--brand); color: #fff; border: 0; border-radius: 9px; padding: 8px 16px; font-weight: 600; }
  form.case .btn[disabled] { opacity: .6; }
  .result { margin-top: 8px; font-size: 13px; }
  .ref { display: flex; gap: 8px; align-items: center; background: #eaf5ee; color: #155c32; border-radius: 9px; padding: 8px 10px; margin-top: 6px;
    font-weight: 700; font-size: 15px; letter-spacing: .03em; }
  .ref button { margin-left: auto; border: 1px solid #9ccfae; background: #fff; color: #155c32; border-radius: 7px; font-size: 12px; padding: 2px 8px; }
  .err { color: var(--danger); }
  .composer { padding: 10px 14px 6px; background: var(--bg); }
  .box { display: flex; align-items: center; gap: 8px; background: #fff; border: 1px solid #cdd8e1; border-radius: 14px; padding: 6px 6px 6px 14px; }
  .box:focus-within { border-color: var(--brand); }
  textarea.input { flex: 1; border: 0; outline: none; resize: none; font: inherit; font-size: 14px; max-height: 110px; padding: 6px 0; background: transparent; color: var(--ink); }
  .sendbtn { width: 38px; height: 38px; border-radius: 50%; border: 0; background: var(--brand); color: #fff; display: grid; place-items: center; flex: none; }
  .sendbtn:disabled { background: #9db6c7; cursor: default; }
  .foot { text-align: center; color: var(--muted); font-size: 11px; padding: 6px 12px 12px; }
  .sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); }
  @media (max-width: 480px) {
    .panel { right: 0; bottom: 0; width: 100vw; height: 100dvh; border-radius: 0; }
    .launcher { right: 16px; bottom: 16px; }
    .panel:not([hidden]) ~ .launcher { display: none; }
    .hello { right: 76px; bottom: 20px; }
    .hbtn.closeb { display: inline-flex; }
  }`;

  // ------------------------------------------------------------------ component
  class BazaWidget extends HTMLElement {
    constructor() {
      super();
      this.root = this.attachShadow({mode: "open"});
      this.state = this.load() || {sessionId: null, messages: [], lang: CFG.lang, open: false};
      if (!UI[this.state.lang]) this.state.lang = "en";
      this.config = null;
      this.busy = false;
    }

    // ---- persistence (per tab, never across visits)
    load() { try { return JSON.parse(sessionStorage.getItem(STORE_KEY)); } catch (e) { return null; } }
    save() { try { sessionStorage.setItem(STORE_KEY, JSON.stringify(this.state)); } catch (e) { /* private mode */ } }
    t(k, lang) { return (UI[lang] || UI[this.state.lang] || UI.en)[k]; }

    async connectedCallback() {
      this.root.innerHTML = `<style>${CSS}</style>
        <section class="panel" role="dialog" aria-modal="false" hidden>
          <header>
            <div class="logo">${LOGO}</div>
            <div class="titles"><b class="t-org"></b></div>
            <button class="hbtn new" type="button">${ICON.refresh}</button>
            <button class="hbtn lang" type="button" aria-haspopup="menu" aria-expanded="false">${ICON.globe}${ICON.chevron}</button>
            <button class="hbtn closeb" type="button">${ICON.close}</button>
            <div class="menu" role="menu" hidden></div>
          </header>
          <div class="log" aria-live="polite"></div>
          <div class="composer">
            <form class="box" autocomplete="off">
              <label class="sr" for="baza-input"></label>
              <textarea id="baza-input" class="input" rows="1" maxlength="2000"></textarea>
              <button class="sendbtn" type="submit">${ICON.send}</button>
            </form>
          </div>
          <div class="foot"></div>
        </section>
        <button class="launcher" type="button" aria-expanded="false"></button>
        <div class="hello" aria-hidden="true"></div>`;
      // Official logo missing or blocked: fall back to the drawn mark (error events don't bubble, so capture).
      this.root.addEventListener("error", (e) => {
        if (e.target.matches && e.target.matches("img.mark")) e.target.outerHTML = e.target.classList.contains("white") ? LOGO_WHITE : LOGO_SVG;
      }, true);
      this.$ = (s) => this.root.querySelector(s);
      this.panel = this.$(".panel");
      this.log = this.$(".log");
      this.input = this.$(".input");
      this.$(".launcher").addEventListener("click", () => this.toggle());
      this.$(".new").addEventListener("click", () => this.newChat());
      this.$(".closeb").addEventListener("click", () => { this.toggle(false); this.$(".launcher").focus(); });
      this.$(".lang").addEventListener("click", (e) => { e.stopPropagation(); this.toggleMenu(); });
      this.root.addEventListener("click", () => this.toggleMenu(false));
      this.$("form.box").addEventListener("submit", (e) => { e.preventDefault(); this.send(this.input.value); });
      this.input.addEventListener("keydown", (e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); this.send(this.input.value); } });
      this.input.addEventListener("input", () => { this.input.style.height = "auto"; this.input.style.height = this.input.scrollHeight + "px"; });
      this.panel.addEventListener("keydown", (e) => { if (e.key === "Escape") this.toggle(false); });
      await this.loadConfig();
      if (this.config && this.config.enabled === false) { this.remove(); return; }
      this.applyTexts();
      this.renderAll();
      if (this.state.open) this.toggle(true);
    }

    async loadConfig() {
      try {
        const r = await fetch(`${CFG.apiBase}/widget-config?lang=${encodeURIComponent(this.state.lang)}`);
        this.config = r.ok ? await r.json() : null;
      } catch (e) { this.config = null; }
    }

    // Display name, always "Baza-RMB" style (capital B), whatever is stored in the settings.
    name() {
      const n = ((this.config && this.config.assistant_name) || "Baza-RMB").trim();
      return n.charAt(0).toUpperCase() + n.slice(1);
    }

    applyTexts() {
      const title = `${this.name()} · ${this.t("sub")}`;
      this.$(".t-org").textContent = title;
      this.panel.setAttribute("aria-label", title);
      this.input.placeholder = this.t("placeholder");
      this.$("label.sr").textContent = this.t("placeholder");
      this.$(".sendbtn").setAttribute("aria-label", this.t("send"));
      this.$(".new").setAttribute("aria-label", this.t("newChat")); this.$(".new").title = this.t("newChat");
      this.$(".lang").setAttribute("aria-label", this.t("language")); this.$(".lang").title = this.t("language");
      this.$(".foot").textContent = this.t("footer");
      this.$(".closeb").setAttribute("aria-label", this.t("close"));
      this.$(".hello").innerHTML = `${esc(this.t("hello"))} <b>${esc(this.name())}</b>`;
      this.syncLauncher();
      const langs = (this.config && this.config.languages) || ["en"];
      this.$(".menu").innerHTML = langs.map((l) =>
        `<button type="button" role="menuitemradio" aria-checked="${l === this.state.lang}" data-l="${l}">${LANG_NAMES[l] || l}</button>`).join("");
      this.$(".menu").querySelectorAll("button").forEach((b) => b.addEventListener("click", () => this.setLang(b.dataset.l)));
    }

    syncLauncher() {
      // From the state, not panel.hidden: while the close animation runs the panel is still visible.
      const l = this.$(".launcher"), open = !!this.state.open;
      l.innerHTML = open ? ICON.close : `${BUBBLE}<span class="lmark">${LAUNCHER_LOGO}</span><span class="dot"></span>`;
      l.classList.toggle("open", open);
      l.classList.remove("spin"); void l.offsetWidth; l.classList.add("spin");
      l.setAttribute("aria-label", open ? this.t("close") : this.t("open"));
      l.setAttribute("aria-expanded", String(open));
    }

    toggle(force) {
      const open = force === undefined ? this.panel.hidden : force;
      if (!open && !this.panel.hidden && !matchMedia("(prefers-reduced-motion: reduce)").matches) {
        this.panel.classList.add("closing");
        setTimeout(() => { this.panel.classList.remove("closing"); this.panel.hidden = true; }, 190);
      } else {
        this.panel.hidden = !open;
      }
      this.state.open = open; this.save();
      this.syncLauncher();
      if (open) { this.input.focus(); this.scrollDown(); }
    }

    toggleMenu(force) {
      const m = this.$(".menu"), show = force === undefined ? m.hidden : force;
      m.hidden = !show;
      this.$(".lang").setAttribute("aria-expanded", String(show));
    }

    async setLang(l) {
      this.toggleMenu(false);
      if (l === this.state.lang) return;
      this.state.lang = l; this.save();
      await this.loadConfig();
      this.applyTexts();
      this.renderAll();
    }

    newChat() {
      this.state.sessionId = null; this.state.messages = []; this.save();
      this.renderAll(); this.input.focus();
    }

    scrollDown() { requestAnimationFrame(() => { this.log.scrollTop = this.log.scrollHeight; }); }

    // ---- rendering
    renderAll() {
      this.log.innerHTML = "";
      const welcome = (this.config && this.config.welcome_message) || "";
      if (welcome) this.log.appendChild(this.botRow({answer: welcome}, true));
      if (!this.state.messages.length) this.renderChips();
      for (const m of this.state.messages) {
        if (m.role === "user") this.log.appendChild(this.userRow(m.text));
        else this.log.appendChild(this.botRow(m.data));
      }
      this.scrollDown();
    }

    renderChips() {
      const sugg = (this.config && this.config.suggestions) || [];
      if (!sugg.length) return;
      const wrap = document.createElement("div");
      wrap.className = "suggest";
      wrap.innerHTML = `<div class="chips-title">${esc(this.t("ask"))}</div><div class="chips">${sugg.map((s) =>
        `<button type="button" class="chip">${chipIcon(s)}<span>${esc(s)}</span></button>`).join("")}</div>`;
      wrap.querySelectorAll(".chip").forEach((b, i) => b.addEventListener("click", () => this.send(sugg[i])));
      this.log.appendChild(wrap);
    }

    userRow(text) {
      const row = document.createElement("div");
      row.className = "row user";
      row.innerHTML = `<div class="bubble"></div>`;
      row.firstChild.textContent = text;
      return row;
    }

    botRow(d, isWelcome = false) {
      const row = document.createElement("div");
      row.className = "row bot";
      row.innerHTML = `<div class="avatar">${LOGO}</div><div class="bubble"></div>`;
      this.fillBubble(row.querySelector(".bubble"), d, isWelcome);
      const wrap = document.createElement("div");
      wrap.appendChild(row);
      if (d.form) wrap.appendChild(this.renderForm(d.form, d.language));
      return wrap;
    }

    fillBubble(bubble, d, isWelcome = false) {
      const tt = (k) => this.t(k, d.language);
      if (d.lang || d.language) bubble.setAttribute("lang", d.language || d.lang);
      let html = d.pending ? `<span class="typing" aria-label="…"><i></i><i></i><i></i></span>` : renderMarkdown(d.answer, d.sources);
      if (d.emergency_contacts && d.emergency_contacts.length) {
        html += `<div class="emergency" role="alert"><b>${ICON.alert}${esc(tt("emergency"))}</b>${d.emergency_contacts.map((c) =>
          `<a href="tel:${esc(String(c.value).replace(/[^\d+]/g, ""))}">${ICON.phone}<span>${esc(c.value)}<small>${esc(c.label)}${c.placeholder ? "" : ""}</small></span></a>`).join("")}</div>`;
      }
      const extra = [];
      if (d.sources && d.sources.length) {
        extra.push(`<div class="sources"><b>${esc(tt("sources"))}</b>${d.sources.map((s) => {
          const label = `[${s.n}] ${s.short_title}${s.section ? ", " + s.section : ""}${s.page ? ", p. " + s.page : ""}`;
          return s.url ? `<a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(label)}</a>` : `<span>${esc(label)}</span>`;
        }).join("")}</div>`);
      }
      if (d.disclaimer) extra.push(`<div class="disclaimer">${esc(d.disclaimer)}</div>`);
      if (d.notice) extra.push(`<div class="notice">${esc(d.notice)}</div>`);
      // Feedback only under real answers (with sources) or "not covered" replies, not greetings or refusals.
      if (!isWelcome && d.message_id && !d.pending && ((d.sources && d.sources.length) || d.action === "not_covered")) {
        extra.push(d.feedbackGiven ? `<div class="feedback">${esc(tt("thanks"))}</div>`
          : `<div class="feedback">${esc(tt("helpful"))}<button type="button" data-r="1" aria-label="👍">${ICON.up}</button><button type="button" data-r="-1" aria-label="👎">${ICON.down}</button></div>`);
      }
      if (extra.length) html += `<div class="extra">${extra.join("")}</div>`;
      bubble.innerHTML = html;
      bubble.querySelectorAll(".feedback button").forEach((b) => b.addEventListener("click", () => this.feedback(d, +b.dataset.r, bubble)));
    }

    renderForm(f, lang) {
      const tt = (k) => this.t(k, lang);
      const form = document.createElement("form");
      form.className = "case";
      form.noValidate = true;
      const field = (x) => {
        const v = esc((f.prefill || {})[x.name] || ""), req = x.required ? " *" : "";
        const attrs = `name="${esc(x.name)}" ${x.max_length ? `maxlength="${x.max_length}"` : ""} ${x.required ? "required" : ""}`;
        const input = x.type === "textarea" ? `<textarea rows="3" ${attrs}>${v}</textarea>`
          : `<input type="${x.type === "tel" ? "tel" : x.type === "email" ? "email" : x.type === "date" ? "date" : "text"}" value="${v}" ${attrs}>`;
        return `<label class="${x.contact ? "contact" : ""}">${esc(x.label)}${req}${input}</label>`;
      };
      form.innerHTML = `<h4>${esc(f.title)}</h4>${f.confidential ? `<div class="conf">${esc(tt("confidential"))}</div>` : ""}
        ${f.anonymous_allowed ? `<label class="check"><input type="checkbox" name="__anon" ${f.anonymous_default ? "checked" : ""}> ${esc(tt("anonymous"))}</label>` : ""}
        ${f.fields.map(field).join("")}
        <button class="btn" type="submit">${esc(f.lookup ? tt("check") : tt("submit"))}</button><div class="result" aria-live="polite"></div>`;
      const anon = form.querySelector("[name=__anon]");
      const syncAnon = () => form.querySelectorAll("label.contact").forEach((l) => { l.hidden = !!(anon && anon.checked); });
      if (anon) { anon.addEventListener("change", syncAnon); syncAnon(); }
      form.addEventListener("submit", (e) => { e.preventDefault(); this.submitForm(f, form, lang); });
      return form;
    }

    async submitForm(f, form, lang) {
      const tt = (k) => tt(k, lang);
      const out = form.querySelector(".result"), btn = form.querySelector(".btn");
      const anon = !!(form.querySelector("[name=__anon]") || {}).checked;
      const fields = {};
      let missing = false;
      for (const x of f.fields) {
        if (x.contact && anon) continue;
        const el = form.querySelector(`[name="${x.name}"]`), v = el.value.trim();
        if (x.required && !v) { missing = true; el.setAttribute("aria-invalid", "true"); } else el.removeAttribute("aria-invalid");
        if (v) fields[x.name] = v;
      }
      if (missing) { out.innerHTML = `<span class="err">${esc(tt("required"))}</span>`; return; }
      btn.disabled = true; btn.textContent = tt("sending");
      try {
        let r, j;
        if (f.lookup) {
          r = await fetch(`${CFG.apiBase}/cases/${encodeURIComponent((fields.reference || "").toUpperCase())}`);
          j = await r.json().catch(() => ({}));
          out.innerHTML = r.ok ? `${esc(tt("statusLine"))}: <b>${esc(tt("status")[j.status] || j.status)}</b><br>${esc(tt("routed"))}: ${esc(j.routed_to)}`
                               : `<span class="err">${esc(j.detail || "Error")}</span>`;
        } else {
          r = await fetch(`${CFG.apiBase}/cases`, {method: "POST", headers: {"Content-Type": "application/json"},
            body: JSON.stringify({session_id: this.state.sessionId, type: f.type, fields, anonymous: anon})});
          j = await r.json().catch(() => ({}));
          if (r.ok) {
            form.querySelectorAll("input,textarea").forEach((el) => { el.disabled = true; });
            out.innerHTML = `${esc(j.message)}<div class="ref"><span>${esc(j.reference_number)}</span><button type="button">${esc(tt("copy"))}</button></div>`;
            out.querySelector(".ref button").addEventListener("click", (e) => {
              navigator.clipboard && navigator.clipboard.writeText(j.reference_number);
              e.target.textContent = tt("copied");
            });
            btn.hidden = true;
            return;
          }
          out.innerHTML = `<span class="err">${esc(typeof j.detail === "string" ? j.detail : tt("required"))}</span>`;
        }
      } catch (e) {
        out.innerHTML = `<span class="err">${esc(tt("error"))}</span>`;
      }
      btn.disabled = false; btn.textContent = f.lookup ? tt("check") : tt("submit");
    }

    async feedback(d, rating, bubble) {
      d.feedbackGiven = true; this.save();
      this.fillBubble(bubble, d);
      try {
        await fetch(`${CFG.apiBase}/feedback`, {method: "POST", headers: {"Content-Type": "application/json"},
          body: JSON.stringify({session_id: this.state.sessionId, message_id: d.message_id, rating})});
      } catch (e) { /* best effort */ }
    }

    // ---- sending
    async send(text) {
      text = (text || "").trim();
      if (!text || this.busy) return;
      if (text.length > 2000) { this.log.appendChild(this.botRow({answer: this.t("tooLong")})); this.scrollDown(); return; }
      this.busy = true;
      this.$(".sendbtn").disabled = true;
      this.input.value = ""; this.input.style.height = "auto";
      const sugg = this.log.querySelector(".suggest");
      if (sugg) sugg.remove();
      this.state.messages.push({role: "user", text}); this.save();
      this.log.appendChild(this.userRow(text));
      const d = {pending: true, answer: ""};
      const wrap = this.botRow(d), bubble = wrap.querySelector(".bubble");
      this.log.appendChild(wrap);
      this.scrollDown();
      let final = null;
      try {
        final = await this.stream(text, (delta) => {
          d.pending = false; d.answer += delta;
          bubble.innerHTML = renderMarkdown(d.answer, []);
          this.scrollDown();
        });
      } catch (e) {
        final = {answer: `${e.message || this.t("error")}`, action: "none"};
      }
      if (!final) final = {answer: this.t("error"), action: "none"};
      if (final.session_id) this.state.sessionId = final.session_id;
      const c = this.config && this.config.contacts;
      if (!final.message_id && c && /unavailable|indisponible|ntaboneka/.test(final.answer)) {
        final.answer += `\n${c.email} · ${c.toll_free}`;
      }
      this.state.messages.push({role: "bot", data: final}); this.save();
      const fresh = this.botRow(final);
      wrap.replaceWith(fresh);
      this.busy = false;
      this.$(".sendbtn").disabled = false;
      this.input.focus();
      this.scrollDown();
    }

    async stream(message, onDelta) {
      const res = await fetch(`${CFG.apiBase}/chat`, {
        method: "POST", headers: {"Content-Type": "application/json"},
        body: JSON.stringify({message, session_id: this.state.sessionId, language: this.state.lang, stream: true}),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(typeof j.detail === "string" ? j.detail : this.t("error"));
      }
      const reader = res.body.getReader(), dec = new TextDecoder();
      let buf = "", final = null;
      for (;;) {
        const {value, done} = await reader.read();
        if (done) break;
        buf += dec.decode(value, {stream: true});
        let i;
        while ((i = buf.indexOf("\n\n")) >= 0) {
          const block = buf.slice(0, i); buf = buf.slice(i + 2);
          const ev = (block.match(/^event: (.*)$/m) || [])[1];
          let data = {};
          try { data = JSON.parse((block.match(/^data: (.*)$/m) || [])[1] || "{}"); } catch (e) { continue; }
          if (ev === "meta" && data.session_id) this.state.sessionId = data.session_id;
          else if (ev === "delta") onDelta(data.text || "");
          else if (ev === "final") final = data;
          else if (ev === "error") throw new Error(data.message || this.t("error"));
        }
      }
      return final;
    }
  }

  customElements.define("baza-rmb-widget", BazaWidget);
  const mount = () => document.body.appendChild(document.createElement("baza-rmb-widget"));
  if (document.body) mount(); else document.addEventListener("DOMContentLoaded", mount);
})();
