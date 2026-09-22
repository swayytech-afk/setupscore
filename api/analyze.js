module.exports = async function handler(req, res) {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed. Use POST.' });
  }

  try {
    const { image } = req.body || {};
    if (!image) {
      return res.status(400).json({ error: 'No image data received by server.' });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ 
        error: 'GEMINI_API_KEY is missing in Vercel Environment Variables.' 
      });
    }

    // Clean Base64 header prefix
    const base64Data = image.replace(/^data:image\/\w+;base64,/, '');

    const prompt = `Analyse this gaming/desk setup photo as a professional setup reviewer.
Only judge things that can reasonably be seen in the image.

Return ONLY valid JSON using this exact structure:
{
  "overallScore": 8.4,
  "summary": "Short overall assessment of the setup",
  "categories": {
    "aesthetics": 8.5,
    "cableManagement": 7.2,
    "lighting": 9.1,
    "layout": 8.4,
    "equipment": 8.6
  },
  "strengths": [
    "Clean desk space and minimal clutter",
    "Balanced ambient RGB lighting",
    "Ergonomic dual-monitor placement"
  ],
  "improvements": [
    "Bundle visible hanging cables under the desk",
    "Add a desk mat to anchor the keyboard",
    "Elevate speakers to ear level"
  ]
}

All scores must be numbers between 0 and 10. Do not wrap the JSON in markdown code blocks.`;

    // Updated model endpoint identifier
    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;

    const response = await fetch(geminiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              { text: prompt },
              {
                inline_data: {
                  mime_type: 'image/jpeg',
                  data: base64Data,
                },
              },
            ],
          },
        ],
      })
    });

    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json({ 
        error: data.error?.message || 'Gemini API rejected the request.', 
        details: data 
      });
    }

    const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!rawText) {
      return res.status(500).json({ error: 'Gemini returned an empty response.' });
    }

    const cleanedJsonText = rawText.replace(/```json/gi, '').replace(/```/g, '').trim();
    const parsedJson = JSON.parse(cleanedJsonText);

    return res.status(200).json(parsedJson);

  } catch (err) {
    return res.status(500).json({ 
      error: 'Backend Execution Failure: ' + err.message 
    });
  }
};
