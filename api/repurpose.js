const https = require('https');

module.exports = async function(req, res) {

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'GROQ_API_KEY not set in environment variables' });
  }

  let content, tone, platforms;
  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    content = body.content;
    tone = body.tone || 'professional';
    platforms = body.platforms || ['twitter','linkedin','instagram','youtube','newsletter'];
  } catch(e) {
    return res.status(400).json({ error: 'Invalid request body' });
  }

  const toneDesc = {
    professional: 'Professional and authoritative. Use insights and clear structure.',
    casual: 'Casual and friendly. Like talking to a friend.',
    funny: 'Funny and witty with humour and emojis.'
  };

  const platformInstructions = {
    twitter: 'A Twitter/X thread: start with "1/", write 4-5 short punchy tweets numbered 1/ 2/ 3/ etc, add emojis, max 280 chars per tweet',
    linkedin: 'A LinkedIn post: strong opening hook, use → bullet points, end with a question to drive comments, 150-300 words',
    instagram: 'An Instagram caption: catchy opening line, emojis throughout, end with 5-8 relevant hashtags',
    youtube: 'A YouTube video script with [INTRO] hook, [MAIN] key points, [CTA] asking to subscribe, conversational spoken language',
    newsletter: 'An email newsletter: warm greeting, personal conversational tone, short paragraphs, sign off with "— Jay"'
  };

  const results = {};

  for (const platform of platforms) {
    const prompt = `You are Sprouty, an AI content repurposing tool.

Repurpose the blog post below into ${platformInstructions[platform]}.
Tone: ${toneDesc[tone] || toneDesc.professional}

Return ONLY the content text. No labels. No JSON. No explanation. Just the ready-to-post content.

Blog post:
${content}`;

    const requestBody = JSON.stringify({
      model: 'llama-3.3-70b-versatile',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.7,
      max_tokens: 1024
    });

    try {
      const response = await new Promise((resolve, reject) => {
        const options = {
          hostname: 'api.groq.com',
          path: '/openai/v1/chat/completions',
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`,
            'Content-Length': Buffer.byteLength(requestBody)
          }
        };
        const r = https.request(options, (resp) => {
          let data = '';
          resp.on('data', chunk => { data += chunk; });
          resp.on('end', () => resolve({ status: resp.statusCode, body: data }));
        });
        r.on('error', reject);
        r.write(requestBody);
        r.end();
      });

      const parsed = JSON.parse(response.body);
      if (response.status === 200) {
        results[platform] = parsed.choices[0].message.content.trim();
      } else {
        const errMsg = parsed.error?.message || '';
        if (errMsg.includes('rate') || errMsg.includes('quota') || response.status === 429) {
          return res.status(200).json({ error: 'rate_limit' });
        }
        results[platform] = 'Could not generate. Please try again.';
      }
    } catch(e) {
      results[platform] = 'Network error. Please try again.';
    }
  }

  return res.status(200).json(results);
};