const archiver = require('archiver');
const path = require('path');
const { createError } = require('./middleware');
// PHASE 7 & 8: Real File Generation and ZIP compilation
const handleZip = (req, res, next) => {
const { projectName = 'sonic-project', files } = req.body;
if (!Array.isArray(files) || files.length === 0) {
return next(createError('BAD_REQUEST', 'No valid files provided for ZIP generation.', 400));
}
if (files.length > 500) {
return next(createError('LIMIT_EXCEEDED', 'Project file count exceeds safety limits.', 400));
}
res.setHeader('Content-Type', 'application/zip');
res.setHeader(
  'Content-Disposition',
  `attachment; filename="${projectName}.zip"`
);
const archive = archiver('zip', { zlib: { level: 9 } });
archive.on('error', (err) => {
console.error('ZIP compilation error:', err);
if (!res.headersSent) {
next(createError('ZIP_ERROR', 'Failed to generate project archive.', 500));
} else {
res.end();
}
});
archive.pipe(res);
for (const file of files) {
const { path: filePath, content } = file;
if (!filePath || typeof content !== 'string') continue;
// Security: Path traversal protection
// Normalize the path and strip any attempts to traverse upwards
const safePath = path.normalize(filePath).replace(/^(..(/|\|$))+/, '');
// Ensure path isn't completely empty or an absolute root path
if (safePath && !path.isAbsolute(safePath)) {
archive.append(content, { name: safePath });
}
}
archive.finalize();
};
module.exports = { handleZip };