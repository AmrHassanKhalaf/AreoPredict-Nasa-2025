# النشر على Vercel — AeroPulse

هذا الملف يشرح ما تم تجهيزه في المشروع، وما تحتاجه للنشر، وطريقة التحقق بعد النشر.

---

## 1) ما تم تجهيزه في الكود

| الملف | الوظيفة |
| --- | --- |
| `api/weather.ts` | دالة Serverless لـ `GET /api/weather` |
| `api/cities.ts` | دالة Serverless لـ `GET /api/cities` |
| `api/analyze-environment.ts` | دالة Serverless لـ `POST /api/analyze-environment` |
| `api/health.ts` | فحص سريع للتأكد أن متغيرات البيئة وصلت للسيرفر |
| `lib/weather-service.ts` | منطق الطقس وجودة الهواء (Open-Meteo + WeatherAPI) |
| `lib/environment-service.ts` | منطق تحليل التلوث بالذكاء الاصطناعي (Gemini) |
| `lib/handlers.ts` | الـ handlers المشتركة بين Vercel و Express |
| `lib/http.ts` | أنواع ومساعدات HTTP مشتركة |
| `server.ts` | خادم Express للتشغيل المحلي أو على Render — **لا يُستخدم على Vercel** |
| `vercel.json` | إعدادات البناء، توجيه الـ SPA، ومدة تنفيذ الدوال |
| `.env.example` | أسماء متغيرات البيئة المطلوبة |

الفكرة: منطق التطبيق مكتوب مرة واحدة في `lib/`، و Vercel يستدعي handlers رقيقة من `api/`،
بينما `server.ts` يستدعي نفس الـ handlers محلياً. لا يوجد تكرار للكود.

---

## 2) ما تحتاجه فعلياً (غير Vercel و GitHub)

لا تحتاج قاعدة بيانات ولا أي خدمة مدفوعة.

1. **حساب GitHub** — لرفع الكود (مطلوب لربط المشروع بـ Vercel).
2. **حساب Vercel مجاني** — تسجّل فيه بحساب GitHub.
3. **مفتاح `GEMINI_API_KEY` (إلزامي للتحليل فقط)** — مجاني من
   [Google AI Studio](https://aistudio.google.com/apikey)، بدون بطاقة بنكية.
4. **مفتاح `WEATHER_API_KEY` (اختياري)** — مجاني من [WeatherAPI](https://www.weatherapi.com/).
   الكود يحتوي على مفتاح احتياطي، لكن مفتاحك الخاص أفضل.
5. Open-Meteo (الطقس + جودة الهواء + البحث عن المدن) **بدون مفتاح ولا تسجيل**.

اختياري: دومين خاص (مدفوع عادةً)، أو تفعيل Analytics من لوحة Vercel.

> ملاحظة: مفتاح Gemini المجاني له Rate Limit يومي. لو زاد الاستخدام تظهر رسالة
> "ضغط مؤقت على النموذج" — هذا سلوك طبيعي، أعد المحاولة بعد ثوانٍ.

---

## 3) رفع الكود على GitHub

على جهازك (Git و Node.js غير مثبتين حالياً في بيئة العمل هذه):

```bash
git init
git add .
git commit -m "Prepare project for Vercel deployment"
git branch -M main
git remote add origin https://github.com/<username>/<repo>.git
git push -u origin main
```

تأكد أن ملف `.env` **غير** مرفوع (موجود في `.gitignore`). الأسرار تُضاف في Vercel فقط.

---

## 4) النشر على Vercel

1. افتح <https://vercel.com/new> → **Import Git Repository** → اختر المستودع.
2. الإعدادات تُقرأ تلقائياً من `vercel.json`:
   - Framework Preset: **Vite**
   - Install Command: `npm install`
   - Build Command: `npm run build`
   - Output Directory: `dist`
   لا تغيّرها.
3. قبل الضغط على Deploy، افتح **Environment Variables** وأضف:

   | Name | Value | Environments |
   | --- | --- | --- |
   | `GEMINI_API_KEY` | مفتاحك من Google AI Studio | Production, Preview, Development |
   | `WEATHER_API_KEY` | مفتاحك من WeatherAPI (اختياري) | Production, Preview, Development |

4. اضغط **Deploy** وانتظر انتهاء البناء.
5. أي تعديل لاحق على متغيرات البيئة يحتاج **Redeploy** حتى يظهر أثره.

### تفعيل Fluid Compute (مهم لتحليل Gemini)

Project → **Settings → Functions → Fluid compute** = مفعّل.
هذا يسمح للدالة بالعمل حتى 60 ثانية بدل 10 ثوانٍ. القيمة مضبوطة مسبقاً في
`vercel.json` (`maxDuration: 60` لدالة التحليل).

إذا ظهر خطأ أثناء البناء يقول إن أقصى `maxDuration` هو 10، فمعناه أن Fluid Compute
غير مفعّل على حسابك: فعّله، أو خفّض الرقم في `vercel.json` ثم أعد النشر.

---

## 5) التحقق بعد النشر

استبدل `<your-app>` باسم مشروعك:

- `https://<your-app>.vercel.app/api/health`
  يجب أن يعرض `"ok": true` و `"geminiConfigured": true`.
  لو ظهر خطأ، الحقل `modules` يوضح أي وحدة فشلت وبنص الخطأ الأصلي (هذا أفضل من قراءة اللوجات).
- `https://<your-app>.vercel.app/api/weather?city=Cairo&lang=ar`
  يجب أن يرجع JSON فيه `location` و `current` و `forecast`.
- `https://<your-app>.vercel.app/api/cities?q=Cai&lang=en`
  يجب أن يرجع `suggestions`.
- الصفحة الرئيسية: `https://<your-app>.vercel.app`

---

## 6) التشغيل المحلي

```bash
cp .env.example .env     # ثم ضع مفاتيحك داخل .env
npm install
npm run dev      # http://localhost:3000 (Vite + Express في نفس المنفذ)
npm run lint     # فحص TypeScript
npm run build    # بناء الواجهة إلى dist/
```

`server.ts` يقرأ ملف `.env` تلقائياً (المتغيرات الموجودة في النظام لها الأولوية).

لتشغيل نسخة الإنتاج محلياً:

```bash
npm run build
npm run start:prod      # NODE_ENV=production tsx server.ts
```

> `start:prod` يستخدم صيغة متغيرات بيئة Unix. على Windows استخدم:
> `$env:NODE_ENV="production"; npx tsx server.ts`

---

## 7) بديل: Render أو أي استضافة Node

المشروع يعمل كما هو بدون أي تعديل:

- Build Command: `npm install && npm run build`
- Start Command: `npm run start:prod`
- Environment Variables: نفس المفاتيح (`GEMINI_API_KEY`, `WEATHER_API_KEY`)

---

## 8) أخطاء شائعة وحلولها

| الأعراض | السبب / الحل |
| --- | --- |
| `500` مع نص `A server error has occurred` في كل `/api/*` | الدالة تنهار قبل تنفيذ الكود (غالباً مشكلة تحميل وحدة/مسار). افتح `/api/health` — سيعرض اسم الخطأ الحقيقي لكل وحدة |
| `503` مع رسالة "Gemini API key is not configured" | `GEMINI_API_KEY` غير مضاف أو أضفته بعد آخر نشر → أعد Redeploy |
| `405 Method Not Allowed` | استدعاء `/api/weather` أو `/api/cities` بـ POST، أو `/api/analyze-environment` بـ GET |
| `504` أو انتهاء المهلة | فعّل Fluid Compute، وتأكد أن `maxDuration` مضبوط |
| الصفحة تظهر 404 عند تحديث مسار داخلي | تأكد أن `vercel.json` مرفوع كما هو (يحوي rewrite للـ SPA) |
| فشل البناء عند `npm install` | احذف `bun.lock` أو اتركه — Vercel يستخدم `npm install` لأن `installCommand` مضبوط |
| `Cannot find module '../lib/...'` | تأكد أن مجلد `lib/` مرفوع على GitHub (غير مستثنى في `.gitignore`) |
