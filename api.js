const express = require('express');
const cors = require('cors');

const {
  errorHandler,
  requireOwner
} = require('./middleware');

const { handleChat } = require('./nara');
const { handleZip } = require('./projects');
const { getModels } = require('./models');

// Load environment variables for local development
if (process.env.NODE_ENV !== 'production') {
  require('dotenv').config();
}

const app = express();

// CORS
app.use(cors());

// JSON body limit for AI payloads, files and attachments
app.use(express.json({ limit: '50mb' }));

const router = express.Router();


// ==========================================
// HEALTH CHECK
// ==========================================

router.get('/health', (req, res) => {
  res.json({
    ok: true,
    service: 'sonic-ai-api',
    version: '1.0.0',
    provider: 'nara'
  });
});


// ==========================================
// MODEL LIST
// ==========================================

router.get('/models', getModels);


// ==========================================
// AI CHAT
// ==========================================

router.post(
  '/chat',
  requireOwner,
  handleChat
);


// ==========================================
// PROJECT / ZIP GENERATION
// ==========================================

router.post(
  '/projects/zip',
  requireOwner,
  handleZip
);


// ==========================================
// CHAT DATABASE STUBS
// ==========================================

router.get(
  '/chats',
  requireOwner,
  (req, res) => {
    res.json({
      chats: []
    });
  }
);

router.post(
  '/chats',
  requireOwner,
  (req, res) => {
    res.json({
      id: 'new-chat-id'
    });
  }
);


// ==========================================
// API ROUTES
// ==========================================

app.use('/api', router);


// ==========================================
// ERROR HANDLER
// ==========================================

app.use(errorHandler);


// ==========================================
// SERVER
// ==========================================
// Render provides PORT automatically.
// Vercel does not need app.listen().

if (!process.env.VERCEL) {
  const PORT = process.env.PORT || 3000;

  app.listen(PORT, () => {
    console.log(`SONIC AI backend running on port ${PORT}`);
  });
}


// ==========================================
// EXPORT
// ==========================================

module.exports = app;