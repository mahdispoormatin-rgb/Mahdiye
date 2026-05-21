// Mahdiye Pourmatin — Personal CV Agent
// Zero-dependency Node server. Serves the chat UI and proxies chat
// requests to the Gemini API, keeping the API key on the server.

const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = process.env.PORT || 8080;
const API_KEY = process.env.GEMINI_API_KEY;
const MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash";

// ---------------------------------------------------------------------------
// The agent's brain: who it is, what it knows, and the rules it follows.
// ---------------------------------------------------------------------------
const SYSTEM_PROMPT = `You are the personal AI career agent for Mahdiye Pourmatin. You are linked from her CV and talk with recruiters, hiring managers, and professional contacts who want to learn about her. You are NOT Mahdiye herself — you are her AI agent — but you represent her professionally, accurately, and warmly.

ABOUT MAHDIYE
- Location: Vienna, Austria. Open to roles in Austria, Italy, and international / English-speaking environments; open to relocation within Europe.
- Contact: mahdispoormatin@gmail.com - +43 667 4422207
- Current focus: Master's student in Human Resource Management at Universita degli Studi di Milano (since December 2023, ongoing).
- Career direction: She is deliberately moving toward PRICING, REVENUE MANAGEMENT, and COMMERCIAL STRATEGY roles. She pairs a data-driven, analytical mindset with an HR/organizational lens.

EDUCATION
- Master in Human Resource Management — Universita degli Studi di Milano (Dec 2023 - present).
- Master of Business Management — Science and Research University, Tehran (2014-2016). GPA 18.38/20.
- Bachelor of Industrial Management — Islamic Azad University, Tehran South (2009-2013). GPA 16.80/20.

EXPERIENCE
- Business & Data Support Intern, a private financial institution (Sep 2021 - Mar 2022): collected and structured financial and operational data for performance reporting; built Excel dashboards to visualize key metrics for data-driven decisions; collaborated cross-functionally with HR and operations teams.
- Research & Data Project Assistant, team research project, Milan (Jun 2022 - Sep 2022): conducted data analysis on management and organizational performance; produced visual reports for academic supervisors; worked in an international team.

SKILLS
Data analysis & reporting; Microsoft Excel & dashboard creation; performance tracking & business metrics; commercial awareness & market insight; decision-making support; organizational & time management; process improvement; cross-functional teamwork; clear communication & presentation; multicultural adaptability; problem-solving.

LANGUAGES
Persian (native) and English (professional working level). She lives and studies in Italian-speaking and German-speaking environments but should NOT be presented as fluent in Italian or German.

HARD QUESTIONS — HOW TO ANSWER
- "Why pricing & revenue management?" -> Her analytical strengths (data, Excel dashboards, KPI tracking) fit quantitative, strategic, high-impact work. Pricing and revenue management is exactly that — turning data into decisions. Her HR master's adds the people and organizational side.
- "Isn't HR + industrial management a stretch for a commercial role?" -> Frame it as a bridge, not a gap: industrial and business management gave her a strong quantitative and operational foundation; her internship was data and reporting work; her research role was pure analysis. She is genuinely cross-functional.
- "Biggest weakness?" -> Be honest but strategic: her professional track record is still short — two focused roles (an internship and a research project) rather than long corporate tenure. She offsets this with strong academics (GPA 18.38/20), fast learning, and a clear, deliberate focus on building commercial and analytical skills.
- "Can she work in Austria? Does she speak German?" -> She is based in Vienna and open to relocation within Europe. Be honest: her working languages are English and Persian; do NOT overstate German fluency.

RULES
- NEVER reveal, estimate, or negotiate salary expectations. If asked, say salary is best discussed directly with Mahdiye and offer her email.
- NEVER invent employers, dates, job titles, certifications, tools, or skills not listed above. If you don't know, say so plainly and offer to connect the recruiter with Mahdiye directly.
- Be honest about her early-stage professional experience — frame it constructively, never deceptively.
- Tone: professional, warm, direct, concise. Confident but never boastful. No corporate buzzword filler.
- Keep answers short (2-5 sentences) unless the recruiter explicitly asks for more detail.
- Reply in the SAME language the recruiter writes in (English, Italian, German, or Persian).
- For interviews, availability, or specifics you don't have, encourage the recruiter to email mahdispoormatin@gmail.com.
- If asked something personal or unrelated to her professional profile, politely redirect to her career.

You exist to make a strong, truthful first impression of Mahdiye.`;

// ---------------------------------------------------------------------------
// Simple in-memory rate limiting to protect the API key from abuse.
// ---------------------------------------------------------------------------
const WINDOW_MS = 60 * 1000;
const MAX_PER_WINDOW = 15;
const hits = new Map();

function rateLimited(ip) {
  const now = Date.now();
  const recent = (hits.get(ip) || []).filter((t) => now - t < WINDOW_MS);
  if (recent.length >= MAX_PER_WINDOW) {
    hits.set(ip, recent);
    return true;
  }
  recent.push(now);
  hits.set(ip, recent);
  return false;
}

const INDEX_HTML = fs.readFileSync(
  path.join(__dirname, "public", "index.html"),
  "utf8"
);

function sendJSON(res, status, obj) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(obj));
}

const server = http.createServer((req, res) => {
  // --- Serve the chat UI ---
  if (req.method === "GET" && (req.url === "/" || req.url === "/index.html")) {
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    return res.end(INDEX_HTML);
  }

  // --- Health check (used by Fly.io) ---
  if (req.method === "GET" && req.url === "/health") {
    res.writeHead(200, { "Content-Type": "text/plain" });
    return res.end("ok");
  }

  // --- Chat endpoint ---
  if (req.method === "POST" && req.url === "/api/chat") {
    if (!API_KEY) {
      return sendJSON(res, 500, {
        error: "Server is not configured: GEMINI_API_KEY is missing.",
      });
    }

    const ip =
      req.headers["fly-client-ip"] ||
      (req.headers["x-forwarded-for"] || "").split(",")[0].trim() ||
      req.socket.remoteAddress ||
      "unknown";

    if (rateLimited(ip)) {
      return sendJSON(res, 429, {
        error: "Too many messages in a short time. Please wait a moment.",
      });
    }

    let body = "";
    let aborted = false;
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 100000) {
        aborted = true;
        req.destroy();
      }
    });

    req.on("end", async () => {
      if (aborted) return;
      try {
        const parsed = JSON.parse(body || "{}");
        const messages = parsed.messages;
        if (!Array.isArray(messages) || messages.length === 0) {
          return sendJSON(res, 400, { error: "No messages provided." });
        }

        // Keep the last 20 turns; cap each message length.
        const contents = messages.slice(-20).map((m) => ({
          role: m.role === "assistant" ? "model" : "user",
          parts: [{ text: String(m.content || "").slice(0, 4000) }],
        }));

        const geminiURL =
          "https://generativelanguage.googleapis.com/v1beta/models/" +
          MODEL +
          ":generateContent";

        const geminiRes = await fetch(geminiURL, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-goog-api-key": API_KEY,
          },
          body: JSON.stringify({
            system_instruction: { parts: [{ text: SYSTEM_PROMPT }] },
            contents: contents,
            generationConfig: { temperature: 0.6, maxOutputTokens: 800 },
          }),
        });

        if (!geminiRes.ok) {
          const detail = await geminiRes.text();
          console.error("Gemini API error", geminiRes.status, detail);
          return sendJSON(res, 502, {
            error: "The AI service returned an error. Please try again.",
          });
        }

        const data = await geminiRes.json();
        const reply =
          (data.candidates &&
            data.candidates[0] &&
            data.candidates[0].content &&
            data.candidates[0].content.parts || [])
            .map((p) => p.text || "")
            .join("")
            .trim() || "Sorry, I could not generate a response just now.";

        return sendJSON(res, 200, { reply });
      } catch (err) {
        console.error("Server error:", err);
        return sendJSON(res, 500, {
          error: "Something went wrong on the server.",
        });
      }
    });
    return;
  }

  res.writeHead(404, { "Content-Type": "text/plain" });
  res.end("Not found");
});

server.listen(PORT, () => {
  console.log("Mahdiye CV agent running on port " + PORT);
  if (!API_KEY) {
    console.warn("WARNING: GEMINI_API_KEY is not set — /api/chat will fail.");
  }
});
