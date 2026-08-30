const fs = require('fs');
const path = require('path');

const persistentStorage = process.env.NODE_ENV === 'production' || fs.existsSync('/data');
const storageDirectory = persistentStorage ? '/data' : path.join(__dirname, '..', 'data');
const uploadDirectory = persistentStorage
  ? path.join(storageDirectory, 'uploads')
  : path.join(__dirname, '..', 'public', 'uploads');

fs.mkdirSync(uploadDirectory, { recursive: true });

module.exports = { persistentStorage, uploadDirectory };