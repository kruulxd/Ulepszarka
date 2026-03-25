// ==UserScript==
// @name         ulepszator by Kruul
// @version      0.1.8
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_deleteValue
// @grant        GM_listValues
// ==/UserScript==

(function() {
  document.ulepszarka = { GM_getValue, GM_setValue, GM_deleteValue, GM_listValues };
  const script = document.createElement('script');
  script.src = 'https://raw.githubusercontent.com/kruulxd/Ulepszarka/main/ulepszarka-bundle.js?v=' + Date.now();
  document.body.appendChild(script);
})();
