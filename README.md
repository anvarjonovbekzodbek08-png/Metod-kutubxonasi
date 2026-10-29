# Ustoz Maslahatchisi

Oʻqituvchilar uchun AI maslahatchi. Oʻqituvchi sinfdagi muammosini yozadi, agent 207 ta isbotlangan metod, kitob va taʻlim tizimi asosida aniq yechim va ertangi dars rejasini beradi.

Bitta dastur ikki narsani ishga tushiradi:

- **Veb-sayt**: chat va metodlar kutubxonasi (`public/`)
- **Telegram bot**: xuddi shu agent, Telegram ichida (`src/bot.js`)

Ikkalasi bir xil bilim bazasidan foydalanadi: `src/knowledge.js`. Metod qoʻshish yoki tahrirlash uchun faqat shu faylni oʻzgartirish kifoya.

## Kerak boʻladigan narsalar

1. **Claude API kaliti.** [console.anthropic.com](https://console.anthropic.com) saytida roʻyxatdan oʻting, balansni toʻldiring va *API Keys* boʻlimida kalit yarating.
2. **Telegram bot tokeni.** Telegram'da [@BotFather](https://t.me/BotFather) ga `/newbot` yozing, bot nomini tanlang va bergan tokenni saqlang.
3. **Hosting** (dastur doim ishlab turadigan server). Quyida Render va Railway uchun yoʻriqnoma bor.

## Kompyuterda sinab koʻrish

Node.js 20 yoki undan yangi versiya kerak.

```bash
npm install
cp .env.example .env     # keyin .env ichiga kalit va tokenni yozing
npm start
```

Sayt: http://localhost:3000. Token berilgan boʻlsa, bot ham shu zahoti ishlaydi.

## Internetga joylash

### Railway (tavsiya etiladi)

1. Loyihani GitHub'ga yuklang.
2. [railway.com](https://railway.com) → *New Project* → *Deploy from GitHub repo* → shu repozitoriyni tanlang.
3. *Variables* boʻlimiga `.env.example` dagi qiymatlarni kiriting (`ANTHROPIC_API_KEY`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_BOT_USERNAME`).
4. *Settings → Networking → Generate Domain* tugmasi bilan saytga manzil oling.

### Render

1. [render.com](https://render.com) → *New* → *Web Service* → GitHub repozitoriyni ulang.
2. Build command: `npm install`, Start command: `npm start`.
3. *Environment* boʻlimiga oʻzgaruvchilarni kiriting.

Render'ning bepul tarifida server 15 daqiqa harakatsizlikdan keyin uxlab qoladi va bot javob bermay qoʻyadi. Bot doim ishlashi uchun pullik tarif yoki Railway kerak.

## Xarajat

Har bir savol Claude API balansingizdan pul sarflaydi. Bilim bazasi keshlanadi, shuning uchun takroriy soʻrovlar arzonroq. Xarajatni nazorat qilish uchun:

- `REQUESTS_PER_HOUR` bitta foydalanuvchi (IP yoki Telegram chat) soatiga necha savol bera olishini cheklaydi (standart: 20).
- console.anthropic.com da oylik xarajat chegarasini (*Limits*) qoʻying.
- Arzonroq ishlatish uchun `ANTHROPIC_MODEL=claude-sonnet-5-5` qilib qoʻyish mumkin.

## Bot buyruqlari

- `/start` — bot haqida
- `/sinf 9-sinf, matematika, 30 oʻquvchi` — sinf maʼlumotini saqlash, maslahatlar shunga moslanadi
- `/metodlar` — yoʻnalishlar boʻyicha kutubxona
- `/qidir intizom` — metod qidirish
- `/yangi` — suhbatni yangidan boshlash

Suhbat tarixi server xotirasida saqlanadi va server qayta ishga tushganda tozalanadi.
