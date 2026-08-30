const fs = require('fs');
const path = require('path');

const uploadDirectory = path.join(__dirname, '..', 'uploads');

fs.mkdirSync(uploadDirectory, { recursive: true });

module.exports = { uploadDirectory };