const { GoogleGenerativeAI } = require("@google/generative-ai");

module.exports = async function handler(req, res) {
  // CORS & Preflight headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed.' });
  }

  try {
    const { image } = req.body || {};
    if (!image) {
      return res.status(400).json({ error: 'No image data provided.' });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: 'GEMINI_API_KEY environment variable is missing on Vercel.' });
    }

    // Dynamic MIME type detection
    const mimeMatch = image.match(/^data:(image\/\w+);base64,/);
    const mimeType = mimeMatch ? mimeMatch[1] : "image/jpeg";
    const base64Data = image.replace(/^data:image\/\w+;base64,/, "");

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ 
      model: "gemini-1.5-flash",
      generationConfig: {
        responseMimeType: "application/json",
        temperature: 0.4
      }
    });

    const prompt = `
      You are an expert desk setup, workspace aesthetic, and gaming rig reviewer.
      Analyze this desk setup photo and evaluate these criteria:
      1. Overall Score (float from 1.0 to 10.0)
      2. Category scores (float from 1.0 to 10.0 each): Cables, Lighting, Aesthetics, Ergonomics, Hardware.
      3. Key Strengths (3 concise bullet points).
      4. Recommended Improvements (3 actionable bullet points).
      5. Summary (2 concise sentences summarizing workspace quality).

      Return a JSON object with this exact structure:
      {
        "overallScore": 8.4,
        "summary": "...",
        "categories": {
          "cables": 7.5,
          "lighting": 9.0,
          "aesthetics": 8.5,
          "ergonomics": 8.0,
          "hardware": 8.8
        },
        "strengths": ["...", "...", "..."],
        "improvements": ["...", "...", "..."]
      }
    `;

    const result = await model.generateContent([
      prompt,
      {
        inlineData: {
          data: base64Data,
          mimeType: mimeType
        }
      }
    ]);

    const rawText = result.response.text();
    const parsedData = JSON.parse(rawText);

    return res.status(200).json(parsedData);

  } catch (err) {
    console.error("API Error:", err);
    return res.status(500).json({ 
      error: "Failed to analyze setup photo.", 
      details: err.message || "Internal server error" 
    });
  }
};
