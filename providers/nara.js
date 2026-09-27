const { createError } = require('./middleware');
const NARA_ROUTER = 'https://router.bynara.id/v1/chat/completions';
// PHASE 3 & 4: Multi-Model Routing & Streaming Implementation
const handleChat = async (req, res, next) => {
const { messages, model, temperature = 0.7, max_tokens = 4096, stream = false } = req.body;
const apiKey = process.env.NARA_API_KEY || process.env.AGNES_API_KEY;
if (!apiKey) return next(createError('CONFIG_ERROR', 'AI Provider API key is missing from environment.', 500));
try {
const response = await fetch(NARA_ROUTER, {
method: 'POST',
headers: {
'Content-Type': 'application/json',
'Authorization': Bearer ${apiKey}
},
body: JSON.stringify({ messages, model, temperature, max_tokens, stream })
});
// Error Normalization mapping
if (!response.ok) {
const status = response.status;
let code = 'PROVIDER_ERROR';
if (status === 401) code = 'AUTH_ERROR';
else if (status === 403) code = 'FORBIDDEN';
else if (status === 404) code = 'MODEL_NOT_FOUND';
else if (status === 429) code = 'RATE_LIMITED';
else if (status === 408) code = 'TIMEOUT';
let errorMessage = Provider returned an error: ${status};
try {
const errData = await response.json();
errorMessage = errData.error?.message || errorMessage;
} catch(e) {}
return next(createError(code, errorMessage, status));
}
// Handle streaming response compatible with frontend EventSource/Fetch API
if (stream) {
res.setHeader('Content-Type', 'text/event-stream');
res.setHeader('Cache-Control', 'no-cache');
res.setHeader('Connection', 'keep-alive');
const reader = response.body.getReader();
const decoder = new TextDecoder("utf-8");
while (true) {
const { done, value } = await reader.read();
if (done) {
res.end();
break;
}
res.write(decoder.decode(value, { stream: true }));
}
} else {
// Standard JSON response
const data = await response.json();
res.json(data);
}
} catch (error) {
next(createError('PROVIDER_ERROR', error.message || 'Failed to establish connection to the AI provider.', 500));
}
};
module.exports = { handleChat };