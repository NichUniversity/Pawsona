// api/origin-story-finalize.js
//
// Vercel serverless function. Deployed, this becomes:
//   POST https://<your-project>.vercel.app/api/origin-story-finalize
//
// Writes the final Origin Story backstory (Daily Paw Log tab) from a
// completed interview.
//   Request:  { petName: string, category: string, mode: "true" | "legend", qaHistory: { question: string, answer: string }[] }
//   Response: { backstory: string }

const TRUE_SYSTEM_PROMPT = `You are a warm, imaginative storyteller writing a pet's origin story/backstory for a family pet-bonding app. You'll be given an owner's answers from a short interview about their pet.

Write a backstory that:
- Is EXACTLY 3 paragraphs, separated by a single blank line (\\n\\n between paragraphs, no other formatting, no markdown, no headers, no bullet points).
- Is warm, affectionate, and a little bit storybook-magical in tone, but still grounded in the specific details the owner shared — weave in real details (names, places, habits, moments) rather than generic filler.
- Each paragraph is roughly 60-100 words.
- Is written in third person about the pet, suitable for a family audience of all ages.
- Reads as a cohesive narrative arc across the three paragraphs: (1) where/how the bond began, (2) what the pet is like, including a meaningful shared moment, (3) what makes their bond special going forward.

Respond with ONLY a JSON object, no markdown fences, no extra text, in exactly this shape:
{"backstory": "string with \\n\\n between paragraphs"}`;

const LEGEND_SYSTEM_PROMPT = `You are a whimsical storyteller writing a pet's secret "past life" legend for a family pet-bonding app — the owner has imagined their pet secretly lived an extraordinary past life (as a ruler, warrior, explorer, magical creature, etc.) before becoming their everyday companion. You'll be given the owner's imaginative answers from a short interview.

Write a legend that:
- Is EXACTLY 3 paragraphs, separated by a single blank line (\\n\\n between paragraphs, no other formatting, no markdown, no headers, no bullet points).
- Is playful, epic, and a little tongue-in-cheek in tone — like a beloved storybook myth, never scary or dark.
- Weaves in the SPECIFIC imaginative details the owner gave (their pet's role, world, allies, feats) rather than generic fantasy filler.
- Each paragraph is roughly 60-100 words.
- Is written in third person, suitable for a family audience of all ages.
- Reads as a cohesive myth arc across the three paragraphs: (1) their legendary rise and role, (2) their reign or greatest feat and how it all came to an end, (3) their "rebirth" as today's pet, with a fun wink at how their old legendary traits still show up in daily life now.
- Keeps the setting an ORIGINAL, generic fantasy world — never real historical figures, real countries/nations, or existing copyrighted fictional worlds or characters.

Respond with ONLY a JSON object, no markdown fences, no extra text, in exactly this shape:
{"backstory": "string with \\n\\n between paragraphs"}`;

const { setCors } = require("./_lib/cors");

module.exports = async (req, res) => {
  setCors(res);

  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { petName, category, mode, qaHistory } = req.body || {};

  if (!Array.isArray(qaHistory) || qaHistory.length === 0) {
    return res.status(400).json({ error: "qaHistory is required" });
  }

  // Defaults to "true" for backward compatibility with older app builds
  // that don't send a mode yet.
  const systemPrompt = mode === "legend" ? LEGEND_SYSTEM_PROMPT : TRUE_SYSTEM_PROMPT;

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
        max_tokens: 700,
        system: systemPrompt,
        messages: [
          {
            role: "user",
            content: `Pet name: ${petName || "the pet"}\nCategory: ${
              category || "pet"
            }\n\nInterview:\n${transcript}`,
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

    const backstory =
      typeof parsed.backstory === "string" && parsed.backstory.trim()
        ? parsed.backstory.trim()
        : null;

    if (!backstory) {
      return res
        .status(502)
        .json({ error: "AI returned an empty backstory" });
    }

    return res.status(200).json({ backstory });
  } catch (err) {
    console.error("origin-story-finalize error:", err);
    return res.status(500).json({ error: "Something went wrong" });
  }
};