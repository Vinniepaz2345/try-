// src/id.js

function generateId() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code = '';
  for (let i = 0; i < 8; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code.match(/.{1,2}/g).join('-'); // Splits into chunks like AB-CD-EF-GH
}

module.exports = generateId;
