// ==UserScript==
// @name         ulepszator
// @namespace    http://tampermonkey.net/
// @version      0.1.1
// @description  Auto ulepszanie i QoL do Margonem
// @author       You
// @match        https://*.margonem.pl/
// @updateURL    https://raw.githubusercontent.com/TWOJ_LOGIN/TWOJE_REPO/main/ulepszarka-wild.user.js
// @downloadURL  https://raw.githubusercontent.com/TWOJ_LOGIN/TWOJE_REPO/main/ulepszarka-wild.user.js
// @grant        none
// ==/UserScript==

const CONFIG = {
  DEFAULT_ALLOWED_RARITIES: ["common"],
  AVAILABLE_RARITIES: ["common", "unique", "heroic"],
  MAX_REAGENTS: 25,
  DEFAULT_HOTKEYS: {
    enhance: "j",
    gui: "u",
  },
  GUI_BUTTON_TEXT: "UL",
  DEFAULT_BUTTON_POSITION: {
    left: null,
    top: 150,
    right: 16,
  },
  DEFAULT_PANEL_POSITION: {
    left: null,
    top: 188,
    right: 16,
  },
  DEFAULT_AUTO_SETTINGS: {
    enabled: false,
    minFreeSlots: 6,
  },
  DAILY_RESET_TIME: {
    hour: 5,
    minute: 25,
  },
  AUTO_MIN_FREE_SLOTS_RANGE: {
    min: 1,
    max: 30,
  },
  DEFAULT_BOUND_SETTINGS: {
    allowSoulbound: false,
    allowPermbound: false,
  },
  DAILY_POINTS_DEFAULT: 0,
};

const CL = {
  ONE_HAND_WEAPON: 1,
  TWO_HAND_WEAPON: 2,
  ONE_AND_HALF_HAND_WEAPON: 3,
  DISTANCE_WEAPON: 4,
  HELP_WEAPON: 5,
  WAND_WEAPON: 6,
  ORB_WEAPON: 7,
  ARMOR: 8,
  HELMET: 9,
  BOOTS: 10,
  GLOVES: 11,
  RING: 12,
  NECKLACE: 13,
  SHIELD: 14,
  NEUTRAL: 15,
  CONSUME: 16,
  GOLD: 17,
  KEYS: 18,
  QUEST: 19,
  RENEWABLE: 20,
  ARROWS: 21,
  TALISMAN: 22,
  BOOK: 23,
  BAG: 24,
  BLESS: 25,
  UPGRADE: 26,
  RECIPE: 27,
  COINAGE: 28,
  QUIVER: 29,
  OUTFITS: 30,
  PETS: 31,
  TELEPORTS: 32,
};

const ALLOWED_ITEM_TYPES = [
  CL.ONE_HAND_WEAPON,
  CL.TWO_HAND_WEAPON,
  CL.ONE_AND_HALF_HAND_WEAPON,
  CL.DISTANCE_WEAPON,
  CL.HELP_WEAPON,
  CL.WAND_WEAPON,
  CL.ORB_WEAPON,
  CL.ARMOR,
  CL.HELMET,
  CL.BOOTS,
  CL.GLOVES,
  CL.RING,
  CL.NECKLACE,
  CL.SHIELD,
  CL.QUIVER,
];

(function () {
  const state = {
    windowEnabled: false,
    guiVisible: false,
    hotkeys: { ...CONFIG.DEFAULT_HOTKEYS },
    autoSettings: { ...CONFIG.DEFAULT_AUTO_SETTINGS },
    boundSettings: { ...CONFIG.DEFAULT_BOUND_SETTINGS },
    enhanceCounter: null,
    dailyEnhancePoints: CONFIG.DAILY_POINTS_DEFAULT,
    enhancementProgressHooked: false,
    lastProgressEventKey: null,
    lastProgressEventAt: 0,
    isEnhancing: false,
    lastAutoTriggerAt: 0,
  };

  const Utils = {
    sleep(ms) {
      return new Promise((resolve) => setTimeout(resolve, ms));
    },

    chunk(array, chunkSize) {
      const chunks = [];
      for (let i = 0; i < array.length; i += chunkSize) {
        chunks.push(array.slice(i, i + chunkSize));
      }
      return chunks;
    },

    getItemIdFromClassName(className) {
      if (!className) return null;
      const match = className.match(/item-id-(\d+)/);
      return match ? match[1] : null;
    },

    normalizeHotkey(value, fallback) {
      const input = String(value || "").trim().toLowerCase();
      if (!input) return fallback;
      return input[0];
    },

    extractItemIdFromText(raw) {
      if (!raw) return null;

      const text = String(raw);
      const classMatch = text.match(/item-id-(\d+)/);
      if (classMatch) return classMatch[1];

      const pureNumber = text.match(/^\d+$/);
      if (pureNumber) return pureNumber[0];

      return null;
    },

    resolveDroppedItemId(event) {
      const dataTransfer = event?.dataTransfer;
      if (dataTransfer) {
        const values = [];
        values.push(dataTransfer.getData("text/plain"));
        values.push(dataTransfer.getData("text"));
        values.push(dataTransfer.getData("itemId"));
        values.push(dataTransfer.getData("id"));

        if (Array.isArray(dataTransfer.types)) {
          dataTransfer.types.forEach((type) => {
            values.push(dataTransfer.getData(type));
          });
        }

        for (const value of values) {
          const itemId = Utils.extractItemIdFromText(value);
          if (itemId) return itemId;
        }
      }

      const draggedNode = document.querySelector(".ui-draggable-dragging");
      const className = draggedNode?.className;
      const classString =
        typeof className === "string" ? className : className?.baseVal;
      const draggedItemId = Utils.getItemIdFromClassName(classString);
      if (draggedItemId) return draggedItemId;

      const engineItemId =
        window.Engine?.interface?.cursorItem?.id ||
        window.Engine?.dragAndDrop?.item?.id ||
        window.Engine?.draggable?.item?.id;

      return engineItemId ? String(engineItemId) : null;
    },

    clamp(value, min, max) {
      return Math.min(Math.max(value, min), max);
    },

    toNumber(value, fallback) {
      const number = Number(value);
      return Number.isFinite(number) ? number : fallback;
    },

    normalizeText(value) {
      const polishMap = {
        ą: "a",
        ć: "c",
        ę: "e",
        ł: "l",
        ń: "n",
        ó: "o",
        ś: "s",
        ź: "z",
        ż: "z",
      };

      return String(value || "")
        .toLowerCase()
        .replace(/[ąćęłńóśźż]/g, (char) => polishMap[char] || char)
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "");
    },

    truncateText(value, maxLength = 28) {
      const text = String(value || "").trim();
      if (!text) return "Przedmiot";
      if (text.length <= maxLength) return text;
      return `${text.slice(0, Math.max(0, maxLength - 1))}…`;
    },

    formatEnhanceProgressMessage({
      itemName,
      count,
      limit,
      upgradeLevel,
      points,
    }) {
      const safeName = Utils.truncateText(itemName, 28);
      const safeCount = Number.isFinite(Number(count)) ? Number(count) : "?";
      const safeLimit = Number.isFinite(Number(limit)) ? Number(limit) : "?";
      const safeLevel = String(upgradeLevel ?? "?");
      const safePoints = Math.max(0, Math.floor(Utils.toNumber(points, 0)));

      return `${safeName} | ${safeCount}/${safeLimit} | +${safeLevel} | +${Utils.formatPoints(
        safePoints
      )} pkt`;
    },

    parseEnhanceCounter(rawText) {
      const text = String(rawText || "").trim();
      if (!text) return null;

      const digits = text.match(/\d+/g);
      if (!digits || digits.length < 2) return null;

      const current = Utils.toNumber(digits[0], NaN);
      const limit = Utils.toNumber(digits[1], NaN);

      if (!Number.isFinite(current) || !Number.isFinite(limit) || limit <= 0) {
        return null;
      }

      return {
        current,
        limit,
        text: `${current}/${limit}`,
      };
    },

    parsePointsNumber(rawText) {
      const text = String(rawText || "").trim();
      if (!text) return null;

      const compact = text.replace(/\s+/g, "");
      const match = compact.match(/[+-]?\d+/);
      if (!match) return null;

      const value = Utils.toNumber(match[0], NaN);
      return Number.isFinite(value) ? value : null;
    },

    getEnhancePreviewPoints() {
      const previewNode = document.querySelector(
        ".enhance__progress-text.enhance__progress-text--preview"
      );

      return Utils.parsePointsNumber(previewNode?.textContent);
    },

    formatPoints(value) {
      const points = Math.max(0, Math.floor(Utils.toNumber(value, 0)));
      return points.toLocaleString("pl-PL");
    },

    getDailyResetCycleKey(timestamp = Date.now()) {
      const currentDate = new Date(timestamp);
      if (Number.isNaN(currentDate.getTime())) return null;

      const resetDate = new Date(currentDate);
      resetDate.setHours(
        CONFIG.DAILY_RESET_TIME.hour,
        CONFIG.DAILY_RESET_TIME.minute,
        0,
        0
      );

      if (currentDate < resetDate) {
        resetDate.setDate(resetDate.getDate() - 1);
      }

      const year = resetDate.getFullYear();
      const month = String(resetDate.getMonth() + 1).padStart(2, "0");
      const day = String(resetDate.getDate()).padStart(2, "0");

      return `${year}-${month}-${day}`;
    },

  };

  const Storage = {
    getUpgradedItemKey() {
      return `upgrader-charId-${Engine.hero.d.id}`;
    },

    getRaritiesKey() {
      return `upgrader-rarities-charId-${Engine.hero.d.id}`;
    },

    getHotkeysKey() {
      return `upgrader-hotkeys-charId-${Engine.hero.d.id}`;
    },

    getGuiPositionKey() {
      return `upgrader-button-position-charId-${Engine.hero.d.id}`;
    },

    getPanelPositionKey() {
      return `upgrader-panel-position-charId-${Engine.hero.d.id}`;
    },

    getAutoSettingsKey() {
      return `upgrader-auto-settings-charId-${Engine.hero.d.id}`;
    },

    getBoundSettingsKey() {
      return `upgrader-bound-settings-charId-${Engine.hero.d.id}`;
    },

    getEnhanceCounterKey() {
      return `upgrader-enhance-counter-charId-${Engine.hero.d.id}`;
    },

    getDailyEnhancePointsKey() {
      return `upgrader-daily-enhance-points-charId-${Engine.hero.d.id}`;
    },

    getUpgradedItemId() {
      return window.localStorage.getItem(Storage.getUpgradedItemKey());
    },

    setUpgradedItemId(itemId) {
      window.localStorage.setItem(Storage.getUpgradedItemKey(), itemId);
    },

    getAllowedRarities() {
      const saved = window.localStorage.getItem(Storage.getRaritiesKey());
      if (!saved) {
        return [...CONFIG.DEFAULT_ALLOWED_RARITIES];
      }

      try {
        const parsed = JSON.parse(saved);
        if (!Array.isArray(parsed) || parsed.length === 0) {
          return [...CONFIG.DEFAULT_ALLOWED_RARITIES];
        }

        return parsed.filter((rarity) => CONFIG.AVAILABLE_RARITIES.includes(rarity));
      } catch (error) {
        return [...CONFIG.DEFAULT_ALLOWED_RARITIES];
      }
    },

    setAllowedRarities(rarities) {
      const normalized = rarities.filter((rarity) =>
        CONFIG.AVAILABLE_RARITIES.includes(rarity)
      );

      const finalRarities =
        normalized.length > 0 ? normalized : [...CONFIG.DEFAULT_ALLOWED_RARITIES];

      window.localStorage.setItem(
        Storage.getRaritiesKey(),
        JSON.stringify(finalRarities)
      );
    },

    getHotkeys() {
      const saved = window.localStorage.getItem(Storage.getHotkeysKey());
      if (!saved) {
        return { ...CONFIG.DEFAULT_HOTKEYS };
      }

      try {
        const parsed = JSON.parse(saved);
        return {
          enhance: Utils.normalizeHotkey(
            parsed?.enhance,
            CONFIG.DEFAULT_HOTKEYS.enhance
          ),
          gui: Utils.normalizeHotkey(parsed?.gui, CONFIG.DEFAULT_HOTKEYS.gui),
        };
      } catch (error) {
        return { ...CONFIG.DEFAULT_HOTKEYS };
      }
    },

    setHotkeys(hotkeys) {
      const normalized = {
        enhance: Utils.normalizeHotkey(
          hotkeys?.enhance,
          CONFIG.DEFAULT_HOTKEYS.enhance
        ),
        gui: Utils.normalizeHotkey(hotkeys?.gui, CONFIG.DEFAULT_HOTKEYS.gui),
      };

      window.localStorage.setItem(
        Storage.getHotkeysKey(),
        JSON.stringify(normalized)
      );

      return normalized;
    },

    getGuiPosition() {
      const saved = window.localStorage.getItem(Storage.getGuiPositionKey());
      if (!saved) {
        return { ...CONFIG.DEFAULT_BUTTON_POSITION };
      }

      try {
        const parsed = JSON.parse(saved);
        return {
          left:
            typeof parsed?.left === "number"
              ? parsed.left
              : CONFIG.DEFAULT_BUTTON_POSITION.left,
          top:
            typeof parsed?.top === "number"
              ? parsed.top
              : CONFIG.DEFAULT_BUTTON_POSITION.top,
          right:
            typeof parsed?.right === "number"
              ? parsed.right
              : CONFIG.DEFAULT_BUTTON_POSITION.right,
        };
      } catch (error) {
        return { ...CONFIG.DEFAULT_BUTTON_POSITION };
      }
    },

    setGuiPosition(position) {
      const normalized = {
        left:
          typeof position?.left === "number" ? Math.round(position.left) : null,
        top:
          typeof position?.top === "number"
            ? Math.round(position.top)
            : CONFIG.DEFAULT_BUTTON_POSITION.top,
        right:
          typeof position?.right === "number"
            ? Math.round(position.right)
            : CONFIG.DEFAULT_BUTTON_POSITION.right,
      };

      window.localStorage.setItem(
        Storage.getGuiPositionKey(),
        JSON.stringify(normalized)
      );

      return normalized;
    },

    getPanelPosition() {
      const saved = window.localStorage.getItem(Storage.getPanelPositionKey());
      if (!saved) {
        return { ...CONFIG.DEFAULT_PANEL_POSITION };
      }

      try {
        const parsed = JSON.parse(saved);
        return {
          left:
            typeof parsed?.left === "number"
              ? parsed.left
              : CONFIG.DEFAULT_PANEL_POSITION.left,
          top:
            typeof parsed?.top === "number"
              ? parsed.top
              : CONFIG.DEFAULT_PANEL_POSITION.top,
          right:
            typeof parsed?.right === "number"
              ? parsed.right
              : CONFIG.DEFAULT_PANEL_POSITION.right,
        };
      } catch (error) {
        return { ...CONFIG.DEFAULT_PANEL_POSITION };
      }
    },

    setPanelPosition(position) {
      const normalized = {
        left:
          typeof position?.left === "number" ? Math.round(position.left) : null,
        top:
          typeof position?.top === "number"
            ? Math.round(position.top)
            : CONFIG.DEFAULT_PANEL_POSITION.top,
        right:
          typeof position?.right === "number"
            ? Math.round(position.right)
            : CONFIG.DEFAULT_PANEL_POSITION.right,
      };

      window.localStorage.setItem(
        Storage.getPanelPositionKey(),
        JSON.stringify(normalized)
      );

      return normalized;
    },

    getAutoSettings() {
      const saved = window.localStorage.getItem(Storage.getAutoSettingsKey());
      if (!saved) {
        return { ...CONFIG.DEFAULT_AUTO_SETTINGS };
      }

      try {
        const parsed = JSON.parse(saved);
        return {
          enabled: Boolean(parsed?.enabled),
          minFreeSlots: Utils.clamp(
            Math.round(
              Utils.toNumber(
                parsed?.minFreeSlots,
                CONFIG.DEFAULT_AUTO_SETTINGS.minFreeSlots
              )
            ),
            CONFIG.AUTO_MIN_FREE_SLOTS_RANGE.min,
            CONFIG.AUTO_MIN_FREE_SLOTS_RANGE.max
          ),
        };
      } catch (error) {
        return { ...CONFIG.DEFAULT_AUTO_SETTINGS };
      }
    },

    setAutoSettings(settings) {
      const normalized = {
        enabled: Boolean(settings?.enabled),
        minFreeSlots: Utils.clamp(
          Math.round(
            Utils.toNumber(
              settings?.minFreeSlots,
              CONFIG.DEFAULT_AUTO_SETTINGS.minFreeSlots
            )
          ),
          CONFIG.AUTO_MIN_FREE_SLOTS_RANGE.min,
          CONFIG.AUTO_MIN_FREE_SLOTS_RANGE.max
        ),
      };

      window.localStorage.setItem(
        Storage.getAutoSettingsKey(),
        JSON.stringify(normalized)
      );

      return normalized;
    },

    getBoundSettings() {
      const saved = window.localStorage.getItem(Storage.getBoundSettingsKey());
      if (!saved) {
        return { ...CONFIG.DEFAULT_BOUND_SETTINGS };
      }

      try {
        const parsed = JSON.parse(saved);
        return {
          allowSoulbound: Boolean(parsed?.allowSoulbound),
          allowPermbound: Boolean(parsed?.allowPermbound),
        };
      } catch (error) {
        return { ...CONFIG.DEFAULT_BOUND_SETTINGS };
      }
    },

    setBoundSettings(settings) {
      const normalized = {
        allowSoulbound: Boolean(settings?.allowSoulbound),
        allowPermbound: Boolean(settings?.allowPermbound),
      };

      window.localStorage.setItem(
        Storage.getBoundSettingsKey(),
        JSON.stringify(normalized)
      );

      return normalized;
    },

    getEnhanceCounter() {
      const saved = window.localStorage.getItem(Storage.getEnhanceCounterKey());
      if (!saved) return null;

      try {
        const parsedPayload = JSON.parse(saved);
        const savedText = String(parsedPayload?.text || "").trim();
        const savedAt = Utils.toNumber(parsedPayload?.savedAt, NaN);

        if (!savedText || !Number.isFinite(savedAt)) {
          window.localStorage.removeItem(Storage.getEnhanceCounterKey());
          return null;
        }

        const currentCycleKey = Utils.getDailyResetCycleKey();
        const savedCycleKey = Utils.getDailyResetCycleKey(savedAt);

        if (!currentCycleKey || !savedCycleKey || currentCycleKey !== savedCycleKey) {
          window.localStorage.removeItem(Storage.getEnhanceCounterKey());
          return null;
        }

        const parsedCounter = Utils.parseEnhanceCounter(savedText);
        return parsedCounter ? parsedCounter.text : null;
      } catch (error) {
        window.localStorage.removeItem(Storage.getEnhanceCounterKey());
        return null;
      }
    },

    setEnhanceCounter(counterText) {
      if (!counterText) return;
      const payload = {
        text: String(counterText),
        savedAt: Date.now(),
      };

      window.localStorage.setItem(
        Storage.getEnhanceCounterKey(),
        JSON.stringify(payload)
      );
    },

    getDailyEnhancePoints() {
      const saved = window.localStorage.getItem(Storage.getDailyEnhancePointsKey());
      if (!saved) return CONFIG.DAILY_POINTS_DEFAULT;

      try {
        const payload = JSON.parse(saved);
        const points = Math.max(0, Math.floor(Utils.toNumber(payload?.points, 0)));
        const savedAt = Utils.toNumber(payload?.savedAt, NaN);

        if (!Number.isFinite(savedAt)) {
          window.localStorage.removeItem(Storage.getDailyEnhancePointsKey());
          return CONFIG.DAILY_POINTS_DEFAULT;
        }

        const currentCycleKey = Utils.getDailyResetCycleKey();
        const savedCycleKey = Utils.getDailyResetCycleKey(savedAt);

        if (!currentCycleKey || !savedCycleKey || currentCycleKey !== savedCycleKey) {
          window.localStorage.removeItem(Storage.getDailyEnhancePointsKey());
          return CONFIG.DAILY_POINTS_DEFAULT;
        }

        return points;
      } catch (error) {
        window.localStorage.removeItem(Storage.getDailyEnhancePointsKey());
        return CONFIG.DAILY_POINTS_DEFAULT;
      }
    },

    setDailyEnhancePoints(points) {
      const normalizedPoints = Math.max(0, Math.floor(Utils.toNumber(points, 0)));

      window.localStorage.setItem(
        Storage.getDailyEnhancePointsKey(),
        JSON.stringify({
          points: normalizedPoints,
          savedAt: Date.now(),
        })
      );

      return normalizedPoints;
    },

    addDailyEnhancePoints(pointsToAdd) {
      const delta = Math.floor(Utils.toNumber(pointsToAdd, 0));
      if (!Number.isFinite(delta) || delta <= 0) {
        return Storage.getDailyEnhancePoints();
      }

      const current = Storage.getDailyEnhancePoints();
      return Storage.setDailyEnhancePoints(current + delta);
    },
  };

  const EnhancementApi = {
    setEnhancedItem(itemId) {
      return new Promise((resolve) => {
        _g(`enhancement&action=status&item=${itemId}`, (data) => {
          resolve(data);
        });
      });
    },

    setReagents(itemId, reagentIds) {
      const reagents = reagentIds.join(",");
      return new Promise((resolve) => {
        _g(
          `enhancement&action=progress_preview&item=${itemId}&ingredients=${reagents}`,
          (data) => {
            resolve(data);
          }
        );
      });
    },

    enhanceItem(itemId, reagentIds) {
      if (!itemId || !reagentIds) return;
      const reagents = reagentIds.join(",");

      return new Promise((resolve) => {
        _g(
          `enhancement&action=progress&item=${itemId}&ingredients=${reagents}`,
          (data) => {
            resolve(data);
          }
        );
      });
    },
  };

  const Inventory = {
    isTruthyStatValue(value) {
      if (value === undefined || value === null) return false;
      if (typeof value === "boolean") return value;
      if (typeof value === "number") return value > 0;
      const normalized = String(value).trim().toLowerCase();
      if (!normalized) return false;
      return !["0", "false", "no", "none", "null", "undefined"].includes(
        normalized
      );
    },

    isExplicitFalseStatValue(value) {
      if (value === undefined || value === null) return false;
      if (typeof value === "boolean") return value === false;
      if (typeof value === "number") return value === 0;

      const normalized = Utils.normalizeText(String(value).trim());
      if (!normalized) return false;

      return ["0", "false", "no", "none", "null", "undefined", "off", "nie", "brak"].includes(
        normalized
      );
    },

    readBindState(item) {
      const stats = item?._cachedStats || {};
      const itemNode = document.querySelector(`.item-id-${item?.id}`);
      const domBindText = Utils.normalizeText(
        [
          itemNode?.getAttribute("data-tip"),
          itemNode?.getAttribute("tip"),
          itemNode?.getAttribute("data-stats"),
          itemNode?.getAttribute("data-item-tip"),
          itemNode?.getAttribute("data-hover"),
          item?.stat,
          item?.stats,
          item?.tip,
          item?.tooltip,
          item?.desc,
          item?.description,
        ]
          .filter((value) => value !== undefined && value !== null)
          .join(" | ")
      );
      const statsSerialized = Utils.normalizeText(JSON.stringify(stats));
      const bindParts = [
        stats.bind,
        stats.bound,
        stats.binds,
        stats.bound_to,
        stats.bound_type,
        stats.bind_type,
        stats.description,
      ]
        .filter((value) => value !== undefined && value !== null)
        .map((value) => Utils.normalizeText(value));

      const allStatsText = Utils.normalizeText(
        Object.values(stats)
          .filter((value) => typeof value === "string")
          .join(" | ")
      );

      const bindRaw = `${bindParts.join(" | ")} | ${allStatsText} | ${statsSerialized} | ${domBindText}`;

      const hasNegation = bindRaw.includes("niezwiaz") || bindRaw.includes("unbound");
      const hasAnyBindKeyword =
        bindRaw.includes("bind") ||
        bindRaw.includes("bound") ||
        bindRaw.includes("zwiaz") ||
        bindRaw.includes("wiaze po") ||
        bindRaw.includes("wiaze sie");

      const isBindsByBind =
        !hasNegation &&
        (bindRaw.includes("binds") ||
          bindRaw.includes("wiaze po zalozeniu") ||
          bindRaw.includes("wiaze po") ||
          bindRaw.includes("wiaze sie po") ||
          bindRaw.includes("bind on equip"));

      const isSoulboundByBind =
        !hasNegation &&
        (bindRaw.includes("soul") ||
          bindRaw.includes("zwiazany z wlascicielem") ||
          bindRaw.includes("zwiazany z graczem") ||
          bindRaw.includes("bound to owner") ||
          bindRaw.includes("ownerbound"));

      const isPermboundByBind =
        !hasNegation &&
        (bindRaw.includes("perm") ||
          bindRaw.includes("zwiazany na stale") ||
          bindRaw.includes("zwiazany z wlascicielem na stale") ||
          bindRaw.includes("bound forever") ||
          bindRaw.includes("permanent bound"));

      const isSoulboundByFlags = [
        stats.soulbound,
        stats.soul_bound,
        stats.bound_to_owner,
      ].some((value) => Inventory.isTruthyStatValue(value));

      const isPermboundByFlags = [
        stats.permbound,
        stats.perm_bound,
        stats.permanent_bound,
      ].some((value) => Inventory.isTruthyStatValue(value));

      const isBindsByFlags = [
        stats.binds,
        stats.bind_on_equip,
        stats.bindOnEquip,
      ].some((value) => Inventory.isTruthyStatValue(value));

      const isGenericBoundByFlags = [
        stats.bound,
        stats.bind,
        stats.binded,
        stats.locked,
      ].some((value) => Inventory.isTruthyStatValue(value));

      const explicitBindFlags = [
        stats.bound,
        stats.bind,
        stats.binded,
        stats.locked,
        stats.soulbound,
        stats.soul_bound,
        stats.bound_to_owner,
        stats.permbound,
        stats.perm_bound,
        stats.permanent_bound,
        stats.binds,
        stats.bind_on_equip,
        stats.bindOnEquip,
      ].filter((value) => value !== undefined && value !== null);

      const hasAnyExplicitBindFlag = explicitBindFlags.length > 0;
      const hasExplicitBindTrue = explicitBindFlags.some((value) =>
        Inventory.isTruthyStatValue(value)
      );
      const hasExplicitBindFalse = explicitBindFlags.some((value) =>
        Inventory.isExplicitFalseStatValue(value)
      );

      const isUnknownBound =
        !isSoulboundByBind &&
        !isPermboundByBind &&
        !isSoulboundByFlags &&
        !isPermboundByFlags &&
        !hasNegation &&
        (isGenericBoundByFlags || bindRaw.includes("zwiaz") || bindRaw.includes("bound"));

      const isDefinitelyUnboundByText =
        hasNegation ||
        bindRaw.includes("brak wzmianki odnosnie wiazania") ||
        bindRaw.includes("nie jest zwiazany") ||
        bindRaw.includes("not bound");

      const hasExplicitUnboundFlags =
        hasAnyExplicitBindFlag && !hasExplicitBindTrue && hasExplicitBindFalse;

      const isExplicitlySafeUnbound =
        isDefinitelyUnboundByText || hasExplicitUnboundFlags;

      const isSoulbound = isSoulboundByBind || isSoulboundByFlags;
      const isPermbound = isPermboundByBind || isPermboundByFlags;
      const isBinds = isBindsByBind || isBindsByFlags;

      let state = "unbound";
      if (isPermbound) {
        state = "permbound";
      } else if (isSoulbound) {
        state = "soulbound";
      } else if (isBinds) {
        state = "binds";
      } else if (isUnknownBound) {
        state = "unknown-bound";
      }

      return {
        isSoulbound,
        isPermbound,
        isBinds,
        isUnknownBound,
        hasAnyBindKeyword,
        hasNegation,
        isDefinitelyUnboundByText,
        hasExplicitUnboundFlags,
        isExplicitlySafeUnbound,
        state,
      };
    },

    isAlreadyEnhanced(item) {
      const stats = item?._cachedStats || {};

      const numericLevel = Utils.toNumber(
        stats.enhancement_upgrade_lvl ??
          stats.enhancementUpgradeLvl ??
          stats.upgrade_lvl ??
          stats.upgradeLevel,
        0
      );

      if (numericLevel > 0) {
        return true;
      }

      const enhancementFlags = [
        stats.enhanced,
        stats.is_enhanced,
        stats.isEnhanced,
        stats.was_enhanced,
        stats.wasEnhanced,
      ];

      return enhancementFlags.some((value) => Inventory.isTruthyStatValue(value));
    },

    canUseAsReagent(item, allowedRarities) {
      const itemRarity = item?._cachedStats?.rarity;
      const isAllowedRarity = allowedRarities.includes(itemRarity);
      const isAllowedType = ALLOWED_ITEM_TYPES.includes(item.cl);
      const canBeUsed = !item._cachedStats.hasOwnProperty("artisan_worthless");
      const isUpgraded = Inventory.isAlreadyEnhanced(item);

      const bindState = Inventory.readBindState(item);
      const boundSettings = state.boundSettings || CONFIG.DEFAULT_BOUND_SETTINGS;
      const strictNoBoundMode =
        !boundSettings.allowSoulbound && !boundSettings.allowPermbound;
      const isHeroic = itemRarity === "heroic";
      const isBoundBySoulOrPerm =
        bindState.state === "soulbound" || bindState.state === "permbound";

      if (isHeroic && isBoundBySoulOrPerm) {
        return false;
      }

      const canUseBoundByRarity = ["common", "unique"].includes(itemRarity);

      if (
        strictNoBoundMode &&
        ["soulbound", "permbound", "unknown-bound"].includes(bindState.state)
      ) {
        return false;
      }

      if (bindState.state === "soulbound" && (!boundSettings.allowSoulbound || !canUseBoundByRarity)) {
        return false;
      }

      if (bindState.state === "permbound" && (!boundSettings.allowPermbound || !canUseBoundByRarity)) {
        return false;
      }

      if (
        bindState.state === "unknown-bound" &&
        !boundSettings.allowSoulbound &&
        !boundSettings.allowPermbound
      ) {
        return false;
      }

      return (
        isAllowedRarity &&
        isAllowedType &&
        itemRarity &&
        canBeUsed &&
        !isUpgraded
      );
    },

    getReagents() {
      const allowedRarities = Storage.getAllowedRarities();
      const reagents = Engine.items.fetchLocationItems("g").reduce((acc, item) => {
        if (Inventory.canUseAsReagent(item, allowedRarities)) {
          acc.push(item.id);
        }
        return acc;
      }, []);

      return [...new Set(reagents)];
    },

    getFreeSlotsInfo() {
      const candidates = [];

      const addCandidate = (freeSlots, source, extra = {}) => {
        if (typeof freeSlots !== "number" || !Number.isFinite(freeSlots)) return;
        if (freeSlots < 0) return;
        candidates.push({ freeSlots, source, ...extra });
      };

      let directFree = null;
      if (
        window.Engine?.items?.getFreeSlots &&
        typeof window.Engine.items.getFreeSlots === "function"
      ) {
        try {
          directFree = window.Engine.items.getFreeSlots("g");
        } catch (error) {
          directFree = null;
        }

        addCandidate(directFree, "Engine.items.getFreeSlots('g')");

        if (!(typeof directFree === "number" && directFree >= 0)) {
          try {
            directFree = window.Engine.items.getFreeSlots();
          } catch (error) {
            directFree = null;
          }

          addCandidate(directFree, "Engine.items.getFreeSlots()");
        }
      }

      const bagNodes = [...document.querySelectorAll(".item.bag")];
      if (bagNodes.length > 0) {
        let hasParsedBagAmount = false;
        const freeFromBags = bagNodes.reduce((sum, node) => {
          const rawAmount = node.querySelector(".amount")?.textContent || "";
          const match = String(rawAmount).match(/\d+/);
          if (!match) return sum;

          hasParsedBagAmount = true;
          return sum + Utils.toNumber(match[0], 0);
        }, 0);

        if (hasParsedBagAmount) {
          addCandidate(freeFromBags, "DOM .item.bag .amount", {
            totalSlots: null,
            occupiedSlots: null,
            bagCount: bagNodes.length,
          });
        }
      }

      const emptySelectors = [
        ".inventory .item.empty",
        ".inventory .slot.empty",
        ".backpack .item.empty",
        ".backpack .slot.empty",
        ".bag .item.empty",
        ".bag .slot.empty",
        ".scroll-pane .item.empty",
        ".scroll-pane .slot.empty",
      ];

      const emptyCount = emptySelectors
        .map((selector) => document.querySelectorAll(selector).length)
        .reduce((sum, count) => sum + count, 0);

      if (emptyCount > 0) {
        addCandidate(emptyCount, "DOM .empty");
      }

      const inventoryRoot =
        document.querySelector(".inventory") ||
        document.querySelector(".backpack") ||
        document.querySelector(".bag") ||
        document.querySelector(".scroll-pane");

      if (inventoryRoot) {
        const totalSlots = inventoryRoot.querySelectorAll(".item, .slot").length;
        const occupiedSlots = Engine.items.fetchLocationItems("g").length;

        if (totalSlots > 0 && totalSlots >= occupiedSlots) {
          addCandidate(totalSlots - occupiedSlots, "DOM total - occupied", {
            totalSlots,
            occupiedSlots,
          });
        }

        const allItemNodes = [...inventoryRoot.querySelectorAll(".item")];
        const occupiedFromDom = allItemNodes.filter((node) => {
          const className = typeof node.className === "string" ? node.className : "";
          return /item-id-\d+/.test(className);
        }).length;

        if (allItemNodes.length > 0 && allItemNodes.length >= occupiedFromDom) {
          addCandidate(allItemNodes.length - occupiedFromDom, "DOM .item - .item-id-*", {
            totalSlots: allItemNodes.length,
            occupiedSlots: occupiedFromDom,
          });
        }
      }

      const scrollPane = document.querySelector(".scroll-pane");
      if (scrollPane) {
        const slotNodes = scrollPane.querySelectorAll(".item, .slot");
        if (slotNodes.length > 0) {
          const occupiedInScrollPane = [...slotNodes].filter((node) => {
            const className = typeof node.className === "string" ? node.className : "";
            return /item-id-\d+/.test(className);
          }).length;

          addCandidate(
            slotNodes.length - occupiedInScrollPane,
            "scroll-pane slots - item-id-*",
            {
              totalSlots: slotNodes.length,
              occupiedSlots: occupiedInScrollPane,
            }
          );
        }
      }

      if (candidates.length > 0) {
        candidates.sort((a, b) => b.freeSlots - a.freeSlots);
        return candidates[0];
      }

      return {
        freeSlots: null,
        source: "unknown",
      };
    },

    getFreeSlots() {
      return Inventory.getFreeSlotsInfo().freeSlots;
    },

    getUpgradeableCandidates() {
      return Engine.items
        .fetchLocationItems("g")
        .filter((item) => ALLOWED_ITEM_TYPES.includes(item?.cl));
    },
  };

  const Ui = {
    setupCss() {
      const css = `
      .upgrader-crafting-window {
        display: none !important;
      }
      .menu-item--yellow {
        background: linear-gradient(90deg, #5b8cff, #a855f7) !important;
        color: #fff !important;
        border-radius: 5px !important;
        padding: 5px !important;
      }
      .upgrader-label {
          position: absolute;
          top: 18px;
          left: 8px;
          height: 16px;
          width: 32px;
          text-align: center;
          color: yellow;
          pointer-events: none;
          text-shadow: -2px 0 black, 0 2px black, 2px 0 black, 0 -2px black;
          font-size: 0.75rem;
      }
          .upgrader-launcher {
            position: fixed;
            right: 16px;
            top: 150px;
            width: 146px;
            z-index: 12;
            border: 1px solid rgba(91, 140, 255, 0.28);
            border-radius: 10px;
            background: linear-gradient(180deg, rgba(7,16,40,0.96), rgba(11,18,32,0.96));
            color: #e6eef8;
            cursor: url(https://pub-05e2f98fb5b34633ae42c4866ef64081.r2.dev/assets/img/cursor/1n.png), auto;
            font-weight: 700;
            font-family: Arial, sans-serif;
            box-shadow: 0 8px 24px rgba(2, 6, 23, 0.6);
            user-select: none;
            padding: 6px;
            box-sizing: border-box;
          }
          .upgrader-launcher-title {
            font-size: 12px;
            font-weight: 700;
            text-align: center;
            cursor: move;
            color: #a855f7;
          }
          .upgrader-launcher-counter {
            margin-top: 4px;
            margin-bottom: 3px;
            text-align: center;
            font-size: 10px;
            color: #9aa6bf;
          }
          .upgrader-launcher-points {
            margin-bottom: 6px;
            text-align: center;
            font-size: 10px;
            color: #b7c3dd;
          }
          .upgrader-launcher-counter--good {
            color: #88d27a;
          }
          .upgrader-launcher-counter--mid {
            color: #f0dc71;
          }
          .upgrader-launcher-counter--low {
            color: #ff8d8d;
          }
          .upgrader-launcher-row {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 4px;
          }
          .upgrader-launcher-btn {
            border: 1px solid rgba(91, 140, 255, 0.28);
            border-radius: 6px;
            background: rgba(255,255,255,0.03);
            color: #e6eef8;
            height: 24px;
            font-family: Arial, sans-serif;
            font-size: 10px;
            cursor: url(https://pub-05e2f98fb5b34633ae42c4866ef64081.r2.dev/assets/img/cursor/1n.png), auto;
          }
          .upgrader-launcher-btn:hover {
            background: linear-gradient(90deg, rgba(91,140,255,0.25), rgba(168,85,247,0.25));
            border-color: rgba(168,85,247,0.55);
          }
          .upgrader-gui-panel {
            position: fixed;
            right: 16px;
            top: 188px;
            width: 260px;
            z-index: 11;
            border: 1px solid rgba(91, 140, 255, 0.26);
            border-radius: 12px;
            background: linear-gradient(180deg, rgba(7,16,40,0.96), rgba(11,18,32,0.96));
            backdrop-filter: blur(2px);
            color: #e6eef8;
            padding: 8px;
            display: none;
            box-sizing: border-box;
            overflow: visible;
            user-select: none;
            font-family: Arial, sans-serif;
            cursor: url(https://pub-05e2f98fb5b34633ae42c4866ef64081.r2.dev/assets/img/cursor/1n.png), auto;
            box-shadow: 0 10px 30px rgba(2, 6, 23, 0.7);
          }
          .upgrader-gui-title {
            font-size: 13px;
            font-weight: 700;
            margin-bottom: 6px;
            cursor: move;
            padding: 3px 2px;
            border-bottom: 1px solid rgba(91,140,255,0.22);
            color: #a855f7;
          }
          .upgrader-gui-row {
            display: flex;
            gap: 6px;
            margin-top: 6px;
          }
          .upgrader-gui-btn {
            border: 1px solid rgba(91,140,255,0.28);
            border-radius: 6px;
            background: rgba(255,255,255,0.03);
            color: #e6eef8;
            height: 26px;
            font-family: Arial, sans-serif;
            cursor: url(https://pub-05e2f98fb5b34633ae42c4866ef64081.r2.dev/assets/img/cursor/1n.png), auto;
          }
          .upgrader-gui-btn {
            padding: 0 8px;
            cursor: pointer;
            font-size: 11px;
          }
          .upgrader-gui-btn:hover {
            background: linear-gradient(90deg, rgba(91,140,255,0.25), rgba(168,85,247,0.25));
            border-color: rgba(168,85,247,0.55);
          }
            .upgrader-select-hint {
              margin-top: 6px;
              border: 1px solid rgba(91,140,255,0.18);
              border-radius: 6px;
              padding: 6px;
              background: rgba(255,255,255,0.02);
              font-size: 11px;
              color: #9aa6bf;
            }
            .upgrader-selected-preview-wrap {
              margin-top: 6px;
              border: 1px solid rgba(91,140,255,0.18);
              border-radius: 6px;
              padding: 6px;
              background: rgba(255,255,255,0.02);
            }
            .upgrader-selected-preview-box {
              min-height: 40px;
              display: flex;
              align-items: center;
              gap: 6px;
              position: relative;
            }
            .upgrader-selected-preview-item {
              width: 32px;
              height: 32px;
              position: relative !important;
              left: 0 !important;
              top: 0 !important;
              right: auto !important;
              bottom: auto !important;
              margin: 0 !important;
              transform: none !important;
              display: block !important;
              flex: 0 0 auto;
              overflow: hidden;
            }
            .upgrader-selected-preview-item .highlight {
              position: absolute !important;
              top: 0 !important;
              left: 0 !important;
              width: 32px !important;
              height: 32px !important;
              pointer-events: none;
              z-index: 0;
            }
            .upgrader-selected-preview-icon {
              width: 32px;
              height: 32px;
              display: block;
              flex: 0 0 auto;
              image-rendering: auto;
              position: relative;
              z-index: 1;
            }
            .upgrader-selected-preview-text {
              font-size: 11px;
              color: #e6eef8;
              word-break: break-word;
            }
            .upgrader-gui-rarity-wrap {
              margin-top: 6px;
              border: 1px solid rgba(91,140,255,0.18);
              border-radius: 6px;
              padding: 6px;
              background: rgba(255,255,255,0.02);
            }
            .upgrader-gui-rarity-title {
              font-size: 11px;
              margin-bottom: 4px;
              color: #c9d8ef;
            }
            .upgrader-gui-rarity-list {
              display: flex;
              gap: 8px;
              flex-wrap: wrap;
            }
            .upgrader-gui-rarity-item {
              display: inline-flex;
              align-items: center;
              gap: 4px;
              font-size: 11px;
            }
            .upgrader-rarity-common {
              color: #9b9b9b;
            }
            .upgrader-rarity-unique {
              color: #f0dc71;
            }
            .upgrader-rarity-heroic {
              color: #7fb6ff;
            }
            .upgrader-bound-wrap {
              margin-top: 6px;
              border: 1px solid rgba(91,140,255,0.18);
              border-radius: 6px;
              padding: 6px;
              background: rgba(255,255,255,0.02);
            }
            .upgrader-bound-item {
              display: flex;
              align-items: center;
              justify-content: space-between;
              gap: 10px;
              font-size: 11px;
              color: #e6eef8;
              margin-bottom: 4px;
            }
            .upgrader-bound-item:last-child {
              margin-bottom: 0;
            }
            .upgrader-bound-warning {
              margin-top: 4px;
              font-size: 10px;
              color: #ff9e9e;
              display: inline-flex;
              align-items: center;
              gap: 6px;
            }
            .upgrader-tooltip-trigger {
              position: relative;
              display: inline-flex;
              align-items: center;
              justify-content: center;
              width: 14px;
              height: 14px;
              border-radius: 50%;
              border: 1px solid rgba(91,140,255,0.45);
              color: #cfd9ef;
              font-size: 10px;
              line-height: 1;
              background: rgba(255,255,255,0.04);
              cursor: help;
            }
            .upgrader-tooltip-trigger[data-tooltip]:hover::after {
              content: attr(data-tooltip);
              position: absolute;
              left: 0;
              bottom: calc(100% + 6px);
              max-width: 220px;
              padding: 6px 8px;
              border-radius: 6px;
              border: 1px solid rgba(91,140,255,0.3);
              background: linear-gradient(180deg, rgba(7,16,40,0.96), rgba(11,18,32,0.96));
              color: #e6eef8;
              font-size: 10px;
              line-height: 1.35;
              white-space: normal;
              z-index: 15;
              box-shadow: 0 8px 24px rgba(2,6,23,0.6);
              pointer-events: none;
            }
            .upgrader-hotkeys-wrap {
              margin-top: 6px;
              border: 1px solid rgba(91,140,255,0.18);
              border-radius: 6px;
              padding: 6px;
              background: rgba(255,255,255,0.02);
            }
            .upgrader-hotkeys-grid {
              display: grid;
              grid-template-columns: 1fr 38px;
              gap: 4px;
            }
            .upgrader-hotkeys-label {
              font-size: 11px;
              color: #c9d8ef;
              align-self: center;
            }
            .upgrader-hotkeys-input {
              border: 1px solid rgba(91,140,255,0.28);
              border-radius: 4px;
              background: rgba(255,255,255,0.03);
              color: #e6eef8;
              height: 22px;
              text-align: center;
              font-family: Arial, sans-serif;
              cursor: url(https://pub-05e2f98fb5b34633ae42c4866ef64081.r2.dev/assets/img/cursor/1n.png), auto;
            }
            .upgrader-auto-wrap {
              margin-top: 6px;
              border: 1px solid rgba(91,140,255,0.18);
              border-radius: 6px;
              padding: 6px;
              background: rgba(255,255,255,0.02);
            }
            .upgrader-auto-row {
              display: flex;
              align-items: center;
              justify-content: space-between;
              gap: 6px;
              margin-bottom: 6px;
              font-size: 11px;
              color: #e6eef8;
            }
            .upgrader-auto-slider {
              width: 100%;
            }
            .upgrader-auto-slider:disabled {
              opacity: 0.45;
            }
            .upgrader-auto-info {
              margin-top: 4px;
              font-size: 10px;
              color: #9aa6bf;
            }
            .upgrader-auto-debug {
              margin-top: 4px;
              font-size: 10px;
              color: #8b98b5;
              white-space: pre-wrap;
            }
    `;

      const style = document.createElement("style");
      style.appendChild(document.createTextNode(css));
      document.head.appendChild(style);
    },

    toggleEnhancementWindow() {
      if (state.windowEnabled) {
        Engine.crafting.window.wnd.$.removeClass("upgrader-crafting-window");
        Engine.interface.clickCrafting();
        state.windowEnabled = false;
        return;
      }

      Engine.crafting.window.wnd.$.addClass("upgrader-crafting-window");
      Engine.interface.clickCrafting();
      state.windowEnabled = true;
    },

    isCraftingWindowOpen() {
      const windowNode = Engine?.crafting?.window?.wnd?.$;
      if (!windowNode) return false;

      try {
        if (typeof windowNode.is === "function") {
          return windowNode.is(":visible");
        }

        const rawNode = windowNode[0];
        if (rawNode) {
          const computedStyle = window.getComputedStyle(rawNode);
          return (
            computedStyle.display !== "none" &&
            computedStyle.visibility !== "hidden" &&
            computedStyle.opacity !== "0"
          );
        }
      } catch (error) {
        return false;
      }

      return false;
    },

    prepareEnhancementWindow() {
      const wasOpenBeforeRun = Ui.isCraftingWindowOpen();

      if (!wasOpenBeforeRun) {
        Engine.crafting.window.wnd.$.addClass("upgrader-crafting-window");
        Engine.interface.clickCrafting();
        state.windowEnabled = true;
      }

      return { wasOpenBeforeRun };
    },

    restoreEnhancementWindow(session = {}) {
      const wasOpenBeforeRun = Boolean(session?.wasOpenBeforeRun);

      if (!wasOpenBeforeRun) {
        Engine.crafting.window.wnd.$.removeClass("upgrader-crafting-window");
        if (Ui.isCraftingWindowOpen()) {
          Engine.interface.clickCrafting();
        }
      } else {
        Engine.crafting.window.wnd.$.removeClass("upgrader-crafting-window");
      }

      state.windowEnabled = false;
    },

    markItemAsUpgraded(prevId) {
      if (prevId) {
        $(`.item-id-${prevId}`).find(".upgrader-label").remove();
      }

      const upgradedItemId = Storage.getUpgradedItemId();
      if (!upgradedItemId) return;

      const upgradedItem = Engine.items.getItemById(upgradedItemId);
      if (!upgradedItem) return;

      $(`.item-id-${upgradedItemId}`).find(".upgrader-label").remove();

      const label = $(`<div class="upgrader-label">U</div>`);
      $(`.item-id-${upgradedItemId}`).append(label);
    },

    renderSelectedItemPreview() {
      const previewBox = document.getElementById("upgrader-selected-preview-box");
      const previewText = document.getElementById("upgrader-selected-preview-text");
      if (!previewBox || !previewText) return;

      previewBox.innerHTML = "";

      const selectedId = Storage.getUpgradedItemId();
      if (!selectedId) {
        previewText.textContent = "Brak wybranego przedmiotu";
        return;
      }

      const item = Engine.items.getItemById(selectedId);
      if (!item) {
        previewText.textContent = `Wybrany ID: ${selectedId} (poza plecakiem)`;
        return;
      }

      const sourceNode = document.querySelector(`.item-id-${selectedId}`);
      if (sourceNode) {
        const sourceCanvas = sourceNode.querySelector("canvas.icon.canvas-icon");
        const sourceHighlight = sourceNode.querySelector(".highlight");

        if (sourceCanvas) {
          const previewItem = document.createElement("div");
          previewItem.className = "upgrader-selected-preview-item item";

          const iconPreview = document.createElement("img");
          iconPreview.className = "upgrader-selected-preview-icon";
          iconPreview.alt = item.name || "Wybrany przedmiot";
          iconPreview.src = sourceCanvas.toDataURL("image/png");

          previewItem.appendChild(iconPreview);

          if (sourceHighlight) {
            const highlightPreview = sourceHighlight.cloneNode(true);
            const highlightStyles = window.getComputedStyle(sourceHighlight);

            highlightPreview.style.backgroundImage = highlightStyles.backgroundImage;
            highlightPreview.style.backgroundPosition = highlightStyles.backgroundPosition;
            highlightPreview.style.backgroundSize = highlightStyles.backgroundSize;
            highlightPreview.style.backgroundRepeat = highlightStyles.backgroundRepeat;

            previewItem.appendChild(highlightPreview);
          }

          previewBox.appendChild(previewItem);
        }
      }

      previewText.textContent = item.name;
    },

    clearUpgradedItem() {
      const previousId = Storage.getUpgradedItemId();
      Storage.setUpgradedItemId("");
      Ui.markItemAsUpgraded(previousId);
      Ui.renderSelectedItemPreview();
      message("Wyczyszczono wybrany przedmiot do ulepszania.");
    },

    refreshEnhanceCounter() {
      const counterNode = document.getElementById("upgrader-launcher-counter");
      if (!counterNode) return;

      const source =
        document.querySelector(".enhance__counter") ||
        document.querySelector("span.enhance_counter") ||
        document.querySelector(".enhance_counter");
      const parsedFromDom = Utils.parseEnhanceCounter(source?.textContent?.trim());
      const cached = Storage.getEnhanceCounter();
      const parsedFromCache = Utils.parseEnhanceCounter(cached);
      const counter = parsedFromDom || parsedFromCache;

      counterNode.classList.remove(
        "upgrader-launcher-counter--good",
        "upgrader-launcher-counter--mid",
        "upgrader-launcher-counter--low"
      );

      if (!counter) {
        counterNode.textContent = "Limit: --/--";
        return;
      }

      state.enhanceCounter = counter.text;
      Storage.setEnhanceCounter(counter.text);
      counterNode.textContent = `Limit: ${counter.text}`;

      const ratio = counter.current / counter.limit;
      if (ratio <= 0.2) {
        counterNode.classList.add("upgrader-launcher-counter--low");
      } else if (ratio <= 0.5) {
        counterNode.classList.add("upgrader-launcher-counter--mid");
      } else {
        counterNode.classList.add("upgrader-launcher-counter--good");
      }
    },

    refreshDailyEnhancePoints() {
      const pointsNode = document.getElementById("upgrader-launcher-points");
      if (!pointsNode) return;

      const currentPoints = Storage.getDailyEnhancePoints();
      state.dailyEnhancePoints = currentPoints;
      pointsNode.textContent = `Punkty dziś: ${Utils.formatPoints(currentPoints)}`;
    },

    renderAutoSettings() {
      const toggle = document.getElementById("upgrader-auto-enabled");
      const slider = document.getElementById("upgrader-auto-min-free-slots");
      const value = document.getElementById("upgrader-auto-min-free-slots-value");
      const info = document.getElementById("upgrader-auto-free-slots-info");
      if (!toggle || !slider || !value || !info) return;

      const settings = state.autoSettings || { ...CONFIG.DEFAULT_AUTO_SETTINGS };

      toggle.checked = settings.enabled;
      slider.value = String(settings.minFreeSlots);
      slider.disabled = !settings.enabled;
      value.textContent = String(settings.minFreeSlots);

      const freeSlotsInfo = Inventory.getFreeSlotsInfo();
      const freeSlots = freeSlotsInfo.freeSlots;
      const debug = document.getElementById("upgrader-auto-debug");

      info.textContent =
        freeSlots === null
          ? "Wolne sloty: nie udało się odczytać"
          : `Wolne sloty teraz: ${freeSlots}`;

      if (debug) {
        const extra =
          typeof freeSlotsInfo.totalSlots === "number"
            ? ` | sloty: ${freeSlotsInfo.occupiedSlots}/${freeSlotsInfo.totalSlots}`
            : "";
      }
    },

    bindAutoSettingsHandlers() {
      const toggle = document.getElementById("upgrader-auto-enabled");
      const slider = document.getElementById("upgrader-auto-min-free-slots");
      const value = document.getElementById("upgrader-auto-min-free-slots-value");
      if (!toggle || !slider || !value) return;

      toggle.addEventListener("change", () => {
        state.autoSettings = Storage.setAutoSettings({
          ...state.autoSettings,
          enabled: toggle.checked,
        });

        Ui.renderAutoSettings();
        message(
          state.autoSettings.enabled
            ? `Auto ulepszanie włączone (próg: ${state.autoSettings.minFreeSlots} wolnych slotów)`
            : "Auto ulepszanie wyłączone"
        );
      });

      slider.addEventListener("input", () => {
        value.textContent = slider.value;
      });

      slider.addEventListener("change", () => {
        state.autoSettings = Storage.setAutoSettings({
          ...state.autoSettings,
          minFreeSlots: slider.value,
        });

        Ui.renderAutoSettings();
        message(
          `Zapisano próg auto-ulepszania: ${state.autoSettings.minFreeSlots} wolnych slotów`
        );
      });
    },

    renderBoundSettings() {
      const soulboundToggle = document.getElementById("upgrader-allow-soulbound");
      const permboundToggle = document.getElementById("upgrader-allow-permbound");
      if (!soulboundToggle || !permboundToggle) return;

      const settings = state.boundSettings || { ...CONFIG.DEFAULT_BOUND_SETTINGS };
      soulboundToggle.checked = settings.allowSoulbound;
      permboundToggle.checked = settings.allowPermbound;
    },

    bindBoundSettingsHandlers() {
      const soulboundToggle = document.getElementById("upgrader-allow-soulbound");
      const permboundToggle = document.getElementById("upgrader-allow-permbound");
      if (!soulboundToggle || !permboundToggle) return;

      const update = () => {
        state.boundSettings = Storage.setBoundSettings({
          allowSoulbound: soulboundToggle.checked,
          allowPermbound: permboundToggle.checked,
        });

        const enabled = [];
        if (state.boundSettings.allowSoulbound) {
          enabled.push("przedmioty związane z właścicielem");
        }
        if (state.boundSettings.allowPermbound) {
          enabled.push("przedmioty związane na stałe");
        }

        message(
          enabled.length > 0
            ? `Dozwolone boundy reagentów: ${enabled.join(", ")}`
            : "Boundy reagentów zablokowane (bezpieczny tryb)"
        );
      };

      soulboundToggle.addEventListener("change", update);
      permboundToggle.addEventListener("change", update);
    },

    renderRarityOptions() {
      const wrap = document.getElementById("upgrader-rarity-list");
      if (!wrap) return;

      const selectedRarities = Storage.getAllowedRarities();
      wrap.innerHTML = "";

      CONFIG.AVAILABLE_RARITIES.forEach((rarity) => {
        const rarityMeta = {
          common: {
            label: "Zwyklaki",
            className: "upgrader-rarity-common",
          },
          unique: {
            label: "Unikaty",
            className: "upgrader-rarity-unique",
          },
          heroic: {
            label: "Heroiki",
            className: "upgrader-rarity-heroic",
          },
        };

        const label = document.createElement("label");
        label.className = "upgrader-gui-rarity-item";

        const input = document.createElement("input");
        input.type = "checkbox";
        input.className = "upgrader-rarity-checkbox";
        input.value = rarity;
        input.checked = selectedRarities.includes(rarity);

        const span = document.createElement("span");
  span.textContent = rarityMeta[rarity]?.label || rarity;
  span.className = rarityMeta[rarity]?.className || "";

        label.appendChild(input);
        label.appendChild(span);
        wrap.appendChild(label);
      });
    },

    getSelectedRaritiesFromGui() {
      const nodes = document.querySelectorAll(".upgrader-rarity-checkbox:checked");
      return [...nodes].map((node) => node.value);
    },

    renderHotkeyInputs() {
      const enhanceInput = document.getElementById("upgrader-hotkey-enhance");
      const guiInput = document.getElementById("upgrader-hotkey-gui");
      if (!enhanceInput || !guiInput) return;

      const hotkeys = state.hotkeys || { ...CONFIG.DEFAULT_HOTKEYS };
      enhanceInput.value = hotkeys.enhance;
      guiInput.value = hotkeys.gui;
    },

    getHotkeysFromGui() {
      const enhanceInput = document.getElementById("upgrader-hotkey-enhance");
      const guiInput = document.getElementById("upgrader-hotkey-gui");

      return {
        enhance: enhanceInput?.value,
        gui: guiInput?.value,
      };
    },

    applyButtonPosition() {
      const button = document.getElementById("upgrader-launcher");
      if (!button) return;

      const position = Storage.getGuiPosition();
      button.style.top = `${position.top}px`;

      if (typeof position.left === "number") {
        button.style.left = `${position.left}px`;
        button.style.right = "auto";
      } else {
        button.style.left = "auto";
        button.style.right = `${position.right}px`;
      }
    },

    saveButtonPosition(left, top) {
      const button = document.getElementById("upgrader-launcher");
      if (!button) return;

      const maxLeft = Math.max(window.innerWidth - button.offsetWidth, 0);
      const maxTop = Math.max(window.innerHeight - button.offsetHeight, 0);

      const finalLeft = Utils.clamp(left, 0, maxLeft);
      const finalTop = Utils.clamp(top, 0, maxTop);

      button.style.left = `${finalLeft}px`;
      button.style.top = `${finalTop}px`;
      button.style.right = "auto";

      Storage.setGuiPosition({ left: finalLeft, top: finalTop, right: null });
    },

    applyPanelPosition() {
      const panel = document.getElementById("upgrader-gui-panel");
      if (!panel) return;

      const position = Storage.getPanelPosition();
      panel.style.top = `${position.top}px`;

      if (typeof position.left === "number") {
        panel.style.left = `${position.left}px`;
        panel.style.right = "auto";
      } else {
        panel.style.left = "auto";
        panel.style.right = `${position.right}px`;
      }
    },

    savePanelPosition(left, top) {
      const panel = document.getElementById("upgrader-gui-panel");
      if (!panel) return;

      const maxLeft = Math.max(window.innerWidth - panel.offsetWidth, 0);
      const maxTop = Math.max(window.innerHeight - panel.offsetHeight, 0);

      const finalLeft = Utils.clamp(left, 0, maxLeft);
      const finalTop = Utils.clamp(top, 0, maxTop);

      panel.style.left = `${finalLeft}px`;
      panel.style.top = `${finalTop}px`;
      panel.style.right = "auto";

      Storage.setPanelPosition({ left: finalLeft, top: finalTop, right: null });
    },

    initButtonDrag() {
      const button = document.getElementById("upgrader-launcher");
      const handle = document.getElementById("upgrader-launcher-title");
      if (!button || !handle) return;

      handle.addEventListener("mousedown", (event) => {
        if (event.button !== 0) return;

        event.preventDefault();

        const buttonRect = button.getBoundingClientRect();
        const offsetX = event.clientX - buttonRect.left;
        const offsetY = event.clientY - buttonRect.top;

        const onMouseMove = (moveEvent) => {
          const nextLeft = moveEvent.clientX - offsetX;
          const nextTop = moveEvent.clientY - offsetY;
          Ui.saveButtonPosition(nextLeft, nextTop);
        };

        const onMouseUp = () => {
          document.removeEventListener("mousemove", onMouseMove);
          document.removeEventListener("mouseup", onMouseUp);
        };

        document.addEventListener("mousemove", onMouseMove);
        document.addEventListener("mouseup", onMouseUp);
      });
    },

    initPanelDrag() {
      const panel = document.getElementById("upgrader-gui-panel");
      const handle = document.getElementById("upgrader-gui-title");
      if (!panel || !handle) return;

      handle.addEventListener("mousedown", (event) => {
        if (event.button !== 0) return;

        event.preventDefault();

        const panelRect = panel.getBoundingClientRect();
        const offsetX = event.clientX - panelRect.left;
        const offsetY = event.clientY - panelRect.top;

        const onMouseMove = (moveEvent) => {
          const nextLeft = moveEvent.clientX - offsetX;
          const nextTop = moveEvent.clientY - offsetY;
          Ui.savePanelPosition(nextLeft, nextTop);
        };

        const onMouseUp = () => {
          document.removeEventListener("mousemove", onMouseMove);
          document.removeEventListener("mouseup", onMouseUp);
        };

        document.addEventListener("mousemove", onMouseMove);
        document.addEventListener("mouseup", onMouseUp);
      });
    },

    bindLauncherButtons() {
      const configButton = document.getElementById("upgrader-launcher-config-btn");
      const manualButton = document.getElementById("upgrader-launcher-enhance-btn");
      if (!configButton || !manualButton) return;

      configButton.addEventListener("click", () => {
        Ui.toggleGui();
      });

      manualButton.addEventListener("click", async () => {
        await Automation.enhanceSelectedItem();
      });
    },

    bindRarityAutoSaveHandlers() {
      const rarityList = document.getElementById("upgrader-rarity-list");
      if (!rarityList) return;

      rarityList.addEventListener("change", (event) => {
        const target = event.target;
        if (!target || !target.classList?.contains("upgrader-rarity-checkbox")) {
          return;
        }

        const selectedRarities = Ui.getSelectedRaritiesFromGui();
        if (selectedRarities.length === 0) {
          target.checked = true;
          message("Wybierz co najmniej jedno rarity składników.");
          return;
        }

        Storage.setAllowedRarities(selectedRarities);
        const rarityLabels = {
          common: "Zwyklaki",
          unique: "Unikaty",
          heroic: "Heroiki",
        };
        const selectedLabels = selectedRarities
          .map((rarity) => rarityLabels[rarity])
          .filter(Boolean)
          .join("/");

        message(`Wybrano rzadkość: ${selectedLabels}.`);
      });
    },

    toggleGui() {
      const panel = document.getElementById("upgrader-gui-panel");
      if (!panel) return;

      state.guiVisible = !state.guiVisible;
      panel.style.display = state.guiVisible ? "block" : "none";

      if (state.guiVisible) {
        Ui.applyPanelPosition();
        Ui.renderSelectedItemPreview();
        Ui.renderRarityOptions();
        Ui.renderBoundSettings();
        Ui.renderHotkeyInputs();
        Ui.renderAutoSettings();
        Ui.refreshEnhanceCounter();
      }
    },

    createGui() {
      if (document.getElementById("upgrader-launcher")) return;

      const button = document.createElement("div");
      button.id = "upgrader-launcher";
      button.className = "upgrader-launcher";
      button.innerHTML = `
        <div id="upgrader-launcher-title" class="upgrader-launcher-title">QuickForge</div>
        <div id="upgrader-launcher-counter" class="upgrader-launcher-counter">Limit: --</div>
        <div id="upgrader-launcher-points" class="upgrader-launcher-points">Punkty dziś: 0</div>
        <div class="upgrader-launcher-row">
          <button id="upgrader-launcher-config-btn" class="upgrader-launcher-btn">CONFIG</button>
          <button id="upgrader-launcher-enhance-btn" class="upgrader-launcher-btn">ULEPSZ</button>
        </div>
      `;

      const panel = document.createElement("div");
      panel.id = "upgrader-gui-panel";
      panel.className = "upgrader-gui-panel";
      panel.innerHTML = `
        <div id="upgrader-gui-title" class="upgrader-gui-title">QuickForge - ustawienia</div>
        <div class="upgrader-select-hint">Wybór przedmiotu: kliknij PPM na itemie i użyj opcji „Ulepsz ten przedmiot”.</div>
        <div class="upgrader-selected-preview-wrap">
          <div class="upgrader-gui-rarity-title">Wybrany przedmiot:</div>
          <div id="upgrader-selected-preview-box" class="upgrader-selected-preview-box"></div>
          <div id="upgrader-selected-preview-text" class="upgrader-selected-preview-text">Brak wybranego przedmiotu</div>
        </div>
        <div class="upgrader-gui-rarity-wrap">
          <div class="upgrader-gui-rarity-title">Rarity składników:</div>
          <div id="upgrader-rarity-list" class="upgrader-gui-rarity-list"></div>
        </div>
        <div class="upgrader-bound-wrap">
          <div class="upgrader-gui-rarity-title">Blokada przedmiotów związanych:</div>
          <label class="upgrader-bound-item" for="upgrader-allow-soulbound">
            <span>Używaj przedmiotów związanych z właścicielem</span>
            <input id="upgrader-allow-soulbound" type="checkbox" />
          </label>
          <label class="upgrader-bound-item" for="upgrader-allow-permbound">
            <span>Używaj przedmiotów związanych na stałe</span>
            <input id="upgrader-allow-permbound" type="checkbox" />
          </label>
          <div class="upgrader-bound-warning">Uwaga: włączenie może spalić ważne przedmioty.
            <span class="upgrader-tooltip-trigger" data-tooltip="Ta reguła nie działa na heroiki oraz na przedmioty ulepszone">?</span>
          </div>
        </div>
        <div class="upgrader-auto-wrap">
          <div class="upgrader-auto-row">
            <label for="upgrader-auto-enabled">Auto ulepszanie</label>
            <input id="upgrader-auto-enabled" type="checkbox" />
          </div>
          <div class="upgrader-auto-row">
            <label for="upgrader-auto-min-free-slots">Próg wolnych slotów: <span id="upgrader-auto-min-free-slots-value">6</span></label>
          </div>
          <input
            id="upgrader-auto-min-free-slots"
            class="upgrader-auto-slider"
            type="range"
            min="${CONFIG.AUTO_MIN_FREE_SLOTS_RANGE.min}"
            max="${CONFIG.AUTO_MIN_FREE_SLOTS_RANGE.max}"
            value="${CONFIG.DEFAULT_AUTO_SETTINGS.minFreeSlots}"
          />
          <div id="upgrader-auto-free-slots-info" class="upgrader-auto-info"></div>
          <div id="upgrader-auto-debug" class="upgrader-auto-debug"></div>
        </div>
        <div class="upgrader-hotkeys-wrap">
          <div class="upgrader-gui-rarity-title">Skróty klawiszowe:</div>
          <div class="upgrader-hotkeys-grid">
            <div class="upgrader-hotkeys-label">Ulepszanie</div>
            <input id="upgrader-hotkey-enhance" maxlength="1" class="upgrader-hotkeys-input" />
            <div class="upgrader-hotkeys-label">GUI (SHIFT+)</div>
            <input id="upgrader-hotkey-gui" maxlength="1" class="upgrader-hotkeys-input" />
          </div>
        </div>
        <div class="upgrader-gui-row">
          <button id="upgrader-clear-btn" class="upgrader-gui-btn">Wyczyść</button>
          <button id="upgrader-rarity-save-btn" class="upgrader-gui-btn">Reset punktów</button>
          <button id="upgrader-hotkey-save-btn" class="upgrader-gui-btn">Zapisz skróty</button>
        </div>
      `;

      document.body.appendChild(button);
      document.body.appendChild(panel);

      Ui.applyButtonPosition();
      Ui.applyPanelPosition();
      Ui.initButtonDrag();
      Ui.initPanelDrag();
      Ui.bindLauncherButtons();
      Ui.bindAutoSettingsHandlers();
      Ui.bindBoundSettingsHandlers();
      Ui.bindRarityAutoSaveHandlers();

      document
        .getElementById("upgrader-clear-btn")
        .addEventListener("click", () => {
          Ui.clearUpgradedItem();
        });

      document
        .getElementById("upgrader-rarity-save-btn")
        .addEventListener("click", () => {
          state.dailyEnhancePoints = Storage.setDailyEnhancePoints(0);
          Ui.refreshDailyEnhancePoints();
          message("Wyzerowano licznik punktów dziennych.");
        });

      document
        .getElementById("upgrader-hotkey-save-btn")
        .addEventListener("click", () => {
          const nextHotkeys = Ui.getHotkeysFromGui();
          const savedHotkeys = Storage.setHotkeys(nextHotkeys);
          state.hotkeys = savedHotkeys;
          Ui.renderHotkeyInputs();

          message(
            `Zapisano skróty: ulepszanie [${savedHotkeys.enhance}], GUI [SHIFT+${savedHotkeys.gui}]`
          );
        });

      Ui.renderSelectedItemPreview();
      Ui.renderBoundSettings();
      Ui.renderAutoSettings();
      Ui.refreshEnhanceCounter();
      Ui.refreshDailyEnhancePoints();
    },

    initItemContextMenu() {
      const ogShowPopupMenu = Engine.interface.showPopupMenu;
      Engine.interface.showPopupMenu = function (menu, e) {
        const itemId = Utils.getItemIdFromClassName(e.currentTarget?.className);

        if (!itemId) {
          return ogShowPopupMenu.call(this, menu, e);
        }

        const item = Engine.items.getItemById(itemId);
        const currentSelectedItemId = Storage.getUpgradedItemId();

        if (!ALLOWED_ITEM_TYPES.includes(item?.cl)) {
          return ogShowPopupMenu.call(this, menu, e);
        }

        const menuItem =
          itemId === currentSelectedItemId
            ? [
                "Anuluj ulepszanie",
                () => {
                  if (!currentSelectedItemId) return;
                  Storage.setUpgradedItemId("");
                  Ui.markItemAsUpgraded(currentSelectedItemId);
                  Ui.renderSelectedItemPreview();

                  message(`Anulowano ulepszanie przedmiotu ${item.name}`);
                },
                { button: { cls: "menu-item--red" } },
              ]
            : [
                "Ulepsz ten przedmiot",
                () => {
                  Storage.setUpgradedItemId(itemId);
                  Ui.markItemAsUpgraded(currentSelectedItemId);
                  Ui.renderSelectedItemPreview();

                  message(`Ulepszanie przedmiotu ${item.name}`);
                },
                { button: { cls: "menu-item--yellow" } },
              ];

        const updatedMenu = [menuItem, ...menu];
        ogShowPopupMenu.call(this, updatedMenu, e);
      };
    },
  };

  const Automation = {
    async enhanceSelectedItem(options = {}) {
      const { silent = false } = options;

      if (state.isEnhancing) {
        return;
      }

      state.isEnhancing = true;

      const upgradedItemId = Storage.getUpgradedItemId();
      const upgradedItem = Engine.items.getItemById(upgradedItemId);

      if (!upgradedItem) {
        if (!silent) {
          message("Nie znaleziono wybranego przedmiotu.");
        }
        state.isEnhancing = false;
        return;
      }

      const reagents = Inventory.getReagents();
      if (reagents.length === 0) {
        if (!silent) {
          message("Nie znaleziono odpowiednich składników.");
        }
        state.isEnhancing = false;
        return;
      }

      let enhancementSession = null;

      try {
        enhancementSession = Ui.prepareEnhancementWindow();
        const chunks = Utils.chunk(reagents, CONFIG.MAX_REAGENTS);
        await EnhancementApi.setEnhancedItem(upgradedItemId);

        for (const chunk of chunks) {
          await EnhancementApi.setReagents(upgradedItemId, chunk);
          const previewPoints = Utils.getEnhancePreviewPoints();
          const enhanceItemResponse = await EnhancementApi.enhanceItem(
            upgradedItemId,
            chunk
          );

          const { count, limit } = enhanceItemResponse.enhancement.usages_preview;
          const upgradeLevel =
            enhanceItemResponse?.enhancement?.progressing?.upgradeLevel ?? "?";
          message(
            Utils.formatEnhanceProgressMessage({
              itemName: upgradedItem.name,
              count,
              limit,
              upgradeLevel,
              points: previewPoints,
            })
          );

          await Utils.sleep(300);
        }
      } finally {
        Ui.restoreEnhancementWindow(enhancementSession);
        state.isEnhancing = false;
        Ui.refreshEnhanceCounter();
      }
    },

    async checkAutoEnhance() {
      if (!state.autoSettings.enabled || state.isEnhancing) {
        return;
      }

      const freeSlots = Inventory.getFreeSlots();
      if (freeSlots === null) {
        return;
      }

      if (freeSlots > state.autoSettings.minFreeSlots) {
        return;
      }

      const now = Date.now();
      if (now - state.lastAutoTriggerAt < 2000) {
        return;
      }

      state.lastAutoTriggerAt = now;
      await Automation.enhanceSelectedItem({ silent: true });
      Ui.renderAutoSettings();
    },

    startAutoEnhanceLoop() {
      setInterval(() => {
        Automation.checkAutoEnhance();
      }, 1200);
    },

    startEnhanceCounterSyncLoop() {
      setInterval(() => {
        Ui.refreshEnhanceCounter();
        Ui.refreshDailyEnhancePoints();
      }, 1200);
    },

    bindHotkey() {
      window.document.addEventListener("keydown", async (event) => {
        const isInputActive = ["TEXTAREA", "MAGIC_INPUT", "INPUT"].includes(
          document.activeElement.tagName
        );
        if (isInputActive) return;

        const key = String(event.key || "").toLowerCase();
        const hotkeys = state.hotkeys || CONFIG.DEFAULT_HOTKEYS;

        if (event.shiftKey && key === hotkeys.gui) {
          event.preventDefault();
          Ui.toggleGui();
          return;
        }

        if (key === hotkeys.enhance) {
          await Automation.enhanceSelectedItem();
        }
      });
    },
  };

  const Runtime = {
    isDuplicateProgressEvent(eventKey) {
      const now = Date.now();
      const DUPLICATE_WINDOW_MS = 1500;

      if (
        state.lastProgressEventKey === eventKey &&
        now - state.lastProgressEventAt < DUPLICATE_WINDOW_MS
      ) {
        return true;
      }

      state.lastProgressEventKey = eventKey;
      state.lastProgressEventAt = now;
      return false;
    },

    initEnhancementProgressHook() {
      if (state.enhancementProgressHooked) return;
      if (typeof window._g !== "function") return;

      const hookFlag = "__upgraderEnhancementProgressHooked";
      if (window._g && window._g[hookFlag]) {
        state.enhancementProgressHooked = true;
        return;
      }

      const originalG = window._g;

      window._g = function (...args) {
        const request = args[0];
        const isEnhancementProgressRequest =
          typeof request === "string" &&
          request.includes("enhancement&action=progress&");

        const callbackIndex = args.findIndex(
          (arg, index) => index > 0 && typeof arg === "function"
        );

        const previewPoints = isEnhancementProgressRequest
          ? Utils.getEnhancePreviewPoints()
          : null;

        if (isEnhancementProgressRequest && callbackIndex !== -1) {
          const originalCallback = args[callbackIndex];

          args[callbackIndex] = function (...callbackArgs) {
            const responseData = callbackArgs[0];

            try {
              const isSuccess =
                responseData &&
                typeof responseData === "object" &&
                !responseData.error &&
                Boolean(responseData.enhancement);

              const progressLevel =
                responseData?.enhancement?.progressing?.upgradeLevel ?? "-";
              const usageCount =
                responseData?.enhancement?.usages_preview?.count ?? "-";
              const usageLimit =
                responseData?.enhancement?.usages_preview?.limit ?? "-";
              const eventKey = [
                String(request || ""),
                String(previewPoints || 0),
                String(progressLevel),
                String(usageCount),
                String(usageLimit),
              ].join("|");

              if (isSuccess && Runtime.isDuplicateProgressEvent(eventKey)) {
                return originalCallback.apply(this, callbackArgs);
              }

              if (isSuccess && Number.isFinite(previewPoints) && previewPoints > 0) {
                state.dailyEnhancePoints = Storage.addDailyEnhancePoints(previewPoints);
                Ui.refreshDailyEnhancePoints();

                if (!state.isEnhancing) {
                  message(
                    `Dodano +${Utils.formatPoints(previewPoints)} pkt ulepszenia.`
                  );
                }
              }
            } catch (error) {
              // ignore counter hook errors to not block game requests
            }

            return originalCallback.apply(this, callbackArgs);
          };
        }

        return originalG.apply(this, args);
      };

      window._g[hookFlag] = true;

      state.enhancementProgressHooked = true;
    },
  };

  const Bootstrap = {
    init() {
      try {
        if (!window.Engine.allInit) {
          setTimeout(Bootstrap.init, 500);
          return;
        }
      } catch (error) {
        setTimeout(Bootstrap.init, 500);
        return;
      }

      state.hotkeys = Storage.getHotkeys();
      state.autoSettings = Storage.getAutoSettings();
      state.boundSettings = Storage.getBoundSettings();
      state.enhanceCounter = Storage.getEnhanceCounter();
      state.dailyEnhancePoints = Storage.getDailyEnhancePoints();
      Runtime.initEnhancementProgressHook();
      Ui.setupCss();
      Ui.createGui();
      Automation.bindHotkey();
      Automation.startAutoEnhanceLoop();
      Automation.startEnhanceCounterSyncLoop();
      Ui.initItemContextMenu();
      Ui.markItemAsUpgraded();
    },
  };

  Bootstrap.init();
})();