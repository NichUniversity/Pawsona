// api/origin-story-question.js
//
// Vercel serverless function. Deployed, this becomes:
//   POST https://<your-project>.vercel.app/api/origin-story-question
//
// Generates the next interview question for a pet's Origin Story wizard
// (Daily Paw Log tab), building on whatever the owner has answered so far.
//   Request:  { petName: string, category: string, qaHistory: { question: string, answer: string }[] }
//   Response: { question: string }

const SYSTEM_PROMPT = `You are conducting a warm, gentle interview with a pet owner to help them build a heartfelt origin story for their pet, for a family pet-bonding app.

You'll be given the pet's name, species/category, and the questions asked so far along with the owner's answers.

Write ONE new follow-up question that:
- Builds naturally on what the owner has already shared (reference specific details when it makes sense).
- Is warm, easy to answer in a sentence or two, and never yes/no.
- Explores a NEW angle not already covered by earlier questions (e.g. personality quirks, a favorite memory, how they met, a funny habit, what makes the bond special).
- Is under 22 words.
- Speaks directly to the owner ("you"), and can reference the pet by name.

Respond with ONLY a JSON object, no markdown fences, no extra text, in exactly this shape:
{"question": "string"}`;

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

  const { petName, category, qaHistory } = req.body || {};

  if (!Array.isArray(qaHistory) || qaHistory.length === 0) {
    return res.status(400).json({ error: "qaHistory is required" });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error("Missing ANTHROPIC_API_KEY env var");
    return res.status(500).json({ error: "Server misconfigured" });
  }

  const transcript = qaHistory
    .map(
      (qa, i) =>
        `Q${i + 1}: ${String(qa?.question ?? "").trim()}\nA${i + 1}: ${String(
          qa?.answer ?? ""
        ).trim()}`
    )
    .join("\n\n");

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
        max_tokens: 200,
        system: SYSTEM_PROMPT,
        messages: [
          {
            role: "user",
            content: `Pet name: ${petName || "the pet"}\nCategory: ${
              category || "pet"
            }\n\nInterview so far:\n${transcript}`,
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
      return res
        .status(502)
        .json({ error: "AI returned an unexpected format" });
    }

    const question =
      typeof parsed.question === "string" && parsed.question.trim()
        ? parsed.question.trim()
        : null;

    if (!question) {
      return res.status(502).json({ error: "AI returned an empty question" });
    }

    return res.status(200).json({ question });
  } catch (err) {
    console.error("origin-story-question error:", err);
    return res.status(500).json({ error: "Something went wrong" });
  }
};