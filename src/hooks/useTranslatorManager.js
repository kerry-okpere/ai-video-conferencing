import { useEffect, useRef, useState, useCallback } from "react";

export function useTranslatorManager() {
    const translatorPool = useRef(new Map()); // key: `${source}-${target}`
    const [isLoading, setIsLoading] = useState(false);
    const [isSupported, setIsSupported] = useState(true);
    const [error, setError] = useState(null);
    // --- internal helper ---
    const createTranslator = useCallback(async (source, target) => {
        if (!isSupported) return null;

        const key = `${source}-${target}`;
        if (translatorPool.current.has(key)) return translatorPool.current.get(key);

        setIsLoading(true);
        const controller = new AbortController();

        try {
            const translator = await Translator.create({
                sourceLanguage: source,
                targetLanguage: target,
                signal: controller.signal,
                monitor(monitor) {
                    monitor.addEventListener("downloadprogress", (e) => {
                        console.log(
                            `Downloading ${key}: ${(e.loaded * 100).toFixed(1)}%`
                        );
                    });
                },
            });

            translator.abortController = controller;
            translatorPool.current.set(key, translator);
            return translator;
        } catch (err) {
            console.error("❌ Failed to create translator:", err);
            setError(err.message || "Failed to create translator");
            return null;
        } finally {
            setIsLoading(false);
        }
    }, []);

    // --- main translate function ---
    const translate = useCallback(async (text, source, target) => {
        if (!isSupported) {
            console.warn("Translation not supported in this browser.");
            return text;
        }
        const translator = await createTranslator(source, target);
        const translated = await translator.translate(text);
        return translated;
    }, [createTranslator]);

    // --- pre-warm likely pairs ---
    const prewarmTranslators = useCallback((myLang, others) => {
        others.forEach((lang) => {
            const key = `${myLang}-${lang}`;
            if (!translatorPool.current.has(key)) {
                createTranslator(myLang, lang);
            }
        });
    }, [createTranslator]);

    // --- abort translation ---
    const abortTranslation = useCallback((source, target) => {
        const key = `${source}-${target}`;
        const translator = translatorPool.current.get(key);
        if (translator?.abortController) translator.abortController.abort();
    }, []);

    // --- destroy unused translators to free memory ---
    const destroyTranslator = useCallback((source, target) => {
        const key = `${source}-${target}`;
        const translator = translatorPool.current.get(key);
        if (translator) {
            translator.destroy();
            translatorPool.current.delete(key);
            console.log(`Destroyed translator ${key}`);
        }
    }, []);

    // --- optional global cleanup on unmount ---
    useEffect(() => {
        if (!("Translator" in self)) {
            console.warn("⚠️ Translation API not supported in this browser.");
            setIsSupported(false);
            setError("Translation API not supported in this browser.");
            return;
        }
        setIsSupported(true);
        return () => {
            if (!translatorPool.current) return;
            for (const [key, translator] of translatorPool.current.entries()) {
                translator.destroy();
                console.log(`Cleaned up ${key}`);
            }
            translatorPool.current.clear();
        };
    }, []);

    return {
        translate,
        prewarmTranslators,
        abortTranslation,
        destroyTranslator,
        isLoading,
        error,
        isSupported,
    };
}
