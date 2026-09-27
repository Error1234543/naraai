const { createClient } = require('@supabase/supabase-js');
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;
const ownerEmail = process.env.OWNER_EMAIL;
let supabase = null;
if (supabaseUrl && supabaseKey) {
supabase = createClient(supabaseUrl, supabaseKey);
}
// Normalized Error Factory
const createError = (code, message, status = 500) => {
const err = new Error(message);
err.code = code;
err.status = status;
return err;
};
// Global Error Handler
const errorHandler = (err, req, res, next) => {
const status = err.status || 500;
const code = err.code || 'INTERNAL_ERROR';
const message = err.message || 'An unexpected error occurred.';
// Never expose stack traces or internal secrets to the client
res.status(status).json({ error: { code, message } });
};
// PHASE 5 & 14: Supabase Authorization & Owner Checking
const requireOwner = async (req, res, next) => {
// Modular fallback if backend is freshly deployed without Supabase configured yet
if (!supabaseUrl || !supabaseKey || !ownerEmail) {
return res.status(503).json({
error: {
code: 'AUTH_NOT_CONFIGURED',
message: 'Authentication is not configured on the server. Please check environment variables.'
}
});
}
const authHeader = req.headers.authorization;
if (!authHeader || !authHeader.startsWith('Bearer ')) {
return next(createError('AUTH_ERROR', 'Missing or invalid authorization header.', 401));
}
const token = authHeader.split(' ')[1];
// Secure server-side validation against Supabase JWT
const { data, error } = await supabase.auth.getUser(token);
if (error || !data.user) {
return next(createError('AUTH_ERROR', 'Invalid or expired access token.', 401));
}
// Strict Owner Verification
if (data.user.email !== ownerEmail) {
return next(createError('FORBIDDEN', 'Access denied. You are not the authorized owner.', 403));
}
req.user = data.user;
next();
};
module.exports = { createError, errorHandler, requireOwner, supabase };