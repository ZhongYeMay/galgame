/* Android-only bridge: the unmodified original story and site/game.js
   run before this file. DeepSeek credentials stay in Android Java memory. */
(() => {
  'use strict';
  const listeners = [];
  window.chrome = window.chrome || {};
  window.chrome.webview = {
    postMessage(value) {
      if (!window.MayosNative || typeof window.MayosNative.postMessage !== 'function')
        throw new Error('Android native message channel unavailable');
      window.MayosNative.postMessage(JSON.stringify(value));
    },
    addEventListener(name, callback) {
      if (name === 'message' && typeof callback === 'function') listeners.push(callback);
    }
  };
  window.__mayosAndroidHostDeliver = function(payload) {
    try {
      const data = typeof payload === 'string' ? JSON.parse(payload) : payload;
      listeners.forEach(listener => listener({data}));
    } catch (_) {}
  };
  document.addEventListener('DOMContentLoaded', () => {
    // The application activity itself is immersive and landscape.
    // Suppress the browser-only rotate gate without altering site/game.js.
    if (typeof mobileEntered !== 'undefined') mobileEntered = true;
    if (typeof fit === 'function') fit();
  }, {once:true});
})();
