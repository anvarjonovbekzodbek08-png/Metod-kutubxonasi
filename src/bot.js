// Telegram bot: the same advisor and knowledge base as the website.
import crypto from "node:crypto";
import { Bot, InlineKeyboard, GrammyError } from "grammy";
import { advise, cleanHistory, errorCode } from "./advisor.js";
import { CATS, METHODS } from "./knowledge.js";
import { allow } from "./limits.js";

const ERR = {
  rate_limited: "Hozir soʻrovlar juda koʻp. Birozdan keyin qayta yozing.",
  refused: "Bu savolga javob bera olmadim. Boshqacha ifodalab koʻring.",
  bad_request: "Savolni qayta ishlab boʻlmadi. /yangi buyrugʻi bilan suhbatni yangilab, qayta yozing.",
  server_misconfigured: "Bot sozlamalarida xato bor. Administratorga xabar bering.",
  upstream_error: "Ulanishda xato boʻldi. Qayta yuborib koʻring."
};

// Per-chat memory. Lost on restart, which only means the conversation starts fresh.
const chats = new Map(); // chatId -> { turns: [], ctx: "", busy: false }
const chat = id => {
  if (!chats.has(id)) chats.set(id, { turns: [], ctx: "", busy: false });
  return chats.get(id);
};

const esc = s => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** Converts the advisor's Markdown to the small HTML subset Telegram accepts. */
function toTelegramHtml(md) {
  const inline = s => esc(s)
    .replace(/\*\*(.+?)\*\*/g, "<b>$1</b>")
    .replace(/(^|[^*])\*([^*\n]+)\*/g, "$1<i>$2</i>")
    .replace(/`([^`]+)`/g, "<code>$1</code>");
  const out = [];
  let quote = [];
  const flushQ = () => { if (quote.length) { out.push("<blockquote>" + quote.join("\n") + "</blockquote>"); quote = []; } };
  for (const raw of md.replace(/\r/g, "").split("\n")) {
    let m;
    if ((m = raw.match(/^\s*>\s?(.*)/))) { quote.push(inline(m[1])); continue; }
    flushQ();
    if ((m = raw.match(/^\s*#{1,6}\s+(.*)/))) out.push("\n<b>" + inline(m[1].replace(/\*\*/g, "")) + "</b>");
    else if ((m = raw.match(/^(\s*)[-*•]\s+(.*)/))) out.push(m[1] + "• " + inline(m[2]));
    else out.push(inline(raw));
  }
  flushQ();
  return out.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

/** Splits Markdown on paragraph breaks into pieces that stay under Telegram's 4096-character limit. */
function splitMarkdown(md, limit = 3500) {
  const parts = [];
  let cur = "";
  for (const para of md.split(/\n{2,}/)) {
    if (cur && (cur + "\n\n" + para).length > limit) { parts.push(cur); cur = ""; }
    if (para.length > limit) {
      for (let i = 0; i < para.length; i += limit) parts.push(para.slice(i, i + limit));
    } else cur = cur ? cur + "\n\n" + para : para;
  }
  if (cur) parts.push(cur);
  return parts;
}

async function sendRich(api, chatId, placeholderId, md) {
  const parts = splitMarkdown(md);
  for (let i = 0; i < parts.length; i++) {
    const html = toTelegramHtml(parts[i]);
    try {
      if (i === 0) await api.editMessageText(chatId, placeholderId, html, { parse_mode: "HTML" });
      else await api.sendMessage(chatId, html, { parse_mode: "HTML" });
    } catch (e) {
      // Formatting rejected: fall back to plain text so the answer still arrives.
      if (i === 0) await api.editMessageText(chatId, placeholderId, parts[i]).catch(() => {});
      else await api.sendMessage(chatId, parts[i]);
    }
  }
}

/**
 * @param {string} token
 * @param {import("express").Express} app  the website's server, used for webhook mode
 * @param {string} [publicUrl] https address of the site; when set, Telegram delivers messages by webhook
 */
export function startBot(token, app, publicUrl) {
  const bot = new Bot(token);
  // Telegram opens Mini Apps only over https.
  const siteUrl = /^https:\/\//.test(publicUrl || "") ? publicUrl.replace(/\/$/, "") + "/" : "";
  const siteButton = () => siteUrl && new InlineKeyboard().webApp("🌐 Saytni ochish", siteUrl);

  bot.command("start", ctx => ctx.reply(
    "Assalomu alaykum! Men <b>Ustoz Maslahatchisi</b>man.\n\n" +
    "Sinfingizdagi muammoni yozing: men dunyo maktablarida sinalgan, tadqiqot bilan isbotlangan " +
    `${METHODS.length} ta metod va kitob asosida aniq yechim va ertangi dars rejasini beraman.\n\n` +
    "<b>Masalan:</b> <i>7-sinf, 32 oʻquvchi. Tushuntirayotganimda orqa partalar gaplashadi, savolga doim 3–4 kishi javob beradi.</i>\n\n" +
    "Buyruqlar:\n/sinf — sinfingiz haqida maʼlumot (yosh, fan, hajm)\n/metodlar — metodlar kutubxonasi\n/qidir — metod qidirish\n/yangi — yangi suhbat" +
    (siteUrl ? "\n/sayt — veb-saytni ochish" : ""),
    { parse_mode: "HTML", reply_markup: siteButton() || undefined }));

  bot.command("sayt", ctx => siteUrl
    ? ctx.reply("Metodlar kutubxonasi va maslahatchi saytini shu yerda, Telegram ichida oching:", { reply_markup: siteButton() })
    : ctx.reply("Sayt manzili hali sozlanmagan."));

  bot.command("yangi", ctx => {
    const c = chat(ctx.chat.id);
    c.turns = [];
    return ctx.reply("Yangi suhbat boshlandi. Muammoingizni yozing.");
  });

  bot.command("sinf", ctx => {
    const c = chat(ctx.chat.id);
    const text = ctx.match.trim();
    if (!text) return ctx.reply(c.ctx
      ? `Hozirgi maʼlumot: ${c.ctx}\n\nOʻzgartirish uchun: /sinf 9-sinf, matematika, 30 oʻquvchi`
      : "Sinfingiz haqida yozing, masalan:\n/sinf 9-sinf, matematika, 30 oʻquvchi");
    c.ctx = text.slice(0, 300);
    return ctx.reply("Saqlandi. Endi barcha maslahatlar shu sinfga moslab beriladi.");
  });

  bot.command("metodlar", ctx => {
    const kb = new InlineKeyboard();
    Object.entries(CATS).forEach(([k, v], i) => { kb.text(`${v} (${METHODS.filter(m => m.c === k).length})`, "cat:" + k); if (i % 2) kb.row(); });
    return ctx.reply("Yoʻnalishni tanlang:", { reply_markup: kb });
  });

  bot.callbackQuery(/^cat:(\w+)$/, async ctx => {
    const k = ctx.match[1];
    const items = METHODS.map((m, i) => ({ m, i })).filter(x => x.m.c === k);
    const kb = new InlineKeyboard();
    items.forEach(({ m, i }) => kb.text(m.n.slice(0, 60), "m:" + i).row());
    await ctx.answerCallbackQuery();
    await ctx.reply(`<b>${esc(CATS[k] || "")}</b> — batafsil oʻqish uchun tanlang:`, { parse_mode: "HTML", reply_markup: kb });
  });

  bot.callbackQuery(/^m:(\d+)$/, async ctx => {
    const m = METHODS[Number(ctx.match[1])];
    await ctx.answerCallbackQuery();
    if (!m) return;
    await ctx.reply(
      `<b>${esc(m.n)}</b>\n<i>${esc(m.s)}</i>\n\n${esc(m.d)}\n\n<b>Dalil:</b> ${esc(m.e)}`,
      { parse_mode: "HTML", reply_markup: new InlineKeyboard().text("Sinfimda qanday qoʻllayman?", "ask:" + ctx.match[1]) });
  });

  bot.callbackQuery(/^ask:(\d+)$/, async ctx => {
    const m = METHODS[Number(ctx.match[1])];
    await ctx.answerCallbackQuery();
    if (m) await answer(ctx, `“${m.n}” metodini mening sinfimda qanday qoʻllashim mumkin? Qadamma-qadam tushuntiring va tipik xatolarni ayting.`);
  });

  bot.command("qidir", ctx => {
    const q = ctx.match.trim().toLowerCase();
    if (!q) return ctx.reply("Qidiruv soʻzini yozing, masalan: /qidir intizom");
    const found = METHODS.map((m, i) => ({ m, i })).filter(({ m }) => (m.n + m.s + m.d).toLowerCase().includes(q)).slice(0, 15);
    if (!found.length) return ctx.reply("Hech narsa topilmadi. Boshqa soʻz bilan urinib koʻring yoki muammoingizni toʻgʻridan-toʻgʻri yozing.");
    const kb = new InlineKeyboard();
    found.forEach(({ m, i }) => kb.text(m.n.slice(0, 60), "m:" + i).row());
    return ctx.reply(`Topildi: ${found.length} ta`, { reply_markup: kb });
  });

  bot.on("message:text", ctx => {
    if (ctx.message.text.startsWith("/")) return ctx.reply("Bunday buyruq yoʻq. /start ni bosing.");
    return answer(ctx, ctx.message.text);
  });

  async function answer(ctx, text) {
    const chatId = ctx.chat.id;
    const c = chat(chatId);
    if (c.busy) return ctx.reply("Oldingi savolingizga javob yozilyapti, biroz kuting.");
    if (!allow("tg:" + chatId)) return ctx.reply(ERR.rate_limited);
    c.busy = true;
    const placeholder = await ctx.reply("Metodlarni tanlayapman…");
    const typing = setInterval(() => ctx.api.sendChatAction(chatId, "typing").catch(() => {}), 4500);
    ctx.api.sendChatAction(chatId, "typing").catch(() => {});

    c.turns.push({ role: "user", content: text });
    const history = cleanHistory(c.turns).map((m, i, arr) =>
      i === arr.length - 1 && c.ctx ? { role: "user", content: `[Sinf haqida: ${c.ctx}]\n${m.content}` } : m);

    // Show the answer growing, at most every 2.5 s (Telegram limits edits).
    let partial = "", shown = "", last = 0;
    const onText = delta => {
      partial += delta;
      const now = Date.now();
      if (now - last > 2500 && partial.length - shown.length > 80 && partial.length < 3800) {
        last = now; shown = partial;
        ctx.api.editMessageText(chatId, placeholder.message_id, partial + " …").catch(() => {});
      }
    };
    try {
      const full = await advise(history, onText);
      c.turns.push({ role: "assistant", content: full });
      c.turns = c.turns.slice(-12);
      await sendRich(ctx.api, chatId, placeholder.message_id, full || "Javob boʻsh keldi. Qayta yozib koʻring.");
    } catch (e) {
      const code = errorCode(e);
      console.error("bot error:", code, e?.message);
      c.turns.pop();
      await ctx.api.editMessageText(chatId, placeholder.message_id, ERR[code] || ERR.upstream_error).catch(() => {});
    } finally {
      clearInterval(typing);
      c.busy = false;
    }
  }

  bot.catch(err => {
    const e = err.error;
    console.error("Telegram error:", e instanceof GrammyError ? e.description : e);
  });

  bot.api.setMyCommands([
    { command: "start", description: "Bot haqida" },
    { command: "sinf", description: "Sinfingiz haqida maʼlumot" },
    { command: "metodlar", description: "Metodlar kutubxonasi" },
    { command: "qidir", description: "Metod qidirish" },
    { command: "yangi", description: "Yangi suhbat" },
    ...(siteUrl ? [{ command: "sayt", description: "Veb-saytni ochish" }] : [])
  ]).catch(() => {});

  // The menu button next to the message field opens the site as a Mini App.
  if (siteUrl) bot.api.setChatMenuButton({ menu_button: { type: "web_app", text: "Sayt", web_app: { url: siteUrl } } })
    .catch(e => console.warn("Menyu tugmasi oʻrnatilmadi:", e.message));

  const announce = me => {
    console.log(`Telegram bot: @${me.username}`);
    process.env.TELEGRAM_BOT_USERNAME ||= me.username; // the site links to the bot
  };

  if (!publicUrl) {
    bot.start({ onStart: announce });
    return;
  }

  // Webhook mode: Telegram sends each message to our server. On hosts that sleep when idle
  // (Render's free plan) the incoming request wakes the server, which polling cannot do.
  const secret = crypto.createHash("sha256").update("webhook:" + token).digest("hex").slice(0, 32);
  const path = "/tg/" + secret.slice(0, 16);
  app.post(path, (req, res) => {
    if (req.get("X-Telegram-Bot-Api-Secret-Token") !== secret) return res.sendStatus(401);
    // Answer Telegram at once: a full answer can take a minute, and Telegram resends updates it waits too long for.
    res.sendStatus(200);
    bot.handleUpdate(req.body).catch(e => console.error("Telegram update error:", e));
  });
  bot.init()
    .then(() => bot.api.setWebhook(publicUrl.replace(/\/$/, "") + path, { secret_token: secret, drop_pending_updates: false }))
    .then(() => { announce(bot.botInfo); console.log("Webhook rejimi"); })
    .catch(e => console.error("Webhook oʻrnatilmadi:", e));
}
