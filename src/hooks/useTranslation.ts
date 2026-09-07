import { useState, useCallback } from "react";

/**
 * On-device translation via the browser's built-in Translator / LanguageDetector
 * APIs (Chromium 138+). Free, unlimited, and nothing leaves the device. Where the
 * APIs are missing (Safari, Firefox, older WebViews) text is shown untranslated.
 *
 * Results are cached in localStorage so a post is translated once per device.
 */

// Minimal typings for the built-in AI translation APIs.
interface BuiltInTranslator {
  translate(text: string): Promise<string>;
}
interface BuiltInLanguageDetector {
  detect(text: string): Promise<Array<{ detectedLanguage: string; confidence: number }>>;
}
type Availability = "unavailable" | "downloadable" | "downloading" | "available";
interface TranslatorStatic {
  availability(opts: { sourceLanguage: string; targetLanguage: string }): Promise<Availability>;
  create(opts: { sourceLanguage: string; targetLanguage: string }): Promise<BuiltInTranslator>;
}
interface LanguageDetectorStatic {
  availability(): Promise<Availability>;
  create(): Promise<BuiltInLanguageDetector>;
}
declare global {
  // eslint-disable-next-line no-var
  var Translator: TranslatorStatic | undefined;
  // eslint-disable-next-line no-var
  var LanguageDetector: LanguageDetectorStatic | undefined;
}

interface TranslationCache {
  [key: string]: { translatedText: string; sourceLanguage: string; targetLanguage: string; timestamp: number };
}

export interface TranslationResult {
  translatedText: string;
  sourceLanguage: string;
  targetLanguage: string;
  isTranslated: boolean;
}

const CACHE_KEY = "translation_cache_v2";
const CACHE_MAX_AGE = 7 * 24 * 60 * 60 * 1000;
const MIN_DETECT_CONFIDENCE = 0.5;

const loadCache = (): TranslationCache => {
  try {
    const parsed = JSON.parse(localStorage.getItem(CACHE_KEY) ?? "{}") as TranslationCache;
    const now = Date.now();
    const fresh: TranslationCache = {};
    for (const [key, value] of Object.entries(parsed)) {
      if (now - value.timestamp < CACHE_MAX_AGE) fresh[key] = value;
    }
    return fresh;
  } catch {
    return {};
  }
};

const translationCache: TranslationCache = loadCache();
let flushTimer: ReturnType<typeof setTimeout> | null = null;
const scheduleFlush = () => {
  if (flushTimer !== null) return;
  flushTimer = setTimeout(() => {
    flushTimer = null;
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify(translationCache));
    } catch {
      /* storage full or disabled */
    }
  }, 1000);
};

export const isBuiltInTranslationSupported = () => typeof globalThis.Translator !== "undefined";

// One translator instance per language pair, created lazily.
const translators = new Map<string, Promise<BuiltInTranslator | null>>();
let detectorPromise: Promise<BuiltInLanguageDetector | null> | null = null;

const getDetector = () => {
  if (!detectorPromise) {
    detectorPromise = (async () => {
      try {
        if (!globalThis.LanguageDetector) return null;
        if ((await globalThis.LanguageDetector.availability()) === "unavailable") return null;
        return await globalThis.LanguageDetector.create();
      } catch {
        return null;
      }
    })();
  }
  return detectorPromise;
};

const getTranslator = (sourceLanguage: string, targetLanguage: string) => {
  const key = `${sourceLanguage}>${targetLanguage}`;
  let p = translators.get(key);
  if (!p) {
    p = (async () => {
      try {
        if (!globalThis.Translator) return null;
        if ((await globalThis.Translator.availability({ sourceLanguage, targetLanguage })) === "unavailable") return null;
        // May trigger a one-time model download; the browser handles it.
        return await globalThis.Translator.create({ sourceLanguage, targetLanguage });
      } catch {
        return null;
      }
    })();
    translators.set(key, p);
  }
  return p;
};

const detectUserLanguage = (): string => {
  try {
    const saved = localStorage.getItem("user_language_preference");
    if (saved) return saved;
    return (navigator.languages?.[0] ?? navigator.language ?? "en").split("-")[0].toLowerCase();
  } catch {
    return "en";
  }
};

const LANGUAGE_NAMES: Record<string, string> = {
  en: "English", es: "Spanish", fr: "French", de: "German", it: "Italian", pt: "Portuguese", ru: "Russian",
  ja: "Japanese", ko: "Korean", zh: "Chinese", ar: "Arabic", hi: "Hindi", nl: "Dutch", sv: "Swedish", da: "Danish",
  no: "Norwegian", fi: "Finnish", pl: "Polish", tr: "Turkish", he: "Hebrew", th: "Thai", vi: "Vietnamese",
  id: "Indonesian", ms: "Malay", uk: "Ukrainian", cs: "Czech", sk: "Slovak", hu: "Hungarian", ro: "Romanian",
  bg: "Bulgarian", hr: "Croatian", sr: "Serbian", sl: "Slovenian", et: "Estonian", lv: "Latvian", lt: "Lithuanian",
};

export function useTranslation() {
  const [userLanguage, setUserLanguage] = useState<string>(detectUserLanguage);

  const translateText = useCallback(
    async (text: string, originalLanguage?: string): Promise<TranslationResult> => {
      const untranslated = (sourceLanguage: string): TranslationResult => ({
        translatedText: text,
        sourceLanguage,
        targetLanguage: userLanguage,
        isTranslated: false,
      });

      if (!text?.trim() || !isBuiltInTranslationSupported()) return untranslated(originalLanguage ?? "unknown");

      const cacheKey = `${userLanguage}:${text.substring(0, 200)}`;
      const cached = translationCache[cacheKey];
      if (cached) {
        return { ...cached, isTranslated: cached.sourceLanguage !== userLanguage };
      }

      try {
        let sourceLanguage = originalLanguage;
        if (!sourceLanguage) {
          const detector = await getDetector();
          const best = detector ? (await detector.detect(text))[0] : undefined;
          sourceLanguage = best && best.confidence >= MIN_DETECT_CONFIDENCE ? best.detectedLanguage : "en";
        }
        if (sourceLanguage === userLanguage) return untranslated(sourceLanguage);

        const translator = await getTranslator(sourceLanguage, userLanguage);
        if (!translator) return untranslated(sourceLanguage);

        const translatedText = await translator.translate(text);
        translationCache[cacheKey] = { translatedText, sourceLanguage, targetLanguage: userLanguage, timestamp: Date.now() };
        scheduleFlush();
        return { translatedText, sourceLanguage, targetLanguage: userLanguage, isTranslated: true };
      } catch (error) {
        console.warn("On-device translation failed:", error);
        return untranslated(originalLanguage ?? "unknown");
      }
    },
    [userLanguage],
  );

  const getLanguageName = (code: string): string => LANGUAGE_NAMES[code] || code.toUpperCase();

  const setUserLanguagePreference = useCallback((languageCode: string) => {
    setUserLanguage(languageCode);
    try {
      localStorage.setItem("user_language_preference", languageCode);
    } catch {
      /* ignore */
    }
  }, []);

  return { userLanguage, setUserLanguage: setUserLanguagePreference, translateText, getLanguageName };
}
