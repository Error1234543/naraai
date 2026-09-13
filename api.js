// Vercel Serverless Function
// No installation needed - just deploy to Vercel!

const axios = require('axios');

const API_KEY = process.env.AGNES_API_KEY || 'YOUR_API_KEY_HERE';
const API_BASE_URL = 'https://router.bynara.id/v1';

module.exports = async (req, res) => {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { messages, model, temperature, max_tokens } = req.body;

    if (!messages) {
      return res.status(400).json({ error: 'messages required' });
    }

    console.log(`[${new Date().toISOString()}] API Request:`, {
      model: model || 'agnes-2.5-flash',
      messageCount: messages.length
    });

    const response = await axios.post(
      `${API_BASE_URL}/chat/completions`,
      {
        model: model || 'agnes-2.5-flash',
        messages: messages,
        temperature: temperature || 0.7,
        max_tokens: max_tokens || 2048,
        stream: false
      },
      {
        headers: {
          'Authorization': `Bearer ${API_KEY}`,
          'Content-Type': 'application/json'
        },
        timeout: 180000
      }
    );

    return res.status(200).json(response.data);

  } catch (error) {
    console.error('API Error:', error.message);

    if (error.response) {
      return res.status(error.response.status).json({
        error: error.response.data || error.message
      });
    }

    return res.status(500).json({
      error: error.message || 'Internal server error'
    });
  }
};
