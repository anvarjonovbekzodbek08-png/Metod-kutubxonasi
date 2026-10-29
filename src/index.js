// Starts the website and, when a token is set, the Telegram bot in the same process.
import "dotenv/config";
import { startServer } from "./server.js";
import { startBot } from "./bot.js";

if (!process.env.ANTHROPIC_API_KEY) {
  console.error("ANTHROPIC_API_KEY topilmadi. .env faylga yoki hosting sozlamalariga qoʻshing.");
  process.exit(1);
}

const app = startServer();

// Render sets RENDER_EXTERNAL_URL itself; on other hosts set PUBLIC_URL to the site's https address.
const publicUrl = process.env.PUBLIC_URL || process.env.RENDER_EXTERNAL_URL || "";

if (process.env.TELEGRAM_BOT_TOKEN) startBot(process.env.TELEGRAM_BOT_TOKEN, app, publicUrl);
else console.log("TELEGRAM_BOT_TOKEN berilmagan: faqat veb-sayt ishga tushdi.");

// Render's free plan sleeps after 15 idle minutes; a request to ourselves every 10 minutes keeps the site awake.
if (publicUrl && process.env.KEEP_AWAKE !== "0") {
  setInterval(() => {
    fetch(publicUrl.replace(/\/$/, "") + "/healthz").catch(e => console.warn("keep-awake:", e.message));
  }, 600_000);
}
