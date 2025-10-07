// utils/timestamp.js - Timestamp management

function getTimestamp() {
  const now = new Date();
  const ms = now.getMilliseconds().toString().padStart(3, '0');
  return `${now.toTimeString().split(' ')[0]}.${ms}`;
}

function setupTimestamp() {
  const originalLog = console.log;
  const originalError = console.error;
  console.log = (...args) => originalLog(`[${getTimestamp()}]`, ...args);
  console.error = (...args) => originalError(`[${getTimestamp()}]`, ...args);
}

module.exports = { getTimestamp, setupTimestamp };