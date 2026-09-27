const archiver = require('archiver');
const path = require('path');

const { createError } = require('../middleware/auth');

// ZIP generation
const handleZip = (req, res, next) => {
  const {
    projectName = 'sonic-project',
    files
  } = req.body;

  // Validate files
  if (!Array.isArray(files) || files.length === 0) {
    return next(
      createError(
        'BAD_REQUEST',
        'No valid files provided for ZIP generation.',
        400
      )
    );
  }

  // Safety limit
  if (files.length > 500) {
    return next(
      createError(
        'LIMIT_EXCEEDED',
        'Project file count exceeds safety limits.',
        400
      )
    );
  }

  // ZIP response headers
  res.setHeader(
    'Content-Type',
    'application/zip'
  );

  res.setHeader(
    'Content-Disposition',
    `attachment; filename="${projectName}.zip"`
  );

  // Create ZIP archive
  const archive = archiver('zip', {
    zlib: {
      level: 9
    }
  });

  // Handle archive errors
  archive.on('error', (err) => {
    console.error('ZIP compilation error:', err);

    if (!res.headersSent) {
      return next(
        createError(
          'ZIP_ERROR',
          'Failed to generate project archive.',
          500
        )
      );
    }

    res.end();
  });

  // Pipe ZIP to response
  archive.pipe(res);

  // Add files
  for (const file of files) {
    const {
      path: filePath,
      content
    } = file;

    if (
      !filePath ||
      typeof content !== 'string'
    ) {
      continue;
    }

    // Path traversal protection
    const normalizedPath = path
      .normalize(filePath)
      .replace(/^(\.\.(\/|\\|$))+/, '');

    // Prevent absolute paths
    if (
      normalizedPath &&
      !path.isAbsolute(normalizedPath)
    ) {
      archive.append(content, {
        name: normalizedPath
      });
    }
  }

  // Finalize ZIP
  archive.finalize();
};

module.exports = {
  handleZip
};