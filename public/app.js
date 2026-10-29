import { CATS, METHODS, STARTERS, SAMPLE } from "/knowledge.js";

// ---------- helpers ----------
const $ = id => document.getElementById(id);
const log = $("log"), q = $("q"), send = $("send");
let turns = [];        // real conversation
let showingSample = true;
let ctl = null;

function esc(s){ return s.replace(/[&<>"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c])); }
function inline(s){
  return esc(s).replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>").replace(/(^|[^*])\*([^*\n]+)\*/g, "$1<em>$2</em>").replace(/`([^`]+)`/g, "<code>$1</code>");
}
function md(src){
  const lines = src.replace(/\r/g, "").split("\n");
  let html = "", list = null, para = [], quote = [];
  const flushP = () => { if (para.length){ html += "<p>" + inline(para.join(" ")) + "</p>"; para = []; } };
  const flushL = () => { if (list){ html += `</${list}>`; list = null; } };
  const flushQ = () => { if (quote.length){ html += "<blockquote>" + inline(quote.join(" ")) + "</blockquote>"; quote = []; } };
  for (const raw of lines){
    const l = raw.trimEnd();
    let m;
    if (!l.trim()){ flushP(); flushL(); flushQ(); continue; }
    if ((m = l.match(/^\s*#{1,3}\s+(.*)/))){ flushP(); flushL(); flushQ(); html += `<h3>${inline(m[1])}</h3>`; continue; }
    if ((m = l.match(/^\s*#{4,6}\s+(.*)/))){ flushP(); flushL(); flushQ(); html += `<h4>${inline(m[1])}</h4>`; continue; }
    if ((m = l.match(/^\s*>\s?(.*)/))){ flushP(); flushL(); quote.push(m[1]); continue; }
    if ((m = l.match(/^\s*[-*•]\s+(.*)/))){ flushP(); flushQ(); if (list !== "ul"){ flushL(); html += "<ul>"; list = "ul"; } html += `<li>${inline(m[1])}</li>`; continue; }
    if ((m = l.match(/^\s*\d+[.)]\s+(.*)/))){ flushP(); flushQ(); if (list !== "ol"){ flushL(); html += "<ol>"; list = "ol"; } html += `<li>${inline(m[1])}</li>`; continue; }
    if (list && /^\s{2,}/.test(raw)){ html = html.replace(/<\/li>$/, " " + inline(l.trim()) + "</li>"); continue; }
    flushL(); flushQ(); para.push(l.trim());
  }
  flushP(); flushL(); flushQ();
  return html;
}

function bubble(role, content){
  const d = document.createElement("div");
  d.className = "msg " + (role === "user" ? "user" : "bot");
  if (role === "user") d.textContent = content; else d.innerHTML = md(content);
  log.appendChild(d);
  return d;
}

function render(){
  log.innerHTML = "";
  if (showingSample){
    const t = document.createElement("div"); t.className = "sample-tag"; t.textContent = "Namuna suhbat";
    log.appendChild(t);
    SAMPLE.forEach(m => bubble(m.role, m.content));
  } else {
    turns.forEach(m => bubble(m.role, m.content));
  }
  $("starters").hidden = !showingSample && turns.length > 0;
}

function save(){ try { localStorage.setItem("ustoz-chat", JSON.stringify(turns.slice(-20))); } catch(e){} }
function load(){ try { const t = JSON.parse(localStorage.getItem("ustoz-chat") || "[]"); if (Array.isArray(t) && t.length){ turns = t; showingSample = false; } } catch(e){} }
function loadCtx(){ try { const c = JSON.parse(localStorage.getItem("ustoz-ctx") || "{}"); ["stage","subject","size"].forEach(k => { if (c[k]) $(k).value = c[k]; }); } catch(e){} }
["stage","subject","size"].forEach(k => $(k).addEventListener("change", () => {
  try { localStorage.setItem("ustoz-ctx", JSON.stringify({stage:$("stage").value, subject:$("subject").value, size:$("size").value})); } catch(e){}
}));

function ctxLine(){
  const parts = [];
  if ($("stage").value) parts.push("Oʻquvchilar: " + $("stage").value);
  if ($("subject").value.trim()) parts.push("Fan: " + $("subject").value.trim());
  if ($("size").value) parts.push("Sinf hajmi: " + $("size").value);
  return parts.length ? "[Sinf haqida: " + parts.join("; ") + "]\n" : "";
}

const ERR = {
  rate_limited: "Hozir soʻrovlar juda koʻp. Birozdan keyin qayta yuboring.",
  session_expired: "Sessiya tugagan. Claude'ga qayta kiring va yana urinib koʻring.",
  refused: "Bu soʻrovga javob berilmadi. Savolni boshqacha ifodalab koʻring.",
  empty_completion: "Javob boʻsh keldi. Savolni qisqaroq yozib koʻring.",
  prompt_too_large: "Suhbat juda uzun boʻlib ketdi. “Yangi suhbat”ni bosing.",
  server_misconfigured: "Sayt sozlamalarida xato bor. Administratorga xabar bering.",
  bad_request: "Soʻrovni qayta ishlab boʻlmadi. “Yangi suhbat”ni bosib, qayta yozing.",
  upstream_error: "Ulanishda xato. Qayta yuborib koʻring."
};

function setBusy(b){
  send.dataset.mode = b ? "stop" : "send";
  send.textContent = b ? "Toʻxtatish" : "Yuborish";
}

async function ask(text){
  text = text.trim();
  if (!text) return;
  if (showingSample){ showingSample = false; turns = []; }
  const first = turns.length === 0;
  turns.push({role:"user", content: text});
  render();
  q.value = ""; autosize();
  const out = bubble("assistant", "");
  out.innerHTML = '<span class="thinking">Metodlarni tanlayapman</span>';
  out.scrollIntoView({block:"nearest"});
  ctl = new AbortController();
  setBusy(true);
  // The server holds the instructions and knowledge base; we send only the conversation.
  const history = turns.slice(-12).map((m, i, arr) => i === arr.length - 1 ? {role:"user", content: ctxLine() + m.content} : m);
  if (history[0].role !== "user") history.shift();
  try {
    const res = await fetch("/api/chat", {
      method: "POST", headers: {"Content-Type": "application/json"},
      body: JSON.stringify({ messages: history }), signal: ctl.signal
    });
    if (!res.ok){
      const body = await res.json().catch(() => ({}));
      throw { code: body.code || "upstream_error" };
    }
    const reader = res.body.getReader(); const dec = new TextDecoder();
    let answer = "";
    for (;;){
      const { value, done } = await reader.read();
      if (done) break;
      answer += dec.decode(value, { stream: true });
      out.innerHTML = md(answer);
    }
    const ERR_MARK = "\u0000ERR:";
    if (answer.includes(ERR_MARK)){
      const [txt, code] = answer.split(ERR_MARK);
      throw { code: code.trim() || "upstream_error", text: txt || undefined };
    }
    if (!answer.trim()) throw { code: "empty_completion" };
    turns.push({role:"assistant", content: answer});
    save();
  } catch (e) {
    const code = e && e.code;
    if (e && e.name === "AbortError"){
      out.remove(); turns.pop(); q.value = text;
    } else if (code === "cancelled"){
      if (e.text){ turns.push({role:"assistant", content: e.text}); save(); } else { out.remove(); turns.pop(); q.value = text; }
    } else {
      if (e && e.text && code !== "refused"){ out.innerHTML = md(e.text); turns.push({role:"assistant", content:e.text}); }
      else { out.remove(); turns.pop(); q.value = text; }
      const n = document.createElement("div"); n.className = "err"; n.textContent = ERR[code] || ERR.upstream_error;
      log.appendChild(n);
      save();
    }
  } finally {
    ctl = null; setBusy(false);
    if (turns.length === 0){ showingSample = first; render(); }
  }
}

function autosize(){ q.style.height = "auto"; q.style.height = Math.min(q.scrollHeight, 200) + "px"; }
q.addEventListener("input", autosize);
q.addEventListener("keydown", e => { if (e.key === "Enter" && !e.shiftKey && !e.isComposing){ e.preventDefault(); if (!ctl) ask(q.value); } });
$("form").addEventListener("submit", e => { e.preventDefault(); if (ctl) ctl.abort(); else ask(q.value); });
$("reset").addEventListener("click", () => { if (ctl) ctl.abort(); turns = []; showingSample = true; save(); render(); q.focus(); });

STARTERS.forEach(s => { const b = document.createElement("button"); b.type = "button"; b.textContent = s; b.onclick = () => { if (!ctl) ask(s); }; $("starters").appendChild(b); });

// ---------- library ----------
let cat = "", term = "";
function renderCats(){
  const box = $("cats"); box.innerHTML = "";
  [["", "Hammasi"], ...Object.entries(CATS)].forEach(([k, v]) => {
    const b = document.createElement("button"); b.type = "button"; b.textContent = v; b.setAttribute("aria-pressed", String(cat === k));
    b.onclick = () => { cat = k; renderCats(); renderList(); };
    box.appendChild(b);
  });
}
function renderList(){
  const t = term.toLowerCase();
  const items = METHODS.filter(m => (!cat || m.c === cat) && (!t || (m.n + m.s + m.d).toLowerCase().includes(t)));
  $("count").textContent = items.length + " / " + METHODS.length;
  const box = $("mlist"); box.innerHTML = "";
  items.forEach(m => {
    const d = document.createElement("details"); d.className = "m";
    d.innerHTML = `<summary><span class="mn">${esc(m.n)}</span><span class="ms">${esc(m.s)}</span></summary>
      <div class="body"><p>${esc(m.d)}</p><p class="ev">${esc(m.e)}</p><button class="ask" type="button">Mening sinfimda qanday qoʻllayman? →</button></div>`;
    d.querySelector(".ask").onclick = () => { if (!ctl) ask(`“${m.n}” metodini mening sinfimda qanday qoʻllashim mumkin? Qadamma-qadam tushuntiring va tipik xatolarni ayting.`); };
    box.appendChild(d);
  });
}
$("search").addEventListener("input", e => { term = e.target.value; renderList(); });

// ---------- boot ----------
loadCtx(); load(); render(); renderCats(); renderList();
fetch("/api/config").then(r => r.json()).then(c => {
  if (!c.telegram) return;
  const a = $("tg"); a.href = "https://t.me/" + encodeURIComponent(c.telegram); a.textContent = "Telegram botimiz: @" + c.telegram; a.hidden = false;
}).catch(() => {});
