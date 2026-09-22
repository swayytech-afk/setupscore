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
      return res.status(500).json({ 
        error: 'Missing API Key', 
        details: 'GEMINI_API_KEY environment variable is missing in Vercel settings.' 
      });
    }

    // Dynamic MIME detection and Base64 extraction
    const mimeMatch = image.match(/^data:(image\/\w+);base64,/);
    const mimeType = mimeMatch ? mimeMatch[1] : "image/jpeg";
    const base64Data = image.includes(',') ? image.split(',')[1] : image;

    const promptText = `
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

    // Candidate list starting with Gemini 3.6 Flash
    const candidateModels = [
      "gemini-3.6-flash",
      "gemini-3.5-flash",
      "gemini-2.0-flash",
      "gemini-1.5-flash"
    ];

    let lastError = null;

    for (const modelName of candidateModels) {
      const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`;

      const geminiRes = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                { text: promptText },
                {
                  inline_data: {
                    mime_type: mimeType,
                    data: base64Data
                  }
                }
              ]
            }
          ],
          generationConfig: {
            responseMimeType: "application/json",
            temperature: 0.4
          }
        })
      });

      if (geminiRes.ok) {
        const geminiData = await geminiRes.json();
        const candidateText = geminiData?.candidates?.[0]?.content?.parts?.[0]?.text;

        if (candidateText) {
          const parsedData = JSON.parse(candidateText);
          return res.status(200).json(parsedData);
        }
      }

      const errText = await geminiRes.text();
      let googleErrorMsg = errText;
      try {
        const parsedErr = JSON.parse(errText);
        if (parsedErr.error && parsedErr.error.message) {
          googleErrorMsg = parsedErr.error.message;
        }
      } catch (e) {}

      lastError = { status: geminiRes.status, message: googleErrorMsg };
    }

    return res.status(lastError?.status || 500).json({
      error: `Gemini API Error (${lastError?.status || 500})`,
      details: lastError?.message || "Failed across all candidate models."
    });

  } catch (err) {
    console.error("Vercel Function Error:", err);
    return res.status(500).json({ 
      error: "Server Error", 
      details: err.message || "Internal server error" 
    });
  }
};
