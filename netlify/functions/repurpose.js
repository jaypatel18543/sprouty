const https = require('https');

exports.handler = async function(event) {

  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'GROQ_API_KEY not set in Netlify environment variables' })
    };
  }

  let content, tone, platforms;
  try {
    const body = JSON.parse(event.body);
    content = body.content;
    tone = body.tone || 'professional';
    platforms = body.platforms || ['twitter','linkedin','instagram','youtube','newsletter'];
  } catch(e) {
    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({ error: 'Invalid request body: ' + e.message })
    };
  }

  const toneDesc = {
    professional: 'Professional and authoritative. Use insights and clear structure.',
    casual: 'Casual and friendly. Like talking to a friend.',
    funny: 'Funny and witty with humour and emojis.'
  };

  // Generate one platform at a time to avoid token limits
  const results = {};

  const platformPrompts = {
    twitter: 'A Twitter/X thread: start with "1/", write 4-5 short punchy tweets numbered 1/ 2/ 3/ etc, add emojis, max 280 chars per tweet',
    linkedin: 'A LinkedIn post: strong opening hook, use → bullet points, end with a question to drive engagement, 150-300 words',
    instagram: 'An Instagram caption: catchy opening line, emojis throughout, end with 5-8 relevant hashtags',
    youtube: 'A YouTube video script: include [INTRO] section with hook, [MAIN] section with key points, [CTA] section asking to subscribe',
    newsletter: 'An email newsletter: start with warm greeting like "Hi there,", personal conversational tone, short paragraphs, sign off with "— Jay"'
  };

  for (const platform of platforms) {
    const prompt = `You are Sprouty, an AI content repurposing tool.

Repurpose the blog post below into ${platformPrompts[platform]}.
Tone: ${toneDesc[tone] || toneDesc.professional}

Return ONLY the content text. No labels, no JSON, no explanation. Just the ready-to-post content.

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

        const req = https.request(options, (res) => {
          let data = '';
          res.on('data', (chunk) => { data += chunk; });
          res.on('end', () => resolve({ statusCode: res.statusCode, body: data }));
        });

        req.on('error', reject);
        req.write(requestBody);
        req.end();
      });

      const parsed = JSON.parse(response.body);

      if (response.statusCode === 200) {
        results[platform] = parsed.choices[0].message.content.trim();
      } else {
        results[platform] = 'Error generating this platform: ' + (parsed.error?.message || 'Unknown error');
      }

    } catch(e) {
      results[platform] = 'Network error for this platform. Please regenerate.';
    }
  }

  return {
    statusCode: 200,
    headers,
    body: JSON.stringify(results)
  };
};