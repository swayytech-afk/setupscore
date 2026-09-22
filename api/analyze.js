export default async function handler(req, res) {
  // Allow cross-origin requests and POST only
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed. Use POST.' });
  }

  const { image } = req.body || {};
  if (!image) {
    return res.status(400).json({ error: 'No image data provided.' });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'Server API key missing. Configure GEMINI_API_KEY in Vercel.' });
  }

  // Strip base64 data header if present (e.g. "data:image/jpeg;base64,")
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
    "Strength 1",
    "Strength 2",
    "Strength 3"
  ],
  "improvements": [
    "Improvement 1",
    "Improvement 2",
    "Improvement 3"
  ]
}

All scores must be numbers between 0 and 10. Do not wrap the JSON in markdown code blocks.`;

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`,
      {
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
      }
    );

    const data = await response.json();

    if (!response.ok) {
      console.error('Gemini API Error:', data);
      return res.status(response.status).json({ error: 'Gemini API call failed', details: data });
    }

    // Extract text output from Gemini
    const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    
    // Clean code fences if Gemini returns ```json ... ```
    const cleanedJsonText = rawText.replace(/```json/g, '').replace(/```/g, '').trim();
    
    const parsedData = JSON.parse(cleanedJsonText);
    return res.status(200).json(parsedData);

  } catch (err) {
    console.error('Server error:', err);
    return res.status(500).json({ error: 'Failed to analyze image.', details: err.message });
  }
}
