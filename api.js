const express = require('express');
const cors = require('cors');
const { errorHandler, requireOwner } = require('./middleware');
const { handleChat } = require('./nara');
const { handleZip } = require('./projects');
const { getModels } = require('./models');
// Load environment variables for local/Render deployment
if (process.env.NODE_ENV !== 'production') {
require('dotenv').config();
}
const app = express();
app.use(cors());
// Limit increased for large AI payloads, structured file data, and attachments
app.use(express.json({ limit: '50mb' }));
const router = express.Router();
// PHASE 12: Health Check
router.get('/health', (req, res) => {
res.json({ ok: true, service: 'sonic-ai-api', version: '1.0.0', provider: 'nara' });
});
// PHASE 13: Model List
router.get('/models', getModels);
// PHASE 2 & 4: Core Chat API with Streaming Support
router.post('/chat', requireOwner, handleChat);
// PHASE 8: ZIP / Project Generation
router.post('/projects/zip', requireOwner, handleZip);
// PHASE 6: Database Integration Prep (Stubs for Supabase DB)
router.get('/chats', requireOwner, (req, res) => res.json({ chats: [] }));
router.post('/chats', requireOwner, (req, res) => res.json({ id: 'new-chat-id' }));
app.use('/api', router);
// PHASE 17: Unified Error Formatting
app.use(errorHandler);
// Support for Render / Local execution (Vercel bypasses this)
if (process.env.NODE_ENV !== 'production' && !process.env.VERCEL) {
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(SONIC AI backend running on port ${PORT}));
}
module.exports = app;