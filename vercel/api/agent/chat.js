const parseJsonSafely = (value) => {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
};

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  if (req.method !== 'POST') {
    res.status(405).send('Method Not Allowed');
    return;
  }

  const body = typeof req.body === 'string' ? parseJsonSafely(req.body) : req.body;
  const model = body?.model || process.env.OPENAI_MODEL || 'gpt-5.2';
  const messages = Array.isArray(body?.messages) ? body.messages : [];
  const temperature = typeof body?.temperature === 'number' ? body.temperature : 0.35;

  if (!messages.length) {
    res.status(400).json({ error: 'messages is required' });
    return;
  }

  const baseUrl = (process.env.OPENAI_BASE_URL || 'https://api.openai.com').replace(/\/$/, '');
  const response = await fetch(`${baseUrl}/v1/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ model, temperature, messages }),
  });

  const rawText = await response.text();
  if (!response.ok) {
    res.status(response.status).send(rawText || 'Upstream request failed');
    return;
  }

  const data = parseJsonSafely(rawText);
  const reply = data?.choices?.[0]?.message?.content?.trim() || '';
  res.status(200).json({ reply, raw: data });
};
