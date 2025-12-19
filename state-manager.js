// state-manager.js

let isProcessing = false;
let isWaitingRetry = false;

module.exports = {
  isProcessing: () => isProcessing,
  setProcessing: (v) => { isProcessing = !!v; },

  isWaitingRetry: () => isWaitingRetry,
  setWaitingRetry: (v) => { isWaitingRetry = !!v; }
};
