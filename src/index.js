// Starts the website and, when a token is set, the Telegram bot in the same process.
import "dotenv/config";
import { startServer } from "./server.js";
import { startBot } from "./bot.js";

if (!process.env.ANTHROPIC_API_KEY) {
  console.error("ANTHROPIC_API_KEY topilmadi. .env faylga yoki hosting sozlamalariga qoʻshing.");
  process.exit(1);
}

startServer();

if (process.env.TELEGRAM_BOT_TOKEN) startBot(process.env.TELEGRAM_BOT_TOKEN);
else console.log("TELEGRAM_BOT_TOKEN berilmagan: faqat veb-sayt ishga tushdi.");
