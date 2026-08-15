// api/analyze-log.js
//
// Vercel serverless function. Deployed, this becomes:
//   POST https://<your-project>.vercel.app/api/analyze-log
//
// It matches the contract your daily_log_tab.tsx already expects:
//   Request:  { petName: string, logText: string }
//   Response: { summary: string, attributeChanges: Partial<Record<Attribute, number>> }

const ATTRIBUTES = ["speed", "intelligence", "mischief", "strength", "energy"];

const SYSTEM_PROMPT = `You are a friendly pet coach in a kids' pet-care app. A child describes what their virtual pet did today. Read the description and decide how much each attribute should increase.

Attributes and what they mean:
- speed: running, walking, chasing, agility
- intelligence: training, puzzles, learning tricks, problem solving
- mischief: sneaking around, digging, chewing things, curiosity, getting into trouble
- strength: tug of war, carrying/pulling things, physical exertion
- energy: play time, fetch, general activity and enthusiasm

Rules:
- Only include attributes that are actually supported by the log text.
- Each attribute change should be an integer from 1 to 2. Use 2 only for a clearly big or extended activity.
- If the log describes multiple distinct activities, you may increase multiple attributes.
- If the log doesn't describe anything pet-related, return an empty attributeChanges object and a gentle summary asking for a description of what the pet did.
- summary: one warm, encouraging sentence (max ~25 words) speaking directly to the child about their pet, in a playful tone. Do not just repeat the log text back.

Respond with ONLY a JSON object, no markdown fences, no extra text, in exactly this shape:
{"summary": "string", "attributeChanges": {"speed": 0, "intelligence": 0, "mischief": 0, "strength": 0, "energy": 0}}

Omit any attribute key from attributeChanges that didn't change (don't include zeros).`;

function setCors(res) {
  // Loosen/tighten origin as needed once you know your app's web origin.
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

module.exports = async (req, res) => {
  setCors(res);

  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { petName, logText } = req.body || {};

  if (!logText || typeof logText !== "string" || !logText.trim()) {
    return res.status(400).json({ error: "logText is required" });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error("Missing ANTHROPIC_API_KEY env var");
    return res.status(500).json({ error: "Server misconfigured" });
  }

  try {
    const claudeRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-5",
        max_tokens: 300,
        system: SYSTEM_PROMPT,
        messages: [
          {
            role: "user",
            content: `Pet name: ${petName || "the pet"}\nToday's log: ${logText.trim()}`,
          },
        ],
      }),
    });

    if (!claudeRes.ok) {
      const errText = await claudeRes.text();
      console.error("Anthropic API error:", claudeRes.status, errText);
      return res.status(502).json({ error: "AI request failed" });
    }

    const data = await claudeRes.json();
    const rawText = (data.content || [])
      .filter((block) => block.type === "text")
      .map((block) => block.text)
      .join("\n")
      .trim();

    const cleaned = rawText.replace(/^```json\s*|^```\s*|```$/g, "").trim();

    let parsed;
    try {
      parsed = JSON.parse(cleaned);
    } catch (parseErr) {
      console.error("Failed to parse model output:", rawText);
      return res.status(502).json({ error: "AI returned an unexpected format" });
    }

    const attributeChanges = {};
    if (parsed.attributeChanges && typeof parsed.attributeChanges === "object") {
      for (const key of ATTRIBUTES) {
        const val = parsed.attributeChanges[key];
        if (typeof val === "number" && val > 0) {
          attributeChanges[key] = Math.min(Math.round(val), 2);
        }
      }
    }

    const summary =
      typeof parsed.summary === "string" && parsed.summary.trim()
        ? parsed.summary.trim()
        : "Great job today!";

    return res.status(200).json({ summary, attributeChanges });
  } catch (err) {
    console.error("analyze-log error:", err);
    return res.status(500).json({ error: "Something went wrong" });
  }
};
