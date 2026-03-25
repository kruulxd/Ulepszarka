// ==UserScript==
// @name         ulepszator by Kruul
// @namespace    http://tampermonkey.net/
// @version      0.2
// @description  Auto ulepszanie i rozbijanie
// @author       Kruul
// @match        https://*.margonem.pl/
// @updateURL    https://raw.githubusercontent.com/kruulxd/Ulepszarka/main/ulepszarka-wild.user.js
// @downloadURL  https://raw.githubusercontent.com/kruulxd/Ulepszarka/main/ulepszarka-wild.user.js
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_deleteValue
// @grant        GM_listValues
// ==/UserScript==

'use strict';
(function () {
  document.ulepszarka = {
    GM_getValue,
    GM_setValue,
    GM_deleteValue,
    GM_listValues
  };

  const script = document.createElement('script');
  script.src = 'https://raw.githubusercontent.com/kruulxd/Ulepszarka/main/ulepszarka-bundle.js?v=' + Date.now();
  document.body.appendChild(script);
})();
