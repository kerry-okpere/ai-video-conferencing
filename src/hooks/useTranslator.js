import { useEffect, useRef, useState, useCallback } from "react";

export function useTranslator({
  sourceLanguage = "en",
  targetLanguage = "fr",
} = {}) {
  const [isReady, setIsReady] = useState(false);
  const [isTranslating, setIsTranslating] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState(null);
  const translatorRef = useRef(null);
  const abortControllerRef = useRef(null);

  // Initialize and download the translator model
  const createTranslator = useCallback(async () => {
    if (!("Translator" in self)) {
      setError("Translator API not supported in this browser.");
      return;
    }

    try {
      setError(null);
      setIsReady(false);
      setProgress(0);

      abortControllerRef.current = new AbortController();
      const translator = await Translator.create({
        sourceLanguage,
        targetLanguage,
        signal: abortControllerRef.current.signal,
        monitor(monitor) {
          monitor.addEventListener("downloadprogress", (e) => {
            const pct = Math.floor(e.loaded * 100);
            setProgress(pct);
          });
        },
      });

      translatorRef.current = translator;
      setIsReady(true);
    } catch (err) {
      if (err.name === "AbortError") return;
      console.error("Translator initialization failed:", err);
      setError(err.message);
    }
  }, [sourceLanguage, targetLanguage]);

  // Perform translation
  const translate = useCallback(async (text) => {
    if (!translatorRef.current) return null;

    try {
      setIsTranslating(true);
      const result = await translatorRef.current.translate(text);
      setIsTranslating(false);
      return result;
    } catch (err) {
      setIsTranslating(false);
      if (err.name === "AbortError") return null;
      console.error("Translation error:", err);
      setError(err.message);
      return null;
    }
  }, []);

  // Cancel ongoing translation
  const abortTranslation = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = new AbortController(); // reset
    }
  }, []);

  // Destroy and release memory
  const destroy = useCallback(() => {
    try {
      translatorRef.current?.destroy?.();
      translatorRef.current = null;
      setIsReady(false);
      setProgress(0);
    } catch (err) {
      console.error("Error destroying translator:", err);
    }
  }, []);

  // Cleanup when component unmounts
  useEffect(() => {
    createTranslator();
    return () => {
      abortTranslation();
      destroy();
    };
  }, [createTranslator, destroy, abortTranslation]);

  return {
    isReady,
    isTranslating,
    progress,
    error,
    translate,
    abortTranslation,
    destroy,
  };
}
