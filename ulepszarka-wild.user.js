// ==UserScript==
// @name         ulepszator by Kruul
// @namespace    http://tampermonkey.net/
// @version      0.2.1
// @description  Auto ulepszanie przedmiotów w Margonem (Quick Forge)
// @author       Kruul
// @match        https://*.margonem.pl/*
// @updateURL    https://raw.githubusercontent.com/kruulxd/Ulepszarka/main/ulepszarka-wild.user.js
// @downloadURL  https://raw.githubusercontent.com/kruulxd/Ulepszarka/main/ulepszarka-wild.user.js
// @grant        none
// ==/UserScript==

const CONFIG = {
  DEFAULT_ALLOWED_RARITIES: ["common"],
  AVAILABLE_RARITIES: ["common", "unique", "heroic"],
  RARITY_META: {
    common: { label: "Zwykły", color: "#d4d4d8" },
    unique: { label: "Unikat", color: "#eab308" },
    heroic: { label: "Heroik", color: "#60a5fa" },
    legendary: { label: "Legenda", color: "#f97316" },
    artefact: { label: "Artefakt", color: "#a78bfa" },
    upgrade: { label: "Ulepszenie", color: "#34d399" },
  },
  RARITY_BY_ITEM_TYPE: {
    "t-com": "common",
    "t-zwy": "common",
    "t-uni": "unique",
    "t-her": "heroic",
    "t-leg": "legendary",
    "t-art": "artefact",
    "t-upg": "upgrade",
  },
  MAX_REAGENTS: 25,
  DEFAULT_HOTKEYS: {
    enhance: "j",
    gui: "u",
  },
  DEFAULT_BUTTON_POSITION: {
    left: null,
    top: 150,
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
  DAILY_RESET_TIME_ZONE: "Europe/Warsaw",
  BOOTSTRAP_MAX_ATTEMPTS: 120,
  BIND_STATE_CACHE_TTL_MS: 4000,
  DEFAULT_UI_SCALE: 1,
  DEFAULT_DENSITY: "compact",
  UI_SCALE_RANGE: {
    min: 0.7,
    max: 1.8,
  },
  RARITY_FILTER_META: {
    common: { label: "Zwyklaki", className: "upgrader-rarity-common" },
    unique: { label: "Unikaty", className: "upgrader-rarity-unique" },
    heroic: { label: "Heroiki", className: "upgrader-rarity-heroic" },
  },
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
    guiVisible: false,
    hotkeys: { ...CONFIG.DEFAULT_HOTKEYS },
    autoSettings: { ...CONFIG.DEFAULT_AUTO_SETTINGS },
    boundSettings: { ...CONFIG.DEFAULT_BOUND_SETTINGS },
    enhanceCounter: null,
    dailyEnhancePoints: CONFIG.DAILY_POINTS_DEFAULT,
    enhancementProgressHooked: false,
    lastProgressEventKey: null,
    lastProgressEventAt: 0,
    enhancementRunSummary: null,
    isEnhancing: false,
    lastEnhanceProgress: null,
    progressPeekTimer: null,
    lastAutoTriggerAt: 0,
    viewportSize: null,
    hasInterfaceWidget: false,
    interfaceWidgetDragObserver: null,
    launcherVisible: false,
    enhancementNotificationTimer: null,
    uiScale: CONFIG.DEFAULT_UI_SCALE,
    density: CONFIG.DEFAULT_DENSITY,
    bindStateCache: new Map(),
    pendingPreviewPoints: null,
    popupMenuHooked: false,
    upgradedLabelObserver: null,
  };

  const Utils = {
    sleep(ms) {
      return new Promise((resolve) => setTimeout(resolve, ms));
    },

    nextFrame() {
      return new Promise((resolve) => {
        if (typeof requestAnimationFrame === "function") {
          requestAnimationFrame(() => resolve());
          return;
        }

        setTimeout(resolve, 16);
      });
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

    getEnhanceCounterSnapshot() {
      const source =
        document.querySelector(".enhance__counter") ||
        document.querySelector("span.enhance_counter") ||
        document.querySelector(".enhance_counter");
      const parsedFromDom = Utils.parseEnhanceCounter(source?.textContent?.trim());
      if (parsedFromDom) return parsedFromDom;

      const parsedFromState = Utils.parseEnhanceCounter(state.enhanceCounter);
      if (parsedFromState) return parsedFromState;

      const cached = Storage.getEnhanceCounter();
      return Utils.parseEnhanceCounter(cached);
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

    parseProgressText(rawText) {
      const text = String(rawText || "").trim();
      if (!text || !text.includes("/")) return null;

      const [rawCurrent, rawTarget] = text.split("/");
      const current = Utils.toNumber(String(rawCurrent).replace(/[^\d]/g, ""), NaN);
      const target = Utils.toNumber(String(rawTarget).replace(/[^\d]/g, ""), NaN);

      if (!Number.isFinite(current) || !Number.isFinite(target)) return null;

      return { current, target };
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

    getZonedDateParts(timestamp) {
      const date = new Date(timestamp);
      if (Number.isNaN(date.getTime())) return null;

      try {
        const formatter = new Intl.DateTimeFormat("en-CA", {
          timeZone: CONFIG.DAILY_RESET_TIME_ZONE,
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
          hour: "2-digit",
          minute: "2-digit",
          hour12: false,
        });

        const parts = formatter.formatToParts(date).reduce((acc, part) => {
          acc[part.type] = part.value;
          return acc;
        }, {});

        const year = Utils.toNumber(parts.year, NaN);
        const month = Utils.toNumber(parts.month, NaN);
        const day = Utils.toNumber(parts.day, NaN);
        const hour = Utils.toNumber(parts.hour === "24" ? "0" : parts.hour, NaN);
        const minute = Utils.toNumber(parts.minute, NaN);

        if ([year, month, day, hour, minute].some((value) => !Number.isFinite(value))) {
          return null;
        }

        return { year, month, day, hour, minute };
      } catch (error) {
        // Brak wsparcia dla strefy czasowej — fallback na czas lokalny przeglądarki.
        return {
          year: date.getFullYear(),
          month: date.getMonth() + 1,
          day: date.getDate(),
          hour: date.getHours(),
          minute: date.getMinutes(),
        };
      }
    },

    getDailyResetCycleKey(timestamp = Date.now()) {
      const parts = Utils.getZonedDateParts(timestamp);
      if (!parts) return null;

      const minutesOfDay = parts.hour * 60 + parts.minute;
      const resetMinutes =
        CONFIG.DAILY_RESET_TIME.hour * 60 + CONFIG.DAILY_RESET_TIME.minute;

      // Arytmetyka na czystej dacie w UTC — odporna na zmianę czasu letniego.
      const cycleDate = new Date(Date.UTC(parts.year, parts.month - 1, parts.day));
      if (minutesOfDay < resetMinutes) {
        cycleDate.setUTCDate(cycleDate.getUTCDate() - 1);
      }

      const year = cycleDate.getUTCFullYear();
      const month = String(cycleDate.getUTCMonth() + 1).padStart(2, "0");
      const day = String(cycleDate.getUTCDate()).padStart(2, "0");

      return `${year}-${month}-${day}`;
    },

    hasMaxEnhancementState(payload) {
      if (!payload || typeof payload !== "object") return false;

      const enhancement = payload?.enhancement;

      // 1. Jawne flagi serwera — jedyny w pełni wiarygodny sygnał.
      const directFlags = [
        enhancement?.isMax,
        enhancement?.max,
        enhancement?.maxed,
        enhancement?.is_max,
        enhancement?.is_maxed,
        enhancement?.maxLevel,
        enhancement?.max_level,
      ];

      if (directFlags.some((value) => value === true)) {
        return true;
      }

      // 2. Komunikat tekstowy (max ulepszenie / prośba o wybór bonusu).
      const textProbe = Utils.normalizeText(
        JSON.stringify([
          payload?.error,
          payload?.msg,
          payload?.message,
          payload?.tip,
          enhancement?.error,
          enhancement?.msg,
          enhancement?.message,
        ])
      );

      const hasTextSignal =
        /(maks|max).*(ulepsz|enhanc)/.test(textProbe) ||
        /(wybierz|wybor).*(bonus)/.test(textProbe) ||
        /(bonus).*(wybierz|wybor)/.test(textProbe);

      if (hasTextSignal) {
        return true;
      }

      // 3. Poziom ulepszenia zrównany z jawnie podanym maksimum.
      const upgradeLevel = Utils.toNumber(
        enhancement?.progressing?.upgradeLevel ??
          enhancement?.progressing?.upgrade_level ??
          enhancement?.upgradeLevel ??
          enhancement?.upgrade_level,
        NaN
      );

      const maxUpgradeLevel = Utils.toNumber(
        enhancement?.progressing?.maxUpgradeLevel ??
          enhancement?.progressing?.max_upgrade_level ??
          enhancement?.maxUpgradeLevel ??
          enhancement?.max_upgrade_level,
        NaN
      );

      if (
        Number.isFinite(upgradeLevel) &&
        Number.isFinite(maxUpgradeLevel) &&
        maxUpgradeLevel > 0 &&
        upgradeLevel >= maxUpgradeLevel
      ) {
        return true;
      }

      return false;
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

    getWidgetSlotKey() {
      return `upgrader-widget-slot-charId-${Engine.hero.d.id}`;
    },

    getAutoSettingsKey() {
      return `upgrader-auto-settings-charId-${Engine.hero.d.id}`;
    },

    getBoundSettingsKey() {
      return `upgrader-bound-settings-charId-${Engine.hero.d.id}`;
    },

    getEnhanceCounterKey() {
      return "upgrader-enhance-counter-shared";
    },

    getDailyEnhancePointsKey() {
      return "upgrader-daily-enhance-points-shared";
    },

    getLegacyEnhanceCounterKey() {
      return `upgrader-enhance-counter-charId-${Engine.hero.d.id}`;
    },

    getLegacyDailyEnhancePointsKey() {
      return `upgrader-daily-enhance-points-charId-${Engine.hero.d.id}`;
    },

    getLauncherVisibilityKey() {
      return `upgrader-launcher-visible-charId-${Engine.hero.d.id}`;
    },

    getUiScaleKey() {
      return `upgrader-ui-scale-charId-${Engine.hero.d.id}`;
    },

    getUiScale() {
      const saved = window.localStorage.getItem(Storage.getUiScaleKey());
      if (saved === null) return CONFIG.DEFAULT_UI_SCALE;

      return Utils.clamp(
        Utils.toNumber(saved, CONFIG.DEFAULT_UI_SCALE),
        CONFIG.UI_SCALE_RANGE.min,
        CONFIG.UI_SCALE_RANGE.max
      );
    },

    setUiScale(scale) {
      const normalized = Utils.clamp(
        Utils.toNumber(scale, CONFIG.DEFAULT_UI_SCALE),
        CONFIG.UI_SCALE_RANGE.min,
        CONFIG.UI_SCALE_RANGE.max
      );

      window.localStorage.setItem(
        Storage.getUiScaleKey(),
        String(Math.round(normalized * 100) / 100)
      );

      return Math.round(normalized * 100) / 100;
    },

    getDensityKey() {
      return `upgrader-density-charId-${Engine.hero.d.id}`;
    },

    getDensity() {
      const saved = window.localStorage.getItem(Storage.getDensityKey());
      return saved === "cozy" || saved === "compact"
        ? saved
        : CONFIG.DEFAULT_DENSITY;
    },

    setDensity(density) {
      const normalized = density === "cozy" ? "cozy" : "compact";
      window.localStorage.setItem(Storage.getDensityKey(), normalized);
      return normalized;
    },

    // Migracja kluczy per-postać na współdzielone + usunięcie wpisów z minionej doby.
    // Trzymane osobno, żeby gettery pozostały czystymi odczytami.
    cleanupStaleEntries() {
      const currentCycleKey = Utils.getDailyResetCycleKey();

      const dropIfStale = (key, legacyKey, readCycleKey) => {
        [key, legacyKey].forEach((storageKey) => {
          const raw = window.localStorage.getItem(storageKey);
          if (!raw) return;

          let cycleKey = null;
          try {
            cycleKey = readCycleKey(JSON.parse(raw));
          } catch (error) {
            cycleKey = null;
          }

          if (!cycleKey || !currentCycleKey || cycleKey !== currentCycleKey) {
            window.localStorage.removeItem(storageKey);
          }
        });
      };

      dropIfStale(
        Storage.getEnhanceCounterKey(),
        Storage.getLegacyEnhanceCounterKey(),
        (payload) => {
          const savedAt = Utils.toNumber(payload?.savedAt, NaN);
          return Number.isFinite(savedAt)
            ? Utils.getDailyResetCycleKey(savedAt)
            : null;
        }
      );

      dropIfStale(
        Storage.getDailyEnhancePointsKey(),
        Storage.getLegacyDailyEnhancePointsKey(),
        (payload) => {
          const cycleKey = String(payload?.cycleKey || "").trim();
          if (cycleKey) return cycleKey;

          const savedAt = Utils.toNumber(payload?.savedAt, NaN);
          return Number.isFinite(savedAt)
            ? Utils.getDailyResetCycleKey(savedAt)
            : null;
        }
      );

      // Przeniesienie starych kluczy per-postać na klucze współdzielone.
      const migrate = (sharedKey, legacyKey) => {
        const legacyValue = window.localStorage.getItem(legacyKey);
        if (!legacyValue) return;

        if (!window.localStorage.getItem(sharedKey)) {
          window.localStorage.setItem(sharedKey, legacyValue);
        }

        window.localStorage.removeItem(legacyKey);
      };

      migrate(
        Storage.getEnhanceCounterKey(),
        Storage.getLegacyEnhanceCounterKey()
      );
      migrate(
        Storage.getDailyEnhancePointsKey(),
        Storage.getLegacyDailyEnhancePointsKey()
      );
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
        if (!parsed || typeof parsed !== "object") {
          return { ...CONFIG.DEFAULT_HOTKEYS };
        }

        const normalized = {
          enhance: Utils.normalizeHotkey(
            parsed?.enhance,
            CONFIG.DEFAULT_HOTKEYS.enhance
          ),
          gui: Utils.normalizeHotkey(parsed?.gui, CONFIG.DEFAULT_HOTKEYS.gui),
        };

        return normalized;
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

    getWidgetSlot() {
      const saved = window.localStorage.getItem(Storage.getWidgetSlotKey());
      if (!saved) return null;

      try {
        const parsed = JSON.parse(saved);
        const widgetPos = parsed?.widgetPos === "top-right" ? "top-right" : "top-left";
        const slot = Math.max(0, Math.floor(Utils.toNumber(parsed?.slot, 0)));
        const widgetIndex = Math.max(0, Math.floor(Utils.toNumber(parsed?.widgetIndex, slot)));

        return {
          widgetPos,
          slot,
          widgetIndex,
        };
      } catch (error) {
        return null;
      }
    },

    setWidgetSlot(slotConfig) {
      const normalized = {
        widgetPos: slotConfig?.widgetPos === "top-right" ? "top-right" : "top-left",
        slot: Math.max(0, Math.floor(Utils.toNumber(slotConfig?.slot, 0))),
        widgetIndex: Math.max(
          0,
          Math.floor(Utils.toNumber(slotConfig?.widgetIndex, slotConfig?.slot ?? 0))
        ),
      };

      window.localStorage.setItem(
        Storage.getWidgetSlotKey(),
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

    // Czysty odczyt — sprzątaniem zajmuje się Storage.cleanupStaleEntries().
    getEnhanceCounter() {
      const valueToRead =
        window.localStorage.getItem(Storage.getEnhanceCounterKey()) ||
        window.localStorage.getItem(Storage.getLegacyEnhanceCounterKey());
      if (!valueToRead) return null;

      try {
        const parsedPayload = JSON.parse(valueToRead);
        const savedText = String(parsedPayload?.text || "").trim();
        const savedAt = Utils.toNumber(parsedPayload?.savedAt, NaN);

        if (!savedText || !Number.isFinite(savedAt)) return null;

        const currentCycleKey = Utils.getDailyResetCycleKey();
        const savedCycleKey = Utils.getDailyResetCycleKey(savedAt);

        if (!currentCycleKey || !savedCycleKey || currentCycleKey !== savedCycleKey) {
          return null;
        }

        const parsedCounter = Utils.parseEnhanceCounter(savedText);
        return parsedCounter ? parsedCounter.text : null;
      } catch (error) {
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

    // Czysty odczyt — sprzątaniem zajmuje się Storage.cleanupStaleEntries().
    getDailyEnhancePoints() {
      const valueToRead =
        window.localStorage.getItem(Storage.getDailyEnhancePointsKey()) ||
        window.localStorage.getItem(Storage.getLegacyDailyEnhancePointsKey());
      if (!valueToRead) return CONFIG.DAILY_POINTS_DEFAULT;

      try {
        const payload = JSON.parse(valueToRead);
        const points = Math.max(0, Math.floor(Utils.toNumber(payload?.points, 0)));
        const savedAt = Utils.toNumber(payload?.savedAt, NaN);
        const payloadCycleKey = String(payload?.cycleKey || "").trim() || null;
        const currentCycleKey = Utils.getDailyResetCycleKey();

        if (!currentCycleKey) return CONFIG.DAILY_POINTS_DEFAULT;

        const savedCycleKey =
          payloadCycleKey ||
          (Number.isFinite(savedAt) ? Utils.getDailyResetCycleKey(savedAt) : null);

        if (!savedCycleKey || savedCycleKey !== currentCycleKey) {
          return CONFIG.DAILY_POINTS_DEFAULT;
        }

        return points;
      } catch (error) {
        return CONFIG.DAILY_POINTS_DEFAULT;
      }
    },

    setDailyEnhancePoints(points) {
      const normalizedPoints = Math.max(0, Math.floor(Utils.toNumber(points, 0)));
      const cycleKey = Utils.getDailyResetCycleKey();

      if (!cycleKey) {
        return normalizedPoints;
      }

      window.localStorage.setItem(
        Storage.getDailyEnhancePointsKey(),
        JSON.stringify({
          points: normalizedPoints,
          savedAt: Date.now(),
          cycleKey,
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

    getLauncherVisibility() {
      const saved = window.localStorage.getItem(Storage.getLauncherVisibilityKey());
      if (saved === null) {
        // Domyślnie launcher jest widoczny (pierwszy raz)
        return true;
      }
      return saved === "true";
    },

    setLauncherVisibility(isVisible) {
      window.localStorage.setItem(
        Storage.getLauncherVisibilityKey(),
        String(Boolean(isVisible))
      );
      return Boolean(isVisible);
    },
  };

  const EnhancementApi = {
    // _g nie zwraca Promise i potrafi nie zawołać callbacku — stąd timeout,
    // inaczej await w pętli ulepszania mógłby wisieć w nieskończoność.
    request(query, timeoutMs = 15000) {
      return new Promise((resolve) => {
        let settled = false;

        const finish = (data) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          resolve(data);
        };

        const timer = setTimeout(() => finish(null), timeoutMs);

        try {
          _g(query, (data) => finish(data));
        } catch (error) {
          finish(null);
        }
      });
    },

    setEnhancedItem(itemId) {
      if (!itemId) return Promise.resolve(null);
      return EnhancementApi.request(
        `enhancement&action=status&item=${encodeURIComponent(itemId)}`
      );
    },

    setReagents(itemId, reagentIds) {
      if (!itemId || !Array.isArray(reagentIds) || reagentIds.length === 0) {
        return Promise.resolve(null);
      }

      return EnhancementApi.request(
        `enhancement&action=progress_preview&item=${encodeURIComponent(
          itemId
        )}&ingredients=${reagentIds.join(",")}`
      );
    },

    enhanceItem(itemId, reagentIds) {
      if (!itemId || !Array.isArray(reagentIds) || reagentIds.length === 0) {
        return Promise.resolve(null);
      }

      return EnhancementApi.request(
        `enhancement&action=progress&item=${encodeURIComponent(
          itemId
        )}&ingredients=${reagentIds.join(",")}`
      );
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

    // Wyliczenie stanu zwiazania jest drogie (query DOM + JSON.stringify na kazdy
    // przedmiot), a leci dla calego plecaka w petli odswiezania - stad krotki cache.
    readBindState(item) {
      const itemId = item?.id;
      if (itemId === undefined || itemId === null) {
        return Inventory.computeBindState(item);
      }

      const cacheKey = String(itemId);
      const now = Date.now();
      const cached = state.bindStateCache.get(cacheKey);

      if (cached && now - cached.at < CONFIG.BIND_STATE_CACHE_TTL_MS) {
        return cached.value;
      }

      const value = Inventory.computeBindState(item);
      state.bindStateCache.set(cacheKey, { at: now, value });

      if (state.bindStateCache.size > 500) {
        state.bindStateCache.forEach((entry, key) => {
          if (now - entry.at >= CONFIG.BIND_STATE_CACHE_TTL_MS) {
            state.bindStateCache.delete(key);
          }
        });
      }

      return value;
    },

    invalidateBindStateCache() {
      state.bindStateCache.clear();
    },

    computeBindState(item) {
      const stats = item?._cachedStats || {};
      const itemNode = item?.id
        ? document.querySelector(`.item-id-${item.id}`)
        : null;
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

      let statsSerialized = "";
      try {
        statsSerialized = Utils.normalizeText(JSON.stringify(stats));
      } catch (error) {
        statsSerialized = "";
      }

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

      const bindText = `${bindParts.join(" | ")} | ${allStatsText} | ${domBindText}`;
      const bindRaw = `${bindText} | ${statsSerialized}`;

      const hasNegation =
        bindText.includes("niezwiaz") || bindText.includes("unbound");

      const isBindsByBind =
        !hasNegation &&
        (bindText.includes("binds") ||
          bindText.includes("wiaze po zalozeniu") ||
          bindText.includes("wiaze po") ||
          bindText.includes("wiaze sie po") ||
          bindText.includes("bind on equip"));

      const isSoulboundByBind =
        !hasNegation &&
        (bindText.includes("soul") ||
          bindText.includes("zwiazany z wlascicielem") ||
          bindText.includes("zwiazany z graczem") ||
          bindText.includes("bound to owner") ||
          bindText.includes("ownerbound"));

      const isPermboundByBind =
        !hasNegation &&
        (bindText.includes("perm") ||
          bindText.includes("zwiazany na stale") ||
          bindText.includes("zwiazany z wlascicielem na stale") ||
          bindText.includes("bound forever") ||
          bindText.includes("permanent bound"));

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

      const isDefinitelyUnboundByText =
        hasNegation ||
        bindRaw.includes("brak wzmianki odnosnie wiazania") ||
        bindRaw.includes("nie jest zwiazany") ||
        bindRaw.includes("not bound");

      const hasExplicitUnboundFlags =
        hasAnyExplicitBindFlag && !hasExplicitBindTrue && hasExplicitBindFalse;

      const isExplicitlySafeUnbound =
        isDefinitelyUnboundByText || hasExplicitUnboundFlags;

      const isUnknownBound =
        !isSoulboundByBind &&
        !isPermboundByBind &&
        !isSoulboundByFlags &&
        !isPermboundByFlags &&
        !hasNegation &&
        !isExplicitlySafeUnbound &&
        (isGenericBoundByFlags ||
          bindText.includes("zwiaz") ||
          bindText.includes("bound"));

      const isSoulbound = isSoulboundByBind || isSoulboundByFlags;
      const isPermbound = isPermboundByBind || isPermboundByFlags;
      const isBinds = isBindsByBind || isBindsByFlags;

      let bindStateName = "unbound";
      if (isPermbound) {
        bindStateName = "permbound";
      } else if (isSoulbound) {
        bindStateName = "soulbound";
      } else if (isBinds) {
        bindStateName = "binds";
      } else if (isUnknownBound) {
        bindStateName = "unknown-bound";
      }

      return {
        isSoulbound,
        isPermbound,
        isBinds,
        isUnknownBound,
        hasNegation,
        isDefinitelyUnboundByText,
        hasExplicitUnboundFlags,
        isExplicitlySafeUnbound,
        state: bindStateName,
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
      const cachedStats = item?._cachedStats;
      if (!cachedStats) return false;

      const itemRarity = cachedStats.rarity;
      if (!itemRarity) return false;

      if (!allowedRarities.includes(itemRarity)) return false;
      if (!ALLOWED_ITEM_TYPES.includes(item?.cl)) return false;

      const isWorthless = Object.prototype.hasOwnProperty.call(
        cachedStats,
        "artisan_worthless"
      );
      if (isWorthless) return false;

      if (Inventory.isAlreadyEnhanced(item)) return false;

      const bindState = Inventory.readBindState(item);
      const boundSettings =
        state.boundSettings ||
        Storage.getBoundSettings() ||
        CONFIG.DEFAULT_BOUND_SETTINGS;
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

      if (
        bindState.state === "soulbound" &&
        (!boundSettings.allowSoulbound || !canUseBoundByRarity)
      ) {
        return false;
      }

      if (
        bindState.state === "permbound" &&
        (!boundSettings.allowPermbound || !canUseBoundByRarity)
      ) {
        return false;
      }

      if (
        bindState.state === "unknown-bound" &&
        !boundSettings.allowSoulbound &&
        !boundSettings.allowPermbound
      ) {
        return false;
      }

      return true;
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
      const EXCLUDED_BAG_SLOT_SELECTOR = ".bag-4-slot";
      const EXCLUDED_BAG_SELECTOR = '[data-bag="26"]';
      const isInExcludedBagSlot = (node) =>
        Boolean(
          node?.closest?.(EXCLUDED_BAG_SLOT_SELECTOR) ||
            node?.closest?.(EXCLUDED_BAG_SELECTOR)
        );

      // 1. API gry jest autorytatywne - probujemy je jako pierwsze.
      const readEngineFreeSlots = () => {
        const getter = window.Engine?.items?.getFreeSlots;
        if (typeof getter !== "function") return null;

        for (const args of [["g"], []]) {
          try {
            const value = getter.apply(window.Engine.items, args);
            if (typeof value === "number" && Number.isFinite(value) && value >= 0) {
              return value;
            }
          } catch (error) {
            // Nastepna proba.
          }
        }

        return null;
      };

      const engineFreeSlots = readEngineFreeSlots();

      if (engineFreeSlots !== null) {
        const excludedBagEmptySlots = [
          ...document.querySelectorAll(`${EXCLUDED_BAG_SELECTOR} .item.empty`),
          ...document.querySelectorAll(`${EXCLUDED_BAG_SELECTOR} .slot.empty`),
        ].length;

        return {
          freeSlots: Math.max(0, engineFreeSlots - excludedBagEmptySlots),
          source: "Engine.items.getFreeSlots",
          excludedBagEmptySlots,
        };
      }

      // 2. Fallback na DOM. Bierzemy MINIMUM, bo zawyzenie liczby wolnych slotow
      //    powoduje, ze auto-ulepszanie nigdy sie nie odpali. Zanizenie jest
      //    nieszkodliwe - najwyzej odpali sie troche wczesniej.
      const candidates = [];
      const addCandidate = (freeSlots, source, extra = {}) => {
        if (typeof freeSlots !== "number" || !Number.isFinite(freeSlots)) return;
        if (freeSlots < 0) return;
        candidates.push({ freeSlots, source, ...extra });
      };

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
        .map(
          (selector) =>
            [...document.querySelectorAll(selector)].filter(
              (node) => !isInExcludedBagSlot(node)
            ).length
        )
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
        let occupiedSlots = 0;
        try {
          occupiedSlots = Engine.items.fetchLocationItems("g").length;
        } catch (error) {
          occupiedSlots = 0;
        }

        const totalSlots = [
          ...inventoryRoot.querySelectorAll(".item, .slot"),
        ].filter((node) => !isInExcludedBagSlot(node)).length;

        if (totalSlots > 0 && totalSlots >= occupiedSlots) {
          addCandidate(totalSlots - occupiedSlots, "DOM total - occupied", {
            totalSlots,
            occupiedSlots,
          });
        }

        const allItemNodes = [...inventoryRoot.querySelectorAll(".item")].filter(
          (node) => !isInExcludedBagSlot(node)
        );
        const occupiedFromDom = allItemNodes.filter((node) => {
          const className = typeof node.className === "string" ? node.className : "";
          return /item-id-\d+/.test(className);
        }).length;

        if (allItemNodes.length > 0 && allItemNodes.length >= occupiedFromDom) {
          addCandidate(
            allItemNodes.length - occupiedFromDom,
            "DOM .item - .item-id-*",
            {
              totalSlots: allItemNodes.length,
              occupiedSlots: occupiedFromDom,
            }
          );
        }
      }

      const scrollPane = document.querySelector(".scroll-pane");
      if (scrollPane) {
        const slotNodes = [...scrollPane.querySelectorAll(".item, .slot")].filter(
          (node) => !isInExcludedBagSlot(node)
        );

        if (slotNodes.length > 0) {
          const occupiedInScrollPane = slotNodes.filter((node) => {
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
        candidates.sort((a, b) => a.freeSlots - b.freeSlots);
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

  };

  const Ui = {
    setupCss() {
      const css = `
      :root {
        --ql-bg: rgba(13, 13, 15, 0.97);
        --ql-bg-soft: rgba(255, 255, 255, 0.04);
        --ql-bg-softer: rgba(255, 255, 255, 0.02);
        --ql-border: rgba(255, 255, 255, 0.08);
        --ql-border-strong: rgba(255, 255, 255, 0.14);
        --ql-text: #f2f2f3;
        --ql-text-dim: #9a9aa0;
        --ql-text-mute: #6b6b70;
        --ql-white-pill: #f4f4f5;
        --ql-white-pill-hover: #e4e4e7;
        --ql-black-on-white: #18181b;
        --ql-green: #4ade80;
        --ql-red: #f87171;
        --ql-blue: #60a5fa;
        --ql-orange: #fb923c;
        --ql-radius-sm: 6px;
        --ql-radius-md: 10px;
        --ql-radius-lg: 14px;
        --ql-font: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      }
      .upgrader-crafting-window {
        display: none !important;
      }
      .upgrader-crafting-window-offscreen {
        position: fixed !important;
        top: -9999px !important;
        left: -9999px !important;
        opacity: 0 !important;
      }
      .widget-button.widget-upgrader-addon {
        cursor: pointer;
        overflow: hidden;
        background: var(--ql-bg) !important;
        border-color: var(--ql-border-strong) !important;
      }
      .widget-button.widget-upgrader-addon::before {
        box-shadow: inset 0 0 0 1px var(--ql-border-strong) !important;
      }
      .widget-button.widget-upgrader-addon .icon.upgrader-widget-icon {
        display: flex;
        align-items: center;
        justify-content: center;
        position: absolute !important;
        top: 2px !important;
        right: 2px !important;
        bottom: 2px !important;
        left: 2px !important;
        margin: 0 !important;
        box-sizing: border-box;
        width: auto !important;
        height: auto !important;
        padding: 0;
        overflow: hidden;
        border-radius: var(--ql-radius-sm);
        transform: none !important;
        font-weight: 600;
        font-size: 14px;
        color: var(--ql-text);
        background-image: url("https://micc.garmory-cdn.cloud/obrazki/npc/e2/trist2_wabicielka-1a.gif") !important;
        background-repeat: no-repeat !important;
        background-position: calc(50% + 2px) 50% !important;
        background-size: 94% 94% !important;
        background-origin: border-box !important;
        background-clip: border-box !important;
        image-rendering: auto;
      }
      .widget-button.widget-upgrader-addon.ui-draggable-dragging {
        z-index: 1000 !important;
      }
      .upgrader-launcher,
      .upgrader-launcher *,
      .upgrader-label,
      .menu-item--yellow {
        font-family: var(--ql-font) !important;
      }
      .menu-item--yellow {
        background: var(--ql-white-pill) !important;
        color: var(--ql-black-on-white) !important;
        border-radius: var(--ql-radius-sm) !important;
        padding: 5px !important;
        font-weight: 600 !important;
      }
      .upgrader-label {
          position: absolute;
          top: 18px;
          left: 8px;
          height: 16px;
          width: 32px;
          text-align: center;
          color: var(--ql-green);
          pointer-events: none;
          text-shadow: -1px 0 black, 0 1px black, 1px 0 black, 0 -1px black;
          font-size: 0.75rem;
          font-weight: 700;
      }
          /* --- Panel --------------------------------------------------------
             Gestosc sterowana zmiennymi: przelacznik ukladu zmienia odstepy i
             wysokosci, a NIE rozmiary czcionek (od tego jest osobna skala). */
          .upgrader-launcher {
            --ql-pad: 9px;
            --ql-gap: 7px;
            --ql-w: 192px;
            --ql-w-open: 356px;
            --ql-icon: 38px;
            --ql-track-h: 16px;
            --ql-btn-h: 28px;
            --ql-card-pad: 8px;
            --ql-grip: 9px;

            position: fixed;
            right: 16px;
            top: 150px;
            width: var(--ql-w);
            z-index: 99999;
            box-sizing: border-box;
            padding: var(--ql-pad);
            padding-bottom: calc(var(--ql-pad) + var(--ql-grip));
            border: 1px solid var(--ql-border);
            border-radius: var(--ql-radius-lg);
            background: var(--ql-bg);
            color: var(--ql-text);
            font-family: var(--ql-font);
            font-weight: 500;
            cursor: default;
            user-select: none;
            box-shadow: 0 8px 24px rgba(0, 0, 0, 0.5);
            transform: scale(var(--ql-scale, 1));
            transform-origin: top left;
            transition: width 0.28s cubic-bezier(0.4, 0, 0.2, 1);
          }
          .upgrader-launcher.is-cozy {
            --ql-pad: 12px;
            --ql-gap: 10px;
            --ql-w: 226px;
            --ql-w-open: 384px;
            --ql-icon: 46px;
            --ql-track-h: 19px;
            --ql-btn-h: 32px;
            --ql-card-pad: 10px;
          }
          .upgrader-launcher.is-expanded {
            width: var(--ql-w-open);
          }
          .upgrader-launcher.is-resizing {
            transition: none !important;
          }

          /* --- Naglowek ----------------------------------------------------- */
          .upgrader-launcher-header {
            display: flex;
            align-items: center;
            gap: 6px;
            margin: calc(var(--ql-pad) * -1) calc(var(--ql-pad) * -1) var(--ql-gap);
            padding: calc(var(--ql-pad) - 1px) var(--ql-pad);
          }
          .upgrader-launcher-gear {
            flex: 0 0 auto;
            width: 20px;
            height: 20px;
            padding: 0;
            display: flex;
            align-items: center;
            justify-content: center;
            border: 1px solid var(--ql-border);
            border-radius: 999px;
            background: var(--ql-bg-soft);
            color: var(--ql-text-dim);
            cursor: pointer;
            transition: background 0.15s ease, color 0.15s ease;
          }
          .upgrader-launcher-gear svg {
            width: 12px;
            height: 12px;
            transition: transform 0.28s ease;
          }
          .upgrader-launcher.is-expanded .upgrader-launcher-gear svg {
            transform: rotate(75deg);
          }
          .upgrader-launcher-gear:hover {
            background: var(--ql-white-pill);
            color: var(--ql-black-on-white);
          }
          .upgrader-launcher-title {
            flex: 1 1 auto;
            min-width: 0;
            font-size: 12px;
            font-weight: 800;
            letter-spacing: 0.6px;
            text-transform: uppercase;
            text-align: center;
            cursor: move;
            color: var(--ql-text);
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
          }
          .upgrader-launcher-stock {
            flex: 0 0 auto;
            font-size: 10px;
            font-weight: 700;
            color: var(--ql-text-dim);
            background: var(--ql-bg-soft);
            border: 1px solid var(--ql-border);
            border-radius: 999px;
            padding: 2px 6px;
            min-width: 8px;
            text-align: center;
          }

          /* --- Wiersz glowny: ikona + pasek + licznik w jednej linii --------
             Wczesniej byly to trzy osobne bloki jeden pod drugim (~90 px). */
          .upgrader-launcher-main {
            display: flex;
            align-items: center;
            gap: var(--ql-gap);
            margin-bottom: var(--ql-gap);
          }
          .upgrader-launcher-item-box {
            flex: 0 0 auto;
            width: var(--ql-icon);
            height: var(--ql-icon);
            box-sizing: border-box;
            display: flex;
            align-items: center;
            justify-content: center;
            overflow: hidden;
            border: 1px solid var(--ql-rarity-color, var(--ql-border));
            border-radius: var(--ql-radius-md);
            background: var(--ql-bg-softer);
            box-shadow: 0 0 6px -1px var(--ql-rarity-glow, transparent);
            cursor: help;
          }
          .upgrader-launcher-item-box-empty {
            font-size: 16px;
            font-weight: 300;
            line-height: 1;
            color: var(--ql-text-mute);
          }
          .upgrader-launcher-meters {
            flex: 1 1 auto;
            min-width: 0;
            display: flex;
            flex-direction: column;
            gap: 4px;
          }
          .upgrader-launcher-progress-track {
            position: relative;
            width: 100%;
            height: var(--ql-track-h);
            box-sizing: border-box;
            border-radius: 999px;
            border: 1px solid var(--ql-border);
            background: rgba(255, 255, 255, 0.06);
            box-shadow: inset 0 2px 4px rgba(0, 0, 0, 0.45);
            overflow: hidden;
          }
          .upgrader-launcher-progress-fill {
            position: absolute;
            inset: 0;
            width: 0%;
            background:
              repeating-linear-gradient(
                45deg,
                rgba(255, 255, 255, 0.16) 0px,
                rgba(255, 255, 255, 0.16) 7px,
                transparent 7px,
                transparent 14px
              ),
              linear-gradient(180deg, rgba(255, 255, 255, 0.22), transparent 55%),
              linear-gradient(90deg, rgba(21, 128, 61, 0.9), rgba(74, 222, 128, 0.95));
            background-size: 20px 20px, 100% 100%, 100% 100%;
            background-repeat: repeat, no-repeat, no-repeat;
            animation: ql-progress-stripes 1s linear infinite;
            transition: width 0.25s ease;
            overflow: hidden;
          }
          .upgrader-launcher-progress-fill::after {
            content: "";
            position: absolute;
            top: 0;
            right: 0;
            bottom: 0;
            width: 8px;
            background: rgba(255, 255, 255, 0.75);
            filter: blur(3px);
            opacity: 0.85;
          }
          @keyframes ql-progress-stripes {
            from {
              background-position: 0 0, 0 0, 0 0;
            }
            to {
              background-position: 20px 0, 0 0, 0 0;
            }
          }
          .upgrader-launcher-progress-label {
            position: relative;
            z-index: 1;
            height: 100%;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 9px;
            font-weight: 700;
            color: var(--ql-text);
            text-shadow: 0 1px 2px rgba(0, 0, 0, 0.65);
            padding: 0 4px;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
          }
          .upgrader-launcher-counter {
            margin: 0;
            font-size: 10px;
            font-weight: 700;
            line-height: 1.2;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
            color: var(--ql-red);
          }
          .upgrader-launcher-counter--good {
            color: var(--ql-green);
          }
          .upgrader-launcher-counter--mid {
            color: #eab308;
          }
          .upgrader-launcher-counter--low {
            color: var(--ql-red);
          }
          .upgrader-launcher-main-btn {
            display: block;
            width: 100%;
            height: var(--ql-btn-h);
            border: 1px solid var(--ql-border);
            border-radius: 999px;
            background: var(--ql-bg-soft);
            color: var(--ql-text);
            font-size: 12px;
            font-weight: 800;
            letter-spacing: 0.3px;
            cursor: pointer;
            transition: background 0.15s ease, color 0.15s ease, border-color 0.15s ease;
          }
          .upgrader-launcher-main-btn:hover {
            background: var(--ql-white-pill);
            color: var(--ql-black-on-white);
            border-color: var(--ql-white-pill);
          }

          /* --- Ustawienia --------------------------------------------------- */
          .upgrader-settings-body {
            max-height: 0;
            opacity: 0;
            overflow: hidden;
            margin-top: 0;
            transition: max-height 0.32s cubic-bezier(0.4, 0, 0.2, 1),
              opacity 0.22s ease, margin-top 0.28s ease;
          }
          .upgrader-launcher.is-expanded .upgrader-settings-body {
            max-height: 1200px;
            opacity: 1;
            margin-top: var(--ql-gap);
          }
          .upgrader-grid-2 {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: var(--ql-gap);
          }
          .upgrader-card {
            box-sizing: border-box;
            min-width: 0;
            padding: var(--ql-card-pad);
            border: 1px solid var(--ql-border);
            border-radius: var(--ql-radius-md);
            background: var(--ql-bg-softer);
          }
          .upgrader-card--wide {
            grid-column: 1 / -1;
          }
          .upgrader-card-title {
            font-size: 10px;
            font-weight: 700;
            letter-spacing: 0.5px;
            text-transform: uppercase;
            color: var(--ql-text-mute);
            margin-bottom: 6px;
          }
          .upgrader-row {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 8px;
            margin-bottom: 6px;
            font-size: 12px;
            line-height: 1.25;
            color: var(--ql-text);
          }
          .upgrader-row:last-child {
            margin-bottom: 0;
          }
          .upgrader-row > span:first-child {
            min-width: 0;
            overflow: hidden;
            text-overflow: ellipsis;
          }
          .upgrader-row-tail {
            flex: 0 0 auto;
            display: inline-flex;
            align-items: center;
            gap: 6px;
          }
          .upgrader-row-value {
            flex: 0 0 auto;
            font-weight: 700;
            color: var(--ql-text-dim);
          }
          .upgrader-note {
            margin-top: 5px;
            font-size: 11px;
            line-height: 1.35;
            color: var(--ql-text-dim);
          }
          .upgrader-note--warn {
            display: flex;
            align-items: center;
            gap: 6px;
            color: var(--ql-red);
          }
          .upgrader-slider {
            display: block;
            width: 100%;
            margin: 2px 0 0;
            accent-color: var(--ql-text);
          }
          .upgrader-slider:disabled {
            opacity: 0.4;
          }

          /* Rarity jako chipy - trzy pozycje mieszcza sie w jednej-dwoch liniach
             zamiast trzech osobnych wierszy. */
          .upgrader-chips {
            display: flex;
            flex-wrap: wrap;
            gap: 4px;
          }
          .upgrader-gui-rarity-item {
            display: inline-flex;
            align-items: center;
            gap: 5px;
            padding: 3px 8px;
            border: 1px solid var(--ql-border);
            border-radius: 999px;
            background: var(--ql-bg-soft);
            font-size: 11px;
            line-height: 1;
            cursor: pointer;
            transition: border-color 0.15s ease, background 0.15s ease;
          }
          .upgrader-gui-rarity-item:hover {
            border-color: var(--ql-border-strong);
          }
          .upgrader-rarity-common {
            color: var(--ql-text-dim);
          }
          .upgrader-rarity-unique {
            color: #eab308;
          }
          .upgrader-rarity-heroic {
            color: var(--ql-blue);
          }
          .upgrader-hotkeys-grid {
            display: grid;
            grid-template-columns: 1fr 28px;
            gap: 5px;
            align-items: center;
          }
          .upgrader-hotkeys-label {
            font-size: 11px;
            font-weight: 500;
            color: var(--ql-text-dim);
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
          }
          .upgrader-hotkeys-input {
            box-sizing: border-box;
            width: 100%;
            height: 24px;
            padding: 0;
            font-size: 12px;
            font-weight: 700;
            border: 1px solid var(--ql-border-strong);
            border-radius: var(--ql-radius-sm);
            background: var(--ql-bg-soft);
            color: var(--ql-text);
            text-align: center;
            cursor: pointer;
          }

          .upgrader-gui-row {
            display: flex;
            gap: 5px;
            margin-top: var(--ql-gap);
          }
          .upgrader-gui-btn {
            flex: 1;
            min-width: 0;
            height: var(--ql-btn-h);
            padding: 0 6px;
            border: 1px solid var(--ql-border);
            border-radius: 999px;
            background: var(--ql-bg-soft);
            color: var(--ql-text);
            font-size: 11px;
            font-weight: 700;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
            cursor: pointer;
            transition: background 0.15s ease, color 0.15s ease, border-color 0.15s ease;
          }
          .upgrader-gui-btn:hover {
            background: var(--ql-white-pill);
            color: var(--ql-black-on-white);
            border-color: var(--ql-white-pill);
          }
          .upgrader-mini-btn {
            flex: 0 0 auto;
            padding: 2px 8px;
            border: 1px solid var(--ql-border);
            border-radius: 999px;
            background: var(--ql-bg-soft);
            color: var(--ql-text-dim);
            font-size: 10px;
            font-weight: 700;
            cursor: pointer;
            transition: background 0.15s ease, color 0.15s ease, border-color 0.15s ease;
          }
          .upgrader-mini-btn:hover {
            background: var(--ql-white-pill);
            color: var(--ql-black-on-white);
            border-color: var(--ql-white-pill);
          }
          .upgrader-tooltip-trigger {
            flex: 0 0 auto;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            width: 15px;
            height: 15px;
            border-radius: 50%;
            border: 1px solid var(--ql-border-strong);
            color: var(--ql-text-dim);
            font-size: 10px;
            line-height: 1;
            background: var(--ql-bg-soft);
            cursor: help;
          }
          .upgrader-selected-preview-item {
            width: 100% !important;
            height: 100% !important;
            box-sizing: border-box;
            border: 0 !important;
            margin: 0 !important;
            padding: 0 !important;
            position: relative !important;
            left: 0 !important;
            top: 0 !important;
            right: auto !important;
            bottom: auto !important;
            transform: none !important;
            display: block !important;
            overflow: hidden;
          }
          .upgrader-selected-preview-icon {
            width: 100%;
            height: 100%;
            display: block;
            image-rendering: pixelated;
            object-fit: contain;
            position: relative;
            z-index: 1;
          }
          .upgrader-launcher input[type="checkbox"] {
            appearance: none;
            -webkit-appearance: none;
            flex: 0 0 auto;
            position: relative;
            width: 15px;
            height: 15px;
            margin: 0;
            border-radius: 4px;
            border: 1px solid var(--ql-border-strong);
            background: var(--ql-bg-soft);
            cursor: pointer;
            transition: background 0.15s ease, border-color 0.15s ease;
          }
          .upgrader-launcher input[type="checkbox"]:checked {
            background: var(--ql-white-pill);
            border-color: var(--ql-white-pill);
          }
          .upgrader-launcher input[type="checkbox"]:checked::after {
            content: "";
            position: absolute;
            left: 4px;
            top: 0px;
            width: 3px;
            height: 7px;
            border: solid var(--ql-black-on-white);
            border-width: 0 2px 2px 0;
            transform: rotate(45deg);
          }
          .upgrader-launcher-resize {
            position: absolute;
            right: 3px;
            bottom: 3px;
            width: 12px;
            height: 12px;
            cursor: nwse-resize;
            opacity: 0.28;
            border-radius: 3px;
            transition: opacity 0.15s ease;
            background-image:
              linear-gradient(
                135deg,
                transparent 0 46%,
                var(--ql-text-dim) 46% 58%,
                transparent 58% 100%
              ),
              linear-gradient(
                135deg,
                transparent 0 74%,
                var(--ql-text-dim) 74% 86%,
                transparent 86% 100%
              );
          }
          .upgrader-launcher-resize:hover {
            opacity: 0.95;
          }

            .upgrader-notification {
              position: fixed;
              top: 30%;
              left: 50%;
              transform: translate(-50%, -50%) scale(0.9);
              z-index: 99999;
              min-width: 160px;
              max-width: 200px;
              padding: 8px 12px;
              border-radius: 8px;
              background: rgba(30, 20, 60, 0.4);
              backdrop-filter: blur(16px);
              box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4), 0 0 0 1px rgba(168, 85, 247, 0.2);
              color: #ffffff;
              font-family: var(--ql-font);
              text-align: center;
              pointer-events: none;
              opacity: 0;
              transition: opacity 0.4s cubic-bezier(0.34, 1.56, 0.64, 1),
                transform 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);
            }
            .upgrader-notification.is-visible {
              opacity: 1;
              transform: translate(-50%, -50%) scale(1);
            }
            .upgrader-notification.is-leaving {
              opacity: 0;
              transform: translate(-50%, -60%) scale(0.95);
            }
            .upgrader-notification-kicker {
              font-size: 8px;
              font-weight: 600;
              letter-spacing: 0.5px;
              text-transform: uppercase;
              margin-bottom: 4px;
              opacity: 0.75;
              color: #e0e7ff;
            }
            .upgrader-notification-icon {
              display: inline-block;
              width: 32px;
              height: 32px;
              margin-bottom: 4px;
            }
            .upgrader-notification-icon img {
              width: 100%;
              height: 100%;
              image-rendering: pixelated;
            }
            .upgrader-notification-name {
              font-size: 12px;
              font-weight: 700;
              margin-bottom: 3px;
              text-shadow: 0 1px 4px rgba(0, 0, 0, 0.5);
              line-height: 1.1;
              word-break: break-word;
            }
            .upgrader-notification-level {
              display: inline-block;
              background: rgba(255, 255, 255, 0.15);
              border-radius: 8px;
              padding: 2px 8px;
              margin-bottom: 4px;
              font-size: 11px;
              font-weight: 700;
            }
            .upgrader-notification-counter {
              font-size: 10px;
              font-weight: 600;
              margin-bottom: 3px;
              opacity: 0.8;
              color: #e0e7ff;
            }
            .upgrader-notification-points {
              font-size: 18px;
              font-weight: 800;
              color: #fbbf24;
              text-shadow: 0 0 12px rgba(251, 191, 36, 0.6), 0 1px 4px rgba(0, 0, 0, 0.5);
            }
            .upgrader-notification-footer {
              font-size: 7px;
              font-weight: 600;
              margin-top: 2px;
              opacity: 0.65;
              color: #e0e7ff;
            }

    `;

      const style = document.createElement("style");
      style.appendChild(document.createTextNode(css));
      document.head.appendChild(style);
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

    getCraftingWindowNode() {
      try {
        return Engine?.crafting?.window?.wnd?.$ || null;
      } catch (error) {
        return null;
      }
    },

    prepareEnhancementWindow() {
      const hideCssClass = "upgrader-crafting-window";
      const session = { wasOpenBeforeRun: false, hideCssClass: null };

      const craftingWindow = Ui.getCraftingWindowNode();
      if (!craftingWindow) return session;

      session.wasOpenBeforeRun = Ui.isCraftingWindowOpen();

      // hideCssClass zapisujemy PRZED addClass - gdyby cokolwiek nizej rzucilo,
      // restoreEnhancementWindow i tak zdejmie klase i nie zostawi ukrytego okna.
      session.hideCssClass = hideCssClass;

      try {
        craftingWindow.addClass(hideCssClass);

        if (!session.wasOpenBeforeRun) {
          Engine.interface.clickCrafting();
        }
      } catch (error) {
        Ui.restoreEnhancementWindow(session);
        return { wasOpenBeforeRun: session.wasOpenBeforeRun, hideCssClass: null };
      }

      return session;
    },

    restoreEnhancementWindow(session) {
      const safeSession = session || {};
      const wasOpenBeforeRun = Boolean(safeSession.wasOpenBeforeRun);
      const hideCssClass = safeSession.hideCssClass || null;

      try {
        const craftingWindow = Ui.getCraftingWindowNode();
        if (craftingWindow && hideCssClass) {
          craftingWindow.removeClass(hideCssClass);
        }

        if (hideCssClass && !wasOpenBeforeRun && Ui.isCraftingWindowOpen()) {
          Engine.interface.clickCrafting();
        }
      } catch (error) {
        // Nic wiecej nie zrobimy - grunt, ze klasa ukrywajaca zostala zdjeta.
      }
    },

    markItemAsUpgraded(prevId) {
      if (prevId) {
        $(`.item-id-${prevId}`).find(".upgrader-label").remove();
      }

      const upgradedItemId = Storage.getUpgradedItemId();
      if (!upgradedItemId) return;

      const upgradedItem = Engine.items.getItemById(upgradedItemId);
      if (!upgradedItem) return;

      const $nodes = $(`.item-id-${upgradedItemId}`);
      $nodes.find(".upgrader-label").remove();
      $nodes.append($(`<div class="upgrader-label">U</div>`));
    },

    // Gra przerysowuje wezly plecaka przy kazdej zmianie ekwipunku, co kasowalo
    // etykiete "U". Obserwator (z debounce) nakleja ja z powrotem.
    initUpgradedLabelWatcher() {
      if (state.upgradedLabelObserver) return;

      let scheduled = false;

      const reapply = () => {
        scheduled = false;

        const upgradedItemId = Storage.getUpgradedItemId();
        if (!upgradedItemId) return;

        const nodes = document.querySelectorAll(`.item-id-${upgradedItemId}`);
        if (nodes.length === 0) return;

        const needsLabel = [...nodes].some(
          (node) => !node.querySelector(".upgrader-label")
        );
        if (!needsLabel) return;

        Ui.markItemAsUpgraded();
      };

      state.upgradedLabelObserver = new MutationObserver(() => {
        // Zmiana w plecaku uniewaznia tez cache stanu zwiazania przedmiotow.
        Inventory.invalidateBindStateCache();

        if (scheduled) return;
        scheduled = true;
        setTimeout(reapply, 250);
      });

      const root =
        document.querySelector(".inventory") ||
        document.querySelector(".backpack") ||
        document.body;

      state.upgradedLabelObserver.observe(root, {
        childList: true,
        subtree: true,
      });
    },

    resolveItemIconUrl(item) {
      const icon =
        item?.icon || item?.tpl?.icon || item?._cachedStats?.icon || "";
      if (!icon || typeof icon !== "string") return "";
      if (/^(data:|https?:|\/\/)/.test(icon)) return icon;

      const base =
        window.CFG?.item_dir ||
        window.Engine?.item_dir ||
        "https://micc.garmory-cdn.cloud/obrazki/itemy/";

      return `${String(base).replace(/\/?$/, "/")}${icon.replace(/^\//, "")}`;
    },

    buildIconDataUrlFromCanvas(sourceCanvas) {
      const SIZE = 32;
      const sourceWidth = sourceCanvas?.width || 0;
      const sourceHeight = sourceCanvas?.height || 0;
      if (!sourceWidth || !sourceHeight) return "";

      try {
        const canvas = document.createElement("canvas");
        canvas.width = SIZE;
        canvas.height = SIZE;
        const context = canvas.getContext("2d");
        if (!context) return "";

        context.imageSmoothingEnabled = false;

        const scale = Math.min(SIZE / sourceWidth, SIZE / sourceHeight);
        const drawWidth = Math.max(1, Math.round(sourceWidth * scale));
        const drawHeight = Math.max(1, Math.round(sourceHeight * scale));
        const offsetX = Math.round((SIZE - drawWidth) / 2);
        const offsetY = Math.round((SIZE - drawHeight) / 2);

        context.drawImage(
          sourceCanvas,
          0,
          0,
          sourceWidth,
          sourceHeight,
          offsetX,
          offsetY,
          drawWidth,
          drawHeight
        );

        return canvas.toDataURL("image/png");
      } catch (error) {
        return "";
      }
    },

    resolveItemRarity(item, sourceNode) {
      const fromStats = item?._cachedStats?.rarity;
      if (fromStats && CONFIG.RARITY_META[fromStats]) return fromStats;

      const itemType = sourceNode?.getAttribute?.("data-item-type");
      if (itemType && CONFIG.RARITY_BY_ITEM_TYPE[itemType]) {
        return CONFIG.RARITY_BY_ITEM_TYPE[itemType];
      }

      return fromStats || "";
    },

    applyRarityStyling(rarity) {
      const wrap = document.getElementById("upgrader-launcher-item-box");
      const meta = CONFIG.RARITY_META[rarity];

      if (wrap) {
        if (meta) {
          wrap.style.setProperty("--ql-rarity-color", meta.color);
          wrap.style.setProperty("--ql-rarity-glow", `${meta.color}59`);
        } else {
          wrap.style.removeProperty("--ql-rarity-color");
          wrap.style.removeProperty("--ql-rarity-glow");
        }
      }
    },

    buildItemIconNode(item, sourceNode) {
      if (!item) return null;

      const sourceCanvas = sourceNode?.querySelector?.("canvas.icon.canvas-icon");
      const canvasFallback = Ui.buildIconDataUrlFromCanvas(sourceCanvas);
      const iconUrl = Ui.resolveItemIconUrl(item);

      if (!canvasFallback && !iconUrl) return null;

      const previewItem = document.createElement("div");
      previewItem.className = "upgrader-selected-preview-item";

      const iconPreview = document.createElement("img");
      iconPreview.className = "upgrader-selected-preview-icon";
      iconPreview.alt = item.name || "Wybrany przedmiot";

      if (iconUrl) {
        iconPreview.src = iconUrl;
        if (canvasFallback) {
          iconPreview.onerror = () => {
            iconPreview.onerror = null;
            iconPreview.src = canvasFallback;
          };
        }
      } else {
        iconPreview.src = canvasFallback;
      }

      previewItem.appendChild(iconPreview);
      return previewItem;
    },

    renderSelectedItemPreview() {
      const launcherBox = document.getElementById("upgrader-launcher-item-box");
      if (!launcherBox) return;

      launcherBox.innerHTML = "";
      launcherBox.removeAttribute("title");

      // Pole podgladu jest male, wiec komunikat idzie do tooltipa, a w srodku
      // zostaje tylko znacznik - inaczej tekst by sie nie zmiescil.
      const setEmptyState = (hint) => {
        const empty = document.createElement("div");
        empty.className = "upgrader-launcher-item-box-empty";
        empty.textContent = "+";
        launcherBox.appendChild(empty);
        launcherBox.title = hint;
        Ui.applyRarityStyling("");
      };
      const selectedId = Storage.getUpgradedItemId();
      if (!selectedId) {
        setEmptyState("Brak przedmiotu");
        return;
      }

      const item = Engine.items.getItemById(selectedId);
      if (!item) {
        setEmptyState(`ID: ${selectedId} (poza plecakiem)`);
        return;
      }

      const sourceNode = document.querySelector(`.item-id-${selectedId}`);
      const iconNode = Ui.buildItemIconNode(item, sourceNode);
      if (iconNode) launcherBox.appendChild(iconNode);

      if (item.name) launcherBox.title = item.name;
      Ui.applyRarityStyling(Ui.resolveItemRarity(item, sourceNode));
    },

    clearUpgradedItem() {
      const previousId = Storage.getUpgradedItemId();
      Storage.setUpgradedItemId("");
      Ui.markItemAsUpgraded(previousId);
      Ui.renderSelectedItemPreview();
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
        counterNode.textContent = "LIMIT: --/--";
        return;
      }

      if (state.enhanceCounter !== counter.text) {
        state.enhanceCounter = counter.text;
        Storage.setEnhanceCounter(counter.text);
      }

      const dailyPoints = Storage.getDailyEnhancePoints();
      state.dailyEnhancePoints = dailyPoints;
      counterNode.textContent = `LIMIT: ${counter.text} (${Utils.formatPoints(dailyPoints)})`;

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
      const currentPoints = Storage.getDailyEnhancePoints();
      state.dailyEnhancePoints = currentPoints;

      // Wezel #upgrader-launcher-points nigdy nie istnial w HTML, wiec wczesniejszy
      // early-return sprawial, ze ta funkcja nie robila nic - nawet nie odswiezala
      // stanu. Punkty pokazujemy w linii licznika limitu.
      const pointsNode = document.getElementById("upgrader-launcher-points");
      if (pointsNode) {
        pointsNode.textContent = `Punkty dziś: ${Utils.formatPoints(currentPoints)}`;
      }
    },

    refreshEnhanceProgress() {
      const fill = document.getElementById("upgrader-launcher-progress-fill");
      const label = document.getElementById("upgrader-launcher-progress-label");
      if (!fill || !label) return;

      const upgradedItemId = Storage.getUpgradedItemId();

      const source = document.querySelector(
        ".enhance__progress-text.enhance__progress-text--current"
      );
      const freshProgress = Utils.parseProgressText(source?.textContent);

      if (freshProgress) {
        state.lastEnhanceProgress = {
          itemId: upgradedItemId,
          current: freshProgress.current,
          target: freshProgress.target,
        };
      }

      const cached = state.lastEnhanceProgress;
      const progress =
        cached && cached.itemId === upgradedItemId
          ? { current: cached.current, target: cached.target }
          : null;

      if (!progress) {
        fill.style.width = "0%";
        label.textContent = "-- / --";
        return;
      }

      const percent = progress.target > 0
        ? Utils.clamp(Math.round((progress.current / progress.target) * 100), 0, 100)
        : 0;

      fill.style.width = `${percent}%`;
      label.textContent = `${Utils.formatPoints(progress.current)} / ${Utils.formatPoints(progress.target)} (${percent}%)`;
    },

    refreshReagentStock() {
      const stockNode = document.getElementById("upgrader-launcher-stock");
      if (!stockNode) return;

      let count = 0;
      try {
        count = Inventory.getReagents().length;
      } catch (error) {
        count = 0;
      }

      stockNode.textContent = String(count);
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

      info.textContent =
        freeSlots === null
          ? "Wolne sloty: nie udało się odczytać"
          : `Wolne sloty teraz: ${freeSlots}`;
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
        const meta = CONFIG.RARITY_FILTER_META[rarity];

        const label = document.createElement("label");
        label.className = "upgrader-gui-rarity-item";

        const input = document.createElement("input");
        input.type = "checkbox";
        input.className = "upgrader-rarity-checkbox";
        input.value = rarity;
        input.checked = selectedRarities.includes(rarity);

        const span = document.createElement("span");
        span.textContent = meta?.label || rarity;
        span.className = meta?.className || "";

        label.appendChild(input);
        label.appendChild(span);
        wrap.appendChild(label);
      });
    },

    renderModeDependentTexts() {
      const manualButton = document.getElementById("upgrader-launcher-enhance-btn");
      const hint = document.getElementById("upgrader-select-hint");
      const autoLabel = document.getElementById("upgrader-auto-label");

      const hotkeys = state.hotkeys || CONFIG.DEFAULT_HOTKEYS;
      const activeHotkey = (hotkeys.enhance || "").toUpperCase();

      if (manualButton) {
        manualButton.textContent = activeHotkey ? `ULEPSZ (${activeHotkey})` : "ULEPSZ";
      }

      if (hint) {
        hint.textContent = "Wybór przedmiotu: PPM na itemie → „Ulepsz ten przedmiot”.";
      }

      if (autoLabel) {
        autoLabel.textContent = "Auto ulepszanie";
      }
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

      // getBoundingClientRect, nie offsetWidth - panel bywa przeskalowany
      // (transform: scale), a offsetWidth zwraca rozmiar sprzed skalowania.
      const rect = button.getBoundingClientRect();
      const maxLeft = Math.max(window.innerWidth - rect.width, 0);
      const maxTop = Math.max(window.innerHeight - rect.height, 0);

      const finalLeft = Utils.clamp(left, 0, maxLeft);
      const finalTop = Utils.clamp(top, 0, maxTop);

      button.style.left = `${finalLeft}px`;
      button.style.top = `${finalTop}px`;
      button.style.right = "auto";

      Storage.setGuiPosition({ left: finalLeft, top: finalTop, right: null });
    },

    keepElementInViewport(element, fallbackPosition = {}) {
      if (!element) return;

      const rect = element.getBoundingClientRect();
      const maxLeft = Math.max(window.innerWidth - rect.width, 0);
      const maxTop = Math.max(window.innerHeight - rect.height, 0);

      const computed = window.getComputedStyle(element);
      const parsedLeft = Utils.toNumber(parseFloat(element.style.left), NaN);
      const parsedTop = Utils.toNumber(parseFloat(element.style.top), NaN);
      const parsedRight = Utils.toNumber(parseFloat(element.style.right), NaN);
      const computedLeft = Utils.toNumber(parseFloat(computed.left), NaN);
      const computedTop = Utils.toNumber(parseFloat(computed.top), NaN);

      let currentLeft = Number.isFinite(parsedLeft)
        ? parsedLeft
        : Number.isFinite(computedLeft)
        ? computedLeft
        : null;
      let currentTop = Number.isFinite(parsedTop)
        ? parsedTop
        : Number.isFinite(computedTop)
        ? computedTop
        : null;

      if (currentLeft === null && Number.isFinite(parsedRight)) {
        currentLeft = window.innerWidth - rect.width - parsedRight;
      }

      if (currentLeft === null && typeof fallbackPosition?.left === "number") {
        currentLeft = fallbackPosition.left;
      }

      if (currentLeft === null && typeof fallbackPosition?.right === "number") {
        currentLeft = window.innerWidth - rect.width - fallbackPosition.right;
      }

      if (currentTop === null && typeof fallbackPosition?.top === "number") {
        currentTop = fallbackPosition.top;
      }

      const safeLeft = Utils.clamp(
        Math.round(Utils.toNumber(currentLeft, 0)),
        0,
        maxLeft
      );
      const safeTop = Utils.clamp(
        Math.round(Utils.toNumber(currentTop, 0)),
        0,
        maxTop
      );

      element.style.left = `${safeLeft}px`;
      element.style.top = `${safeTop}px`;
      element.style.right = "auto";
    },

    getViewportSize() {
      const viewport = window.visualViewport;
      if (viewport && Number.isFinite(viewport.width) && Number.isFinite(viewport.height)) {
        return {
          width: Math.max(1, Math.round(viewport.width)),
          height: Math.max(1, Math.round(viewport.height)),
        };
      }

      return {
        width: Math.max(1, window.innerWidth || 1),
        height: Math.max(1, window.innerHeight || 1),
      };
    },

    keepElementRelativeOnResize(element, fallbackPosition, resizeMeta) {
      if (!element || !resizeMeta) return;

      const { previousWidth, previousHeight, width, height } = resizeMeta;
      if (
        !Number.isFinite(previousWidth) ||
        !Number.isFinite(previousHeight) ||
        previousWidth <= 0 ||
        previousHeight <= 0
      ) {
        Ui.keepElementInViewport(element, fallbackPosition);
        return;
      }

      Ui.keepElementInViewport(element, fallbackPosition);

      const rect = element.getBoundingClientRect();
      const currentLeft = Utils.toNumber(parseFloat(element.style.left), 0);
      const currentTop = Utils.toNumber(parseFloat(element.style.top), 0);

      const scaledLeft = (currentLeft / previousWidth) * width;
      const scaledTop = (currentTop / previousHeight) * height;

      const maxLeft = Math.max(width - rect.width, 0);
      const maxTop = Math.max(height - rect.height, 0);

      const safeLeft = Utils.clamp(Math.round(scaledLeft), 0, maxLeft);
      const safeTop = Utils.clamp(Math.round(scaledTop), 0, maxTop);

      element.style.left = `${safeLeft}px`;
      element.style.top = `${safeTop}px`;
      element.style.right = "auto";
    },

    ensureFloatingUiVisible(resizeMeta = null) {
      const button = document.getElementById("upgrader-launcher");
      if (button) {
        if (resizeMeta) {
          Ui.keepElementRelativeOnResize(
            button,
            Storage.getGuiPosition(),
            resizeMeta
          );
        } else {
          Ui.keepElementInViewport(button, Storage.getGuiPosition());
        }

        const buttonLeft = Utils.toNumber(parseFloat(button.style.left), NaN);
        const buttonTop = Utils.toNumber(parseFloat(button.style.top), NaN);
        if (Number.isFinite(buttonLeft) && Number.isFinite(buttonTop)) {
          Storage.setGuiPosition({
            left: Math.round(buttonLeft),
            top: Math.round(buttonTop),
            right: null,
          });
        }
      }
    },

    initViewportResizeHandler() {
      let resizeTimeout = null;

      const scheduleViewportCorrection = () => {
        if (resizeTimeout) {
          clearTimeout(resizeTimeout);
        }

        resizeTimeout = setTimeout(() => {
          const nextViewportSize = Ui.getViewportSize();
          const previousViewportSize = state.viewportSize || nextViewportSize;

          Ui.ensureFloatingUiVisible({
            previousWidth: previousViewportSize.width,
            previousHeight: previousViewportSize.height,
            width: nextViewportSize.width,
            height: nextViewportSize.height,
          });

          state.viewportSize = nextViewportSize;
        }, 80);
      };

      window.addEventListener("resize", () => {
        scheduleViewportCorrection();
      });

      window.addEventListener("orientationchange", () => {
        scheduleViewportCorrection();
      });

      const viewport = window.visualViewport;
      if (viewport) {
        viewport.addEventListener("resize", scheduleViewportCorrection);
        viewport.addEventListener("scroll", scheduleViewportCorrection);
      }
    },

    initButtonDrag() {
      const button = document.getElementById("upgrader-launcher");
      const handle = document.getElementById("upgrader-launcher-header");
      if (!button || !handle) return;

      handle.addEventListener("mousedown", (event) => {
        if (event.button !== 0) return;
        if (
          event.target?.closest?.(
            "#upgrader-launcher-config-btn, #upgrader-launcher-stock, #upgrader-launcher-resize"
          )
        ) {
          return;
        }

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

    // --- Skalowanie okna -----------------------------------------------------

    applyUiScale(value, options = {}) {
      const { persist = true, render = true, keepInViewport = true } = options;

      const raw = Utils.clamp(
        Utils.toNumber(value, CONFIG.DEFAULT_UI_SCALE),
        CONFIG.UI_SCALE_RANGE.min,
        CONFIG.UI_SCALE_RANGE.max
      );
      const scale = Math.round(raw * 100) / 100;

      state.uiScale = scale;

      const button = document.getElementById("upgrader-launcher");
      if (button) {
        button.style.setProperty("--ql-scale", String(scale));
      }

      if (persist) {
        Storage.setUiScale(scale);
      }

      if (render) {
        Ui.renderScaleSettings();
      }

      if (keepInViewport) {
        Ui.ensureFloatingUiVisible();
      }

      return scale;
    },

    renderScaleSettings() {
      const slider = document.getElementById("upgrader-ui-scale");
      const label = document.getElementById("upgrader-ui-scale-value");
      const percent = Math.round(state.uiScale * 100);

      if (slider && document.activeElement !== slider) {
        slider.value = String(percent);
      }

      if (label) {
        label.textContent = `${percent}%`;
      }
    },

    bindScaleHandlers() {
      const slider = document.getElementById("upgrader-ui-scale");
      const resetButton = document.getElementById("upgrader-ui-scale-reset");

      if (slider) {
        slider.addEventListener("input", () => {
          Ui.applyUiScale(Utils.toNumber(slider.value, 100) / 100, {
            persist: false,
            render: true,
            keepInViewport: false,
          });
        });

        slider.addEventListener("change", () => {
          Ui.applyUiScale(Utils.toNumber(slider.value, 100) / 100);
        });
      }

      if (resetButton) {
        resetButton.addEventListener("click", () => {
          Ui.applyUiScale(CONFIG.DEFAULT_UI_SCALE);
        });
      }
    },

    // Gestosc zmienia wylacznie odstepy, wysokosci i szerokosc panelu (zmienne
    // CSS). Rozmiary czcionek zostaja bez zmian - od zmniejszania wszystkiego
    // naraz jest osobny suwak skali.
    applyDensity(density, options = {}) {
      const { persist = true, render = true } = options;
      const normalized = density === "cozy" ? "cozy" : "compact";

      state.density = normalized;

      const button = document.getElementById("upgrader-launcher");
      if (button) {
        button.classList.toggle("is-cozy", normalized === "cozy");
      }

      if (persist) {
        Storage.setDensity(normalized);
      }

      if (render) {
        Ui.renderDensitySettings();
        // Szerokosc panelu sie zmienila - moze wystawac poza ekran.
        Ui.ensureFloatingUiVisible();
      }

      return normalized;
    },

    renderDensitySettings() {
      const toggle = document.getElementById("upgrader-compact-mode");
      if (!toggle) return;
      toggle.checked = state.density !== "cozy";
    },

    bindDensityHandlers() {
      const toggle = document.getElementById("upgrader-compact-mode");
      if (!toggle) return;

      toggle.addEventListener("change", () => {
        Ui.applyDensity(toggle.checked ? "compact" : "cozy");
      });
    },

    initScaleResize() {
      const button = document.getElementById("upgrader-launcher");
      const grip = document.getElementById("upgrader-launcher-resize");
      if (!button || !grip) return;

      grip.addEventListener("dblclick", (event) => {
        event.preventDefault();
        event.stopPropagation();
        Ui.applyUiScale(CONFIG.DEFAULT_UI_SCALE);
      });

      grip.addEventListener("mousedown", (event) => {
        if (event.button !== 0) return;

        event.preventDefault();
        event.stopPropagation();

        const startScale = state.uiScale || CONFIG.DEFAULT_UI_SCALE;
        const rect = button.getBoundingClientRect();

        // Rozmiar bazowy = rozmiar przed skalowaniem; dzieki temu przesuniecie
        // uchwytu o N pikseli zmienia szerokosc panelu mniej wiecej o N pikseli.
        const baseWidth = Math.max(1, rect.width / startScale);
        const baseHeight = Math.max(1, rect.height / startScale);

        const startX = event.clientX;
        const startY = event.clientY;

        button.classList.add("is-resizing");

        const onMouseMove = (moveEvent) => {
          const deltaX = moveEvent.clientX - startX;
          const deltaY = moveEvent.clientY - startY;
          const nextScale =
            startScale + (deltaX / baseWidth + deltaY / baseHeight) / 2;

          Ui.applyUiScale(nextScale, {
            persist: false,
            render: true,
            keepInViewport: false,
          });
        };

        const onMouseUp = () => {
          document.removeEventListener("mousemove", onMouseMove);
          document.removeEventListener("mouseup", onMouseUp);
          button.classList.remove("is-resizing");
          Ui.applyUiScale(state.uiScale);
        };

        document.addEventListener("mousemove", onMouseMove);
        document.addEventListener("mouseup", onMouseUp);
      });
    },

    getInterfaceWidgetHost() {
      const strictHost =
        document.querySelector(
          ".top-left.main-buttons-container.static-widget-position"
        ) ||
        document.querySelector(
          ".top-right.main-buttons-container.static-widget-position"
        ) ||
        document.querySelector(".top-left.main-buttons-container") ||
        document.querySelector(".top-right.main-buttons-container");
      if (strictHost) {
        return strictHost;
      }

      const existingWidget =
        document.querySelector(
          ".widget-button.widget-world-icon.widget-in-interface-bar"
        ) ||
        document.querySelector(
          ".widget-button.widget-vaddonz.widget-in-interface-bar"
        ) ||
        document.querySelector(
          ".widget-button.widget-in-interface-bar"
        );
      if (existingWidget?.parentElement) {
        return existingWidget.parentElement;
      }

      const hostSelectors = [
        ".interface-bar",
        ".widget-layer",
        ".interface-layer",
        ".left-interface",
      ];

      for (const selector of hostSelectors) {
        const host = document.querySelector(selector);
        if (host) return host;
      }

      return null;
    },

    bindInterfaceWidget(widgetButton) {
      if (!widgetButton) return;
      if (widgetButton.dataset.upgraderBound === "1") {
        Ui.initInterfaceWidgetDraggable(widgetButton);
        return;
      }

      widgetButton.dataset.upgraderBound = "1";

      widgetButton.addEventListener("click", (event) => {
        if (Ui.isInterfaceWidgetConfigMode(widgetButton)) {
          return;
        }

        event.preventDefault();
        Ui.toggleLauncherVisibility();
      });

      widgetButton.addEventListener("contextmenu", async (event) => {
        if (Ui.isInterfaceWidgetConfigMode(widgetButton)) {
          return;
        }

        event.preventDefault();
        Ui.toggleLauncherVisibility();
      });

      Ui.initInterfaceWidgetDraggable(widgetButton);
    },

    isInterfaceWidgetConfigMode(widgetButton) {
      if (!widgetButton) return false;

      if (widgetButton.classList.contains("ui-draggable-dragging")) {
        return true;
      }

      return !widgetButton.classList.contains("ui-draggable-disabled");
    },

    isGameInterfaceConfigModeActive() {
      return Boolean(
        document.querySelector(
          ".interface-config, .interface-configuration, .configuration-window, .ui-widget-config"
        )
      );
    },

    persistInterfaceWidgetPlacement(widgetButton) {
      const host = widgetButton?.parentElement;
      if (!host) return;

      const slotStep = Ui.getWidgetSlotStep();
      const leftValue = Utils.toNumber(parseFloat(widgetButton.style.left), 0);
      const slot = Math.max(0, Math.round(leftValue / slotStep));
      const top = Ui.getWidgetTopForHost(host);
      const widgetPos = host.classList.contains("top-right")
        ? "top-right"
        : "top-left";

      const { occupiedIndices } = Ui.getOccupiedWidgetSlots(host, widgetButton);
      const preferredIndex = Math.max(
        0,
        Math.floor(Utils.toNumber(widgetButton.getAttribute("widget-index"), slot))
      );
      const widgetIndex =
        !occupiedIndices.has(preferredIndex) && preferredIndex >= 0
          ? preferredIndex
          : Ui.getFirstFreeInteger(occupiedIndices, slot, 500);

      widgetButton.setAttribute("widget-pos", widgetPos);
      widgetButton.setAttribute("widget-index", String(widgetIndex));
      widgetButton.style.left = `${slot * slotStep}px`;
      widgetButton.style.top = `${top}px`;

      Storage.setWidgetSlot({
        widgetPos,
        slot,
        widgetIndex,
      });
    },

    syncInterfaceWidgetDragState(widgetButton) {
      const jq = window.jQuery || window.$;
      if (!jq || typeof jq.fn?.draggable !== "function") return;

      const $widget = jq(widgetButton);
      if (!$widget.data("ui-draggable")) return;

      const configModeEnabled = Ui.isGameInterfaceConfigModeActive();
      $widget.draggable("option", "disabled", !configModeEnabled);
      widgetButton.classList.toggle("ui-draggable-disabled", !configModeEnabled);
    },

    initInterfaceWidgetDraggable(widgetButton) {
      const jq = window.jQuery || window.$;
      if (!jq || typeof jq.fn?.draggable !== "function") return;

      const $widget = jq(widgetButton);
      if (!$widget.data("ui-draggable")) {
        $widget.draggable({
          containment: "parent",
          grid: [Ui.getWidgetSlotStep(), Ui.getWidgetSlotStep()],
          scroll: false,
          disabled: true,
          start() {
            widgetButton.classList.add("ui-draggable-dragging");
          },
          stop() {
            widgetButton.classList.remove("ui-draggable-dragging");
            Ui.persistInterfaceWidgetPlacement(widgetButton);
          },
        });
      }

      Ui.syncInterfaceWidgetDragState(widgetButton);

      if (!state.interfaceWidgetDragObserver) {
        // Debounce - gra mutuje DOM praktycznie bez przerwy.
        let scheduled = false;

        state.interfaceWidgetDragObserver = new MutationObserver(() => {
          if (scheduled) return;
          scheduled = true;

          setTimeout(() => {
            scheduled = false;
            const currentWidget = document.getElementById("upgrader-interface-widget");
            if (currentWidget) {
              Ui.syncInterfaceWidgetDragState(currentWidget);
            }
          }, 250);
        });
        state.interfaceWidgetDragObserver.observe(document.body, {
          childList: true,
          subtree: true,
          attributes: true,
          attributeFilter: ["class"],
        });
      }
    },

    extractUrlFromBackgroundImage(backgroundImageValue) {
      const match = String(backgroundImageValue || "").match(/url\(["']?(.*?)["']?\)/i);
      return match?.[1] || null;
    },

    parseBackgroundPosition(backgroundPositionValue) {
      const normalized = String(backgroundPositionValue || "").trim();
      if (!normalized) {
        return { x: 0, y: 0 };
      }

      const parts = normalized.split(/\s+/);
      const x = Utils.toNumber(parseFloat(parts[0]), 0);
      const y = Utils.toNumber(parseFloat(parts[1]), 0);

      return { x, y };
    },

    async setWidgetFaceIconFromOutfit() {
      const widgetIcon = document.querySelector(
        "#upgrader-interface-widget .icon.upgrader-widget-icon"
      );
      const outfitGraphic = document.querySelector(".outfit-wrapper .outfit-graphic");
      if (!widgetIcon || !outfitGraphic) return false;

      const computed = window.getComputedStyle(outfitGraphic);
      const backgroundImage =
        computed.backgroundImage || outfitGraphic.style.backgroundImage;
      const backgroundPosition =
        computed.backgroundPosition || outfitGraphic.style.backgroundPosition;

      const imageUrl = Ui.extractUrlFromBackgroundImage(backgroundImage);
      if (!imageUrl) return false;

      const { x, y } = Ui.parseBackgroundPosition(backgroundPosition);

      try {
        const dataUrl = await new Promise((resolve, reject) => {
          const image = new Image();
          image.crossOrigin = "anonymous";
          image.onload = () => {
            try {
              const canvas = document.createElement("canvas");
              canvas.width = 32;
              canvas.height = 32;
              const context = canvas.getContext("2d");
              if (!context) {
                reject(new Error("no-canvas-context"));
                return;
              }

              const sourceX = Math.max(0, Math.round(-x + 8));
              const sourceY = Math.max(0, Math.round(-y + 2));
              context.imageSmoothingEnabled = false;
              context.drawImage(image, sourceX, sourceY, 16, 16, 0, 0, 32, 32);
              resolve(canvas.toDataURL("image/png"));
            } catch (error) {
              reject(error);
            }
          };
          image.onerror = () => reject(new Error("outfit-image-load-failed"));
          image.src = imageUrl;
        });

        widgetIcon.textContent = "";
        widgetIcon.style.backgroundImage = `url(${dataUrl})`;
        widgetIcon.style.backgroundPosition = "calc(50% + 2px) 50%";
        widgetIcon.style.backgroundSize = "94% 94%";
        return true;
      } catch (error) {
        widgetIcon.textContent = "";
        widgetIcon.style.backgroundImage = backgroundImage;
        widgetIcon.style.backgroundPosition = "calc(50% + 10px) 50%";
        widgetIcon.style.backgroundSize = "94% 94%";
        return true;
      }
    },

    ensureWidgetIconFromOutfit() {
      let attempts = 0;

      const trySetIcon = async () => {
        attempts += 1;
        const applied = await Ui.setWidgetFaceIconFromOutfit();
        if (!applied && attempts < 25) {
          setTimeout(trySetIcon, 300);
        }
      };

      trySetIcon();
    },

    isInterfaceWidgetVisible(widgetButton) {
      if (!widgetButton) return false;

      const rect = widgetButton.getBoundingClientRect();
      if (!rect || rect.width < 20 || rect.height < 20) return false;

      const style = window.getComputedStyle(widgetButton);
      if (
        style.display === "none" ||
        style.visibility === "hidden" ||
        Utils.toNumber(parseFloat(style.opacity), 1) <= 0.05
      ) {
        return false;
      }

      return (
        rect.right > 0 &&
        rect.bottom > 0 &&
        rect.left < window.innerWidth &&
        rect.top < window.innerHeight
      );
    },

    syncLauncherVisibility() {
      const launcher = document.getElementById("upgrader-launcher");
      if (!launcher) return;

      launcher.style.display = state.launcherVisible ? "block" : "none";
    },

    toggleLauncherVisibility(forceVisible = null) {
      const launcher = document.getElementById("upgrader-launcher");
      if (!launcher) return;

      const nextVisible =
        typeof forceVisible === "boolean"
          ? forceVisible
          : launcher.style.display === "none";

      state.launcherVisible = nextVisible;
      Storage.setLauncherVisibility(nextVisible);
      Ui.syncLauncherVisibility();
    },

    mountInterfaceWidget() {
      const existingWidget = document.getElementById("upgrader-interface-widget");
      if (existingWidget) {
        Ui.bindInterfaceWidget(existingWidget);

        const existingHost = existingWidget.parentElement;
        if (existingHost) {
          const savedSlot = Storage.getWidgetSlot();
          const placement = Ui.resolveInterfaceWidgetPlacement(
            existingHost,
            savedSlot,
            existingWidget
          );

          existingWidget.setAttribute("widget-pos", placement.widgetPos);
          existingWidget.setAttribute("widget-index", String(placement.widgetIndex));
          existingWidget.style.left = `${placement.left}px`;
          existingWidget.style.top = `${placement.top}px`;
          Storage.setWidgetSlot(placement);
        }

        state.hasInterfaceWidget = true;
        Ui.syncLauncherVisibility();
        return true;
      }

      const host = Ui.getInterfaceWidgetHost();
      if (!host) {
        state.hasInterfaceWidget = false;
        Ui.syncLauncherVisibility();
        return false;
      }

      const savedSlot = Storage.getWidgetSlot();
      const placement = Ui.resolveInterfaceWidgetPlacement(host, savedSlot, null);

      const widgetButton = document.createElement("div");
      widgetButton.id = "upgrader-interface-widget";
      widgetButton.className =
        "widget-button green widget-in-interface-bar widget-upgrader-addon widget-quickforge ui-draggable ui-draggable-handle ui-draggable-disabled";
      widgetButton.setAttribute("widget-name", "upgrader-addon");
      widgetButton.setAttribute("widget-pos", placement.widgetPos);
      widgetButton.setAttribute("widget-index", String(placement.widgetIndex));
      widgetButton.title = "QuickForge (LPM: panel, PPM: akcja)";
      widgetButton.style.width = "44px";
      widgetButton.style.height = "44px";
      widgetButton.style.position = "absolute";
      widgetButton.style.left = `${placement.left}px`;
      widgetButton.style.top = `${placement.top}px`;

      widgetButton.innerHTML = `
        <div class="icon upgrader-widget-icon"></div>
        <div class="red-notification interface-element-red-notification" style="display: none;"></div>
        <div class="amount"></div>
      `;

      host.appendChild(widgetButton);
      Ui.bindInterfaceWidget(widgetButton);
      Storage.setWidgetSlot(placement);

      state.hasInterfaceWidget = true;
      Ui.syncLauncherVisibility();
      return true;
    },

    getWidgetSlotStep() {
      return 44;
    },

    getWidgetTopForHost(host) {
      const siblings = [
        ...host.querySelectorAll(".widget-button.widget-in-interface-bar"),
      ];

      for (const sibling of siblings) {
        const siblingTop = Utils.toNumber(parseFloat(sibling.style.top), NaN);
        if (Number.isFinite(siblingTop)) {
          return Math.round(siblingTop);
        }
      }

      return 0;
    },

    getOccupiedWidgetSlots(host, ignoredNode = null) {
      const slotStep = Ui.getWidgetSlotStep();
      const occupiedSlots = new Set();
      const occupiedIndices = new Set();

      const widgets = [
        ...host.querySelectorAll(".widget-button.widget-in-interface-bar"),
      ].filter((node) => node !== ignoredNode);

      widgets.forEach((node) => {
        const leftValue = Utils.toNumber(parseFloat(node.style.left), NaN);
        if (Number.isFinite(leftValue) && leftValue >= 0) {
          occupiedSlots.add(Math.round(leftValue / slotStep));
        }

        const widgetIndex = Utils.toNumber(node.getAttribute("widget-index"), NaN);
        if (Number.isFinite(widgetIndex) && widgetIndex >= 0) {
          occupiedIndices.add(Math.floor(widgetIndex));
        }
      });

      return { occupiedSlots, occupiedIndices };
    },

    getFirstFreeInteger(occupiedSet, startAt = 0, maxScan = 300) {
      const safeStart = Math.max(0, Math.floor(Utils.toNumber(startAt, 0)));

      for (let value = safeStart; value <= maxScan; value += 1) {
        if (!occupiedSet.has(value)) {
          return value;
        }
      }

      return maxScan + 1;
    },

    resolveInterfaceWidgetPlacement(host, savedSlot = null, ignoredNode = null) {
      const widgetPos = host.classList.contains("top-right")
        ? "top-right"
        : "top-left";
      const slotStep = Ui.getWidgetSlotStep();
      const top = Ui.getWidgetTopForHost(host);
      const { occupiedSlots, occupiedIndices } = Ui.getOccupiedWidgetSlots(
        host,
        ignoredNode
      );

      const savedForThisSide =
        savedSlot && savedSlot.widgetPos === widgetPos ? savedSlot : null;

      const preferredSlot = Number.isFinite(savedForThisSide?.slot)
        ? Math.max(0, Math.floor(savedForThisSide.slot))
        : null;
      const preferredIndex = Number.isFinite(savedForThisSide?.widgetIndex)
        ? Math.max(0, Math.floor(savedForThisSide.widgetIndex))
        : null;

      const slot =
        preferredSlot !== null && !occupiedSlots.has(preferredSlot)
          ? preferredSlot
          : Ui.getFirstFreeInteger(occupiedSlots, 0, 300);

      const widgetIndex =
        preferredIndex !== null && !occupiedIndices.has(preferredIndex)
          ? preferredIndex
          : Ui.getFirstFreeInteger(occupiedIndices, slot, 500);

      return {
        widgetPos,
        slot,
        widgetIndex,
        left: slot * slotStep,
        top,
      };
    },

    ensureInterfaceWidgetMounted() {
      let attempts = 0;
      const tryMount = () => {
        attempts += 1;
        const mounted = Ui.mountInterfaceWidget();
        if (!mounted && attempts < 120) {
          setTimeout(tryMount, 400);
        }
      };

      tryMount();

      // Gra mutuje DOM bardzo czesto - bez debounce ten callback odpalal sie
      // setki razy na sekunde.
      let scheduled = false;
      const observer = new MutationObserver(() => {
        if (scheduled) return;
        scheduled = true;

        setTimeout(() => {
          scheduled = false;
          if (!document.getElementById("upgrader-interface-widget")) {
            Ui.mountInterfaceWidget();
          }
        }, 400);
      });

      observer.observe(document.body, {
        childList: true,
        subtree: true,
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
        await Automation.runPrimaryAction();
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
          return;
        }

        Storage.setAllowedRarities(selectedRarities);
      });
    },

    getOrCreateAddonLikeTooltip() {
      let tooltip = document.getElementById("upgrader-vaddonz-tooltip");
      if (tooltip) {
        return tooltip;
      }

      tooltip = document.createElement("div");
      tooltip.id = "upgrader-vaddonz-tooltip";
      tooltip.className = "vaddonz-tooltip-widget-vaddonz";
      tooltip.style.display = "none";
      tooltip.innerHTML = '<div class="content"><p></p></div>';
      document.body.appendChild(tooltip);

      return tooltip;
    },

    showAddonLikeTooltip(triggerNode) {
      if (!triggerNode) return;

      const text = String(
        triggerNode.getAttribute("data-tooltip") || ""
      ).trim();
      if (!text) return;

      const tooltip = Ui.getOrCreateAddonLikeTooltip();
      const paragraph = tooltip.querySelector(".content p");
      if (paragraph) {
        paragraph.textContent = text;
      }

      tooltip.style.display = "block";

      const rect = triggerNode.getBoundingClientRect();
      const viewportPadding = 8;
      let left = Math.round(rect.left + window.scrollX);
      let top = Math.round(rect.top + window.scrollY - tooltip.offsetHeight - 8);

      if (left + tooltip.offsetWidth > window.scrollX + window.innerWidth - viewportPadding) {
        left = Math.round(window.scrollX + window.innerWidth - tooltip.offsetWidth - viewportPadding);
      }

      if (left < window.scrollX + viewportPadding) {
        left = Math.round(window.scrollX + viewportPadding);
      }

      if (top < window.scrollY + viewportPadding) {
        top = Math.round(rect.bottom + window.scrollY + 8);
      }

      tooltip.style.left = `${left}px`;
      tooltip.style.top = `${top}px`;
    },

    hideAddonLikeTooltip() {
      const tooltip = document.getElementById("upgrader-vaddonz-tooltip");
      if (!tooltip) return;
      tooltip.style.display = "none";
    },

    bindTooltipHandlers() {
      // Atrybut musi sie zgadzac z tym w HTML (data-tooltip) - wczesniej selektor
      // szukal data-upgrader-tooltip i nie trafial w nic.
      const triggers = document.querySelectorAll(
        ".upgrader-tooltip-trigger[data-tooltip]"
      );

      triggers.forEach((triggerNode) => {
        if (triggerNode.dataset.upgraderTooltipBound === "1") {
          return;
        }

        triggerNode.dataset.upgraderTooltipBound = "1";

        triggerNode.addEventListener("mouseenter", () => {
          Ui.showAddonLikeTooltip(triggerNode);
        });

        triggerNode.addEventListener("mouseleave", () => {
          Ui.hideAddonLikeTooltip();
        });
      });
    },

    // Budowane z wezlow DOM, nie z innerHTML - nazwa przedmiotu pochodzi z serwera
    // i cudzyslow albo "<" w niej rozwalal szablon (a w gorszym razie wstrzykiwal znacznik).
    showEnhancementCompletionNotification(data) {
      const notificationId = "upgrader-enhancement-notification";
      let notification = document.getElementById(notificationId);

      if (state.enhancementNotificationTimer) {
        clearTimeout(state.enhancementNotificationTimer);
        state.enhancementNotificationTimer = null;
      }

      if (!notification) {
        notification = document.createElement("div");
        notification.id = notificationId;
        notification.className = "upgrader-notification";
        document.body.appendChild(notification);
      }

      notification.classList.remove("is-visible", "is-leaving");
      notification.replaceChildren();

      const addLine = (className, text) => {
        const node = document.createElement("div");
        node.className = className;
        node.textContent = text;
        notification.appendChild(node);
        return node;
      };

      addLine("upgrader-notification-kicker", "\u2728 Ulepszono");

      if (data.itemId) {
        const sourceNode = document.querySelector(`.item-id-${data.itemId}`);
        const sourceCanvas = sourceNode?.querySelector("canvas.icon.canvas-icon");

        if (sourceCanvas) {
          try {
            const iconWrap = document.createElement("div");
            iconWrap.className = "upgrader-notification-icon";

            const icon = document.createElement("img");
            icon.src = sourceCanvas.toDataURL("image/png");
            icon.alt = String(data.itemName || "Przedmiot");

            iconWrap.appendChild(icon);
            notification.appendChild(iconWrap);
          } catch (error) {
            // Canvas moze byc "tainted" - wtedy po prostu pomijamy ikone.
          }
        }
      }

      addLine("upgrader-notification-name", String(data.itemName || "Przedmiot"));
      addLine("upgrader-notification-level", String(data.level));
      addLine("upgrader-notification-counter", `Limit: ${data.counter}`);
      addLine("upgrader-notification-points", `+${data.points}`);
      addLine("upgrader-notification-footer", "punktów ulepszenia");

      requestAnimationFrame(() => {
        notification.classList.add("is-visible");
      });

      state.enhancementNotificationTimer = setTimeout(() => {
        notification.classList.remove("is-visible");
        notification.classList.add("is-leaving");
        state.enhancementNotificationTimer = null;
      }, 3500);
    },

    toggleGui() {
      const widget = document.getElementById("upgrader-launcher");
      if (!widget) return;

      const rect = widget.getBoundingClientRect();
      widget.style.left = `${Math.round(rect.left)}px`;
      widget.style.right = "auto";

      state.guiVisible = !state.guiVisible;
      widget.classList.toggle("is-expanded", state.guiVisible);

      const gear = document.getElementById("upgrader-launcher-config-btn");
      if (gear) {
        const label = state.guiVisible ? "Zwiń ustawienia" : "Rozwiń ustawienia";
        gear.setAttribute("aria-label", label);
        gear.title = label;
      }

      if (state.guiVisible) {
        Ui.renderModeDependentTexts();
        Ui.renderSelectedItemPreview();
        Ui.renderRarityOptions();
        Ui.renderBoundSettings();
        Ui.renderHotkeyInputs();
        Ui.renderAutoSettings();
        Ui.renderScaleSettings();
        Ui.renderDensitySettings();
        Ui.refreshEnhanceCounter();
      }
    },

    createGui() {
      if (document.getElementById("upgrader-launcher")) return;

      const button = document.createElement("div");
      button.id = "upgrader-launcher";
      button.className = "upgrader-launcher";
      button.innerHTML = `
        <div id="upgrader-launcher-header" class="upgrader-launcher-header">
          <button id="upgrader-launcher-config-btn" class="upgrader-launcher-gear" type="button" aria-label="Ustawienia" title="Ustawienia dodatku">
            <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M12 15.5a3.5 3.5 0 100-7 3.5 3.5 0 000 7z" stroke="currentColor" stroke-width="1.6"/>
              <path d="M19.4 13a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 11-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V19a2 2 0 11-4 0v-.09a1.65 1.65 0 00-1-1.51 1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 11-2.83-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H4a2 2 0 110-4h.09a1.65 1.65 0 001.51-1 1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 112.83-2.83l.06.06a1.65 1.65 0 001.82.33H10a1.65 1.65 0 001-1.51V4a2 2 0 114 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 112.83 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V10a1.65 1.65 0 001.51 1H20a2 2 0 110 4h-.09a1.65 1.65 0 00-1.51 1z" stroke="currentColor" stroke-width="1.6"/>
            </svg>
          </button>
          <div id="upgrader-launcher-title" class="upgrader-launcher-title">Quick Forge</div>
          <div id="upgrader-launcher-stock" class="upgrader-launcher-stock" title="Składniki możliwe do wrzucenia teraz">0</div>
        </div>

        <div class="upgrader-launcher-main">
          <div id="upgrader-launcher-item-box" class="upgrader-launcher-item-box"></div>
          <div class="upgrader-launcher-meters">
            <div class="upgrader-launcher-progress-track">
              <div id="upgrader-launcher-progress-fill" class="upgrader-launcher-progress-fill" style="width:0%"></div>
              <div id="upgrader-launcher-progress-label" class="upgrader-launcher-progress-label">-- / --</div>
            </div>
            <div id="upgrader-launcher-counter" class="upgrader-launcher-counter">LIMIT: --/--</div>
          </div>
        </div>

        <button id="upgrader-launcher-enhance-btn" class="upgrader-launcher-main-btn">ULEPSZ</button>

        <div id="upgrader-settings-body" class="upgrader-settings-body">
          <div class="upgrader-grid-2">
            <div class="upgrader-card">
              <div class="upgrader-card-title">Auto</div>
              <label class="upgrader-row" for="upgrader-auto-enabled">
                <span id="upgrader-auto-label">Auto ulepszanie</span>
                <input id="upgrader-auto-enabled" type="checkbox" />
              </label>
              <div class="upgrader-row">
                <span>Próg slotów</span>
                <span id="upgrader-auto-min-free-slots-value" class="upgrader-row-value">6</span>
              </div>
              <input
                id="upgrader-auto-min-free-slots"
                class="upgrader-slider"
                type="range"
                min="${CONFIG.AUTO_MIN_FREE_SLOTS_RANGE.min}"
                max="${CONFIG.AUTO_MIN_FREE_SLOTS_RANGE.max}"
                value="${CONFIG.DEFAULT_AUTO_SETTINGS.minFreeSlots}"
              />
              <div id="upgrader-auto-free-slots-info" class="upgrader-note"></div>
            </div>

            <div class="upgrader-card">
              <div class="upgrader-card-title">Związane</div>
              <label class="upgrader-row" for="upgrader-allow-soulbound">
                <span>Z właścicielem</span>
                <input id="upgrader-allow-soulbound" type="checkbox" />
              </label>
              <label class="upgrader-row" for="upgrader-allow-permbound">
                <span>Na stałe</span>
                <input id="upgrader-allow-permbound" type="checkbox" />
              </label>
              <div class="upgrader-note upgrader-note--warn">
                <span>Może spalić przedmioty</span>
                <span class="upgrader-tooltip-trigger" data-tooltip="Ta reguła nie działa na heroiki oraz na przedmioty ulepszone">?</span>
              </div>
            </div>

            <div class="upgrader-card upgrader-card--wide">
              <div class="upgrader-card-title">Składniki</div>
              <div id="upgrader-rarity-list" class="upgrader-chips"></div>
            </div>

            <div class="upgrader-card">
              <div class="upgrader-card-title">Skróty</div>
              <div class="upgrader-hotkeys-grid">
                <span class="upgrader-hotkeys-label">Ulepszanie</span>
                <input id="upgrader-hotkey-enhance" maxlength="1" class="upgrader-hotkeys-input" />
                <span class="upgrader-hotkeys-label">Panel (SHIFT+)</span>
                <input id="upgrader-hotkey-gui" maxlength="1" class="upgrader-hotkeys-input" />
              </div>
            </div>

            <div class="upgrader-card">
              <div class="upgrader-card-title">Widok</div>
              <label class="upgrader-row" for="upgrader-compact-mode" title="Gęstsze odstępy i mniejszy panel. Rozmiar czcionki bez zmian.">
                <span>Kompaktowy układ</span>
                <input id="upgrader-compact-mode" type="checkbox" />
              </label>
              <div class="upgrader-row">
                <span>Skala <span id="upgrader-ui-scale-value" class="upgrader-row-value">100%</span></span>
                <button id="upgrader-ui-scale-reset" class="upgrader-mini-btn" type="button" title="Przywróć 100%">Reset</button>
              </div>
              <input
                id="upgrader-ui-scale"
                class="upgrader-slider"
                type="range"
                min="${Math.round(CONFIG.UI_SCALE_RANGE.min * 100)}"
                max="${Math.round(CONFIG.UI_SCALE_RANGE.max * 100)}"
                step="5"
                value="100"
              />
            </div>
          </div>

          <div id="upgrader-select-hint" class="upgrader-note"></div>

          <div class="upgrader-gui-row">
            <button id="upgrader-clear-btn" class="upgrader-gui-btn">Wyczyść</button>
            <button id="upgrader-reset-points-btn" class="upgrader-gui-btn">Reset pkt</button>
            <button id="upgrader-hotkey-save-btn" class="upgrader-gui-btn">Zapisz</button>
          </div>
        </div>

        <div id="upgrader-launcher-resize" class="upgrader-launcher-resize" title="Przeciągnij, aby zmienić skalę (dwuklik przywraca 100%)"></div>
      `;

      document.body.appendChild(button);

      Ui.applyDensity(state.density, { persist: false, render: false });
      Ui.applyUiScale(state.uiScale, {
        persist: false,
        render: false,
        keepInViewport: false,
      });
      Ui.applyButtonPosition();
      Ui.ensureFloatingUiVisible();
      state.viewportSize = Ui.getViewportSize();
      Ui.initViewportResizeHandler();
      Ui.initButtonDrag();
      Ui.initScaleResize();
      Ui.bindLauncherButtons();
      Ui.ensureInterfaceWidgetMounted();
      Ui.syncLauncherVisibility();
      Ui.bindAutoSettingsHandlers();
      Ui.bindBoundSettingsHandlers();
      Ui.bindRarityAutoSaveHandlers();
      Ui.bindScaleHandlers();
      Ui.bindDensityHandlers();
      Ui.bindTooltipHandlers();

      document
        .getElementById("upgrader-clear-btn")
        .addEventListener("click", () => {
          Ui.clearUpgradedItem();
        });

      document
        .getElementById("upgrader-reset-points-btn")
        .addEventListener("click", () => {
          state.dailyEnhancePoints = Storage.setDailyEnhancePoints(0);
          Ui.refreshDailyEnhancePoints();
          Ui.refreshEnhanceCounter();
          message("Wyzerowano licznik punktów dziennych.");
        });

      document
        .getElementById("upgrader-hotkey-save-btn")
        .addEventListener("click", () => {
          const nextHotkeys = Ui.getHotkeysFromGui();
          const savedHotkeys = Storage.setHotkeys(nextHotkeys);
          state.hotkeys = savedHotkeys;
          Ui.renderHotkeyInputs();
          Ui.renderModeDependentTexts();
        });

      Ui.renderSelectedItemPreview();
      Ui.renderModeDependentTexts();
      Ui.renderRarityOptions();
      Ui.renderBoundSettings();
      Ui.renderAutoSettings();
      Ui.renderScaleSettings();
      Ui.renderDensitySettings();
      Ui.refreshEnhanceCounter();
      Ui.refreshDailyEnhancePoints();
      Ui.refreshEnhanceProgress();
      Ui.refreshReagentStock();
    },

    initItemContextMenu() {
      // Bez tego podwojne wstrzykniecie skryptu opakowywaloby showPopupMenu dwa
      // razy i pozycja w menu dublowalaby sie.
      if (state.popupMenuHooked) return;
      if (typeof Engine?.interface?.showPopupMenu !== "function") return;

      const ogShowPopupMenu = Engine.interface.showPopupMenu;
      if (ogShowPopupMenu.__upgraderPopupMenuHooked) {
        state.popupMenuHooked = true;
        return;
      }

      const hooked = function (menu, e) {
        const itemId = Utils.getItemIdFromClassName(e?.currentTarget?.className);

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
                  Ui.refreshEnhanceProgress();
                },
                { button: { cls: "menu-item--red" } },
              ]
            : [
                "Ulepsz ten przedmiot",
                () => {
                  Storage.setUpgradedItemId(itemId);
                  Ui.markItemAsUpgraded(currentSelectedItemId);
                  Ui.renderSelectedItemPreview();
                  Automation.queueProgressPeek();
                },
                { button: { cls: "menu-item--yellow" } },
              ];

        ogShowPopupMenu.call(this, [menuItem, ...menu], e);
      };

      hooked.__upgraderPopupMenuHooked = true;
      Engine.interface.showPopupMenu = hooked;
      state.popupMenuHooked = true;
    },
  };

  const Automation = {
    async runPrimaryAction(options = {}) {
      return Automation.enhanceSelectedItem(options);
    },

    queueProgressPeek() {
      if (state.progressPeekTimer) {
        clearTimeout(state.progressPeekTimer);
      }

      state.progressPeekTimer = setTimeout(() => {
        state.progressPeekTimer = null;
        Automation.peekEnhanceProgress();
      }, 300);
    },

    async peekEnhanceProgress() {
      if (state.isEnhancing) return;

      const itemId = Storage.getUpgradedItemId();
      if (!itemId) {
        Ui.refreshEnhanceProgress();
        return;
      }

      const item = Engine.items.getItemById(itemId);
      if (!item) return;

      state.isEnhancing = true;
      let session = null;

      try {
        session = Ui.prepareEnhancementWindow();
        await EnhancementApi.setEnhancedItem(itemId);
        Ui.refreshEnhanceProgress();
      } catch (error) {
        // Cichy podgląd — brak reagowania na błędy, spróbujemy przy kolejnym odświeżeniu.
      } finally {
        if (session) {
          Ui.restoreEnhancementWindow(session);
        }
        state.isEnhancing = false;
      }
    },

    async enhanceSelectedItem(options = {}) {
      const { silent = false } = options;

      const result = {
        status: "idle",
        reachedLimit: false,
        reachedMaxEnhancement: false,
        itemName: null,
      };

      if (state.isEnhancing) {
        result.status = "busy";
        return result;
      }

      // Jedno try/finally na cala funkcje. Wczesniej getReagents() lezalo poza
      // blokiem i dowolny wyjatek zostawial isEnhancing na true na stale, co po
      // cichu zabijalo dodatek az do przeladowania strony.
      state.isEnhancing = true;
      let enhancementSession = null;

      try {
        const upgradedItemId = Storage.getUpgradedItemId();
        const upgradedItem = upgradedItemId
          ? Engine.items.getItemById(upgradedItemId)
          : null;
        result.itemName = upgradedItem?.name || null;

        if (!upgradedItem) {
          result.status = "missing-item";
          if (!silent) {
            message("Wybierz przedmiot do ulepszenia.");
          }
          return result;
        }

        const reagents = Inventory.getReagents();
        if (reagents.length === 0) {
          result.status = "missing-reagents";
          if (!silent) {
            message("Nie znaleziono odpowiednich składników.");
          }
          return result;
        }

        const stopAsMaxed = () => {
          result.reachedMaxEnhancement = true;
          result.status = "max-enhancement-reached";
          if (!silent) {
            const name = upgradedItem?.name ? ` ${upgradedItem.name}` : "";
            message(
              `Przedmiot${name} został maksymalnie ulepszony. Dalsze ulepszanie zostało zatrzymane.`
            );
          }
          return result;
        };

        result.status = "running";
        state.enhancementRunSummary = {
          itemId: upgradedItemId,
          itemName: upgradedItem?.name || null,
          totalPoints: 0,
          upgradeLevel: null,
        };

        enhancementSession = Ui.prepareEnhancementWindow();

        const chunks = Utils.chunk(reagents, CONFIG.MAX_REAGENTS);
        const statusResponse = await EnhancementApi.setEnhancedItem(upgradedItemId);

        if (Utils.hasMaxEnhancementState(statusResponse)) {
          return stopAsMaxed();
        }

        let counterSnapshot = Utils.getEnhanceCounterSnapshot();
        let remainingToLimit = null;

        if (counterSnapshot) {
          remainingToLimit = Math.max(
            0,
            counterSnapshot.limit - counterSnapshot.current
          );

          if (remainingToLimit <= 0) {
            result.reachedLimit = true;
            result.status = "limit-reached";
            if (!silent) {
              message("Już wbiłeś limit na dzisiaj.");
            }
            return result;
          }
        }

        for (const chunk of chunks) {
          if (remainingToLimit !== null && remainingToLimit <= 0) break;

          const maxAllowedInChunk =
            remainingToLimit === null
              ? chunk.length
              : Math.min(chunk.length, remainingToLimit);

          if (maxAllowedInChunk <= 0) break;

          const reagentsToUse =
            maxAllowedInChunk === chunk.length
              ? chunk
              : chunk.slice(0, maxAllowedInChunk);

          const reagentsPreviewResponse = await EnhancementApi.setReagents(
            upgradedItemId,
            reagentsToUse
          );

          if (Utils.hasMaxEnhancementState(reagentsPreviewResponse)) {
            return stopAsMaxed();
          }

          // Gra dopiero teraz przerysuje podglad punktow. Czekamy na klatke i
          // zapisujemy odczyt, zeby hook na _g nie zlapal wartosci z poprzedniej
          // partii (to byl wyscig gubiacy punkty dzienne).
          await Utils.nextFrame();
          state.pendingPreviewPoints = Utils.getEnhancePreviewPoints();

          const enhanceItemResponse = await EnhancementApi.enhanceItem(
            upgradedItemId,
            reagentsToUse
          );

          state.pendingPreviewPoints = null;

          if (Utils.hasMaxEnhancementState(enhanceItemResponse)) {
            return stopAsMaxed();
          }

          const usagesPreview = enhanceItemResponse?.enhancement?.usages_preview;
          const parsedCount = Utils.toNumber(usagesPreview?.count, NaN);
          const parsedLimit = Utils.toNumber(usagesPreview?.limit, NaN);

          if (Number.isFinite(parsedCount) && Number.isFinite(parsedLimit)) {
            remainingToLimit = Math.max(0, parsedLimit - parsedCount);
            counterSnapshot = {
              current: parsedCount,
              limit: parsedLimit,
              text: `${parsedCount}/${parsedLimit}`,
            };
            state.enhanceCounter = counterSnapshot.text;
            Storage.setEnhanceCounter(counterSnapshot.text);

            if (remainingToLimit <= 0) {
              result.reachedLimit = true;
              result.status = "limit-reached";
            }
          } else if (remainingToLimit !== null) {
            remainingToLimit = Math.max(
              0,
              remainingToLimit - reagentsToUse.length
            );
          }

          // Brak odpowiedzi to najczesciej blad sieci albo serwera - nie ma sensu
          // wysylac kolejnych partii skladnikow w ciemno.
          if (!enhanceItemResponse) {
            result.status = "api-error";
            if (!silent) {
              message("Serwer nie odpowiedział na żądanie ulepszenia.");
            }
            break;
          }

          await Utils.sleep(300);
        }

        if (result.status === "running") {
          result.status = "done";
        }

        const runSummary = state.enhancementRunSummary;
        if (!silent && runSummary && runSummary.totalPoints > 0) {
          const levelValue = Utils.toNumber(runSummary.upgradeLevel, NaN);
          const levelText = Number.isFinite(levelValue) ? `+${levelValue}` : "+?";

          const finalCounter = Utils.getEnhanceCounterSnapshot();
          const counterText = finalCounter
            ? `${finalCounter.current}/${finalCounter.limit}`
            : "--/--";

          Ui.showEnhancementCompletionNotification({
            itemId: runSummary.itemId,
            itemName: runSummary.itemName || "Przedmiot",
            level: levelText,
            counter: counterText,
            points: Utils.formatPoints(runSummary.totalPoints),
          });
        }

        return result;
      } finally {
        state.pendingPreviewPoints = null;
        state.enhancementRunSummary = null;
        Ui.restoreEnhancementWindow(enhancementSession);
        Inventory.invalidateBindStateCache();
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
      const enhanceResult = await Automation.runPrimaryAction({ silent: false });

      if (enhanceResult?.reachedLimit || enhanceResult?.reachedMaxEnhancement) {
        state.autoSettings = Storage.setAutoSettings({
          ...state.autoSettings,
          enabled: false,
        });

        const autoModeLabelCapitalized = "Auto ulepszanie";
        const limitLabel = "ulepszeń";

        const targetItemLabel = enhanceResult.itemName
          ? ` dla ${enhanceResult.itemName}`
          : "";

        if (enhanceResult?.reachedMaxEnhancement) {
          message(
            `${autoModeLabelCapitalized} wyłączone: przedmiot${targetItemLabel} jest już maksymalnie ulepszony.`
          );
        } else {
          message(`${autoModeLabelCapitalized} wyłączone: osiągnięto limit ${limitLabel}${targetItemLabel}.`);
        }
      }

      Ui.renderAutoSettings();
    },

    startAutoEnhanceLoop() {
      setInterval(() => {
        Automation.checkAutoEnhance();
      }, 1200);
    },

    startEnhanceCounterSyncLoop() {
      let tick = 0;

      setInterval(() => {
        tick += 1;

        Ui.refreshEnhanceCounter();
        Ui.refreshDailyEnhancePoints();
        Ui.refreshEnhanceProgress();

        // Skan calego plecaka jest drogi - wystarczy co ~4 s.
        if (tick % 2 === 0) {
          Ui.refreshReagentStock();
        }
      }, 2000);
    },

    // Sprzatanie przeterminowanych kluczy trzymamy z dala od getterow, zeby
    // odczyt licznika nie pisal do localStorage kilkadziesiat razy na minute.
    startMaintenanceLoop() {
      setInterval(() => {
        try {
          Storage.cleanupStaleEntries();
        } catch (error) {
          // Brak dostepu do localStorage - nic nie mozemy zrobic.
        }
      }, 60000);
    },

    isTypingTarget(element) {
      if (!element) return false;
      if (element.isContentEditable) return true;

      const tagName = String(element.tagName || "").toUpperCase();
      return ["TEXTAREA", "MAGIC_INPUT", "INPUT", "SELECT"].includes(tagName);
    },

    bindHotkey() {
      window.document.addEventListener("keydown", async (event) => {
        // Bez tego Ctrl+J / Alt+J (i inne skroty przegladarki) odpalaly ulepszanie.
        if (event.ctrlKey || event.altKey || event.metaKey) return;
        if (event.isComposing || event.repeat) return;
        if (Automation.isTypingTarget(document.activeElement)) return;

        const key = String(event.key || "").toLowerCase();
        if (!key || key.length !== 1) return;

        const hotkeys = state.hotkeys || CONFIG.DEFAULT_HOTKEYS;

        if (event.shiftKey) {
          if (key === hotkeys.gui) {
            event.preventDefault();
            Ui.toggleGui();
          }
          return;
        }

        if (key === hotkeys.enhance) {
          event.preventDefault();
          await Automation.runPrimaryAction();
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
      if (window._g[hookFlag]) {
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

        // Wartosc zapisana przez petle ulepszania jest pewniejsza niz swiezy odczyt
        // z DOM - ten drugi bywa jeszcze nieprzerysowany w momencie wyslania zadania.
        const previewPoints = isEnhancementProgressRequest
          ? Number.isFinite(state.pendingPreviewPoints)
            ? state.pendingPreviewPoints
            : Utils.getEnhancePreviewPoints()
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

                if (state.enhancementRunSummary) {
                  state.enhancementRunSummary.totalPoints += previewPoints;
                  state.enhancementRunSummary.upgradeLevel = progressLevel;
                }

                if (!state.isEnhancing) {
                  message(
                    `Dodano +${Utils.formatPoints(previewPoints)} pkt ulepszenia.`
                  );
                }
              }
            } catch (error) {
              // Ksiegowanie punktow nie moze wywrocic wlasciwego callbacku gry.
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
    attempts: 0,

    init() {
      let engineReady = false;
      try {
        engineReady = Boolean(window.Engine && window.Engine.allInit);
      } catch (error) {
        engineReady = false;
      }

      if (!engineReady) {
        Bootstrap.attempts += 1;

        // Wczesniej ta petla probowala w nieskonczonosc.
        if (Bootstrap.attempts > CONFIG.BOOTSTRAP_MAX_ATTEMPTS) {
          console.warn(
            "[ulepszator] Engine gry nie wystartował - dodatek nie został uruchomiony."
          );
          return;
        }

        setTimeout(Bootstrap.init, 500);
        return;
      }

      try {
        Storage.cleanupStaleEntries();
      } catch (error) {
        // Brak dostepu do localStorage nie moze blokowac startu dodatku.
      }

      state.hotkeys = Storage.getHotkeys();
      state.autoSettings = Storage.getAutoSettings();
      state.boundSettings = Storage.getBoundSettings();
      state.enhanceCounter = Storage.getEnhanceCounter();
      state.dailyEnhancePoints = Storage.getDailyEnhancePoints();
      state.launcherVisible = Storage.getLauncherVisibility();
      state.uiScale = Storage.getUiScale();
      state.density = Storage.getDensity();

      Runtime.initEnhancementProgressHook();
      Ui.setupCss();
      Ui.createGui();
      Automation.bindHotkey();
      Automation.startAutoEnhanceLoop();
      Automation.startEnhanceCounterSyncLoop();
      Automation.startMaintenanceLoop();
      Ui.initItemContextMenu();
      Ui.markItemAsUpgraded();
      Ui.initUpgradedLabelWatcher();
    },
  };

  Bootstrap.init();
})();
