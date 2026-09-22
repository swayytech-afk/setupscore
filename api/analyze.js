module.exports = async function handler(req, res) {
  // CORS Headers
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

    // Candidate models to try in sequence if one hits high demand
    const models = ['gemini-3.6-flash', 'gemini-2.0-flash', 'gemini-1.5-flash'];
    let lastErrorMessage = '';

    for (const model of models) {
      for (let attempt = 1; attempt <= 2; attempt++) {
        try {
          const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

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

          if (response.ok) {
            const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text;
            if (rawText) {
              const cleanedJsonText = rawText.replace(/```json/gi, '').replace(/```/g, '').trim();
              const parsedJson = JSON.parse(cleanedJsonText);
              return res.status(200).json(parsedJson);
            }
          }

          lastErrorMessage = data.error?.message || `HTTP ${response.status}`;

          // If high demand or rate limit, wait 1 second before retrying
          if (response.status === 429 || response.status === 503 || lastErrorMessage.includes('high demand')) {
            await new Promise(r => setTimeout(r, 1000));
          } else {
            // Move on to next model if it's a non-capacity issue
            break;
          }
        } catch (err) {
          lastErrorMessage = err.message;
          await new Promise(r => setTimeout(r, 1000));
        }
      }
    }

    return res.status(503).json({ 
      error: `Gemini API is temporarily busy across all models. Please try again in 10 seconds. (${lastErrorMessage})` 
    });

  } catch (err) {
    return res.status(500).json({ 
      error: 'Backend Execution Failure: ' + err.message 
    });
  }
};
