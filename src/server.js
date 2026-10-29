// Website: serves the page and streams answers from /api/chat.
import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { advise, cleanHistory, errorCode } from "./advisor.js";
import { allow } from "./limits.js";

const here = path.dirname(fileURLToPath(import.meta.url));

export function startServer() {
  const app = express();
  app.set("trust proxy", 1); // hosting platforms put a proxy in front; use the real visitor IP
  app.use(express.json({ limit: "200kb" }));

  app.get("/knowledge.js", (_req, res) => res.sendFile(path.join(here, "knowledge.js")));
  app.use(express.static(path.join(here, "..", "public")));

  app.get("/api/config", (_req, res) => {
    res.json({ telegram: process.env.TELEGRAM_BOT_USERNAME || "" });
  });

  app.post("/api/chat", async (req, res) => {
    if (!allow("web:" + req.ip)) return res.status(429).json({ code: "rate_limited" });
    const messages = cleanHistory(req.body?.messages);
    if (!messages.length || messages.at(-1).role !== "user") return res.status(400).json({ code: "bad_request" });

    const ctl = new AbortController();
    res.on("close", () => { if (!res.writableEnded) ctl.abort(); });
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("X-Accel-Buffering", "no");
    try {
      await advise(messages, delta => res.write(delta), ctl.signal);
    } catch (e) {
      const code = errorCode(e);
      if (code !== "cancelled") console.error("chat error:", code, e?.message);
      // The page reads this marker; the text already sent stays on screen.
      if (!res.writableEnded) res.write("\u0000ERR:" + code);
    }
    res.end();
  });

  app.get("/healthz", (_req, res) => res.send("ok"));

  const port = Number(process.env.PORT) || 3000;
  app.listen(port, () => console.log(`Website: http://localhost:${port}`));
  return app;
}
