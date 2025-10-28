import { useEffect, useRef, useState } from "react";
const useWorker = ({ onStart, onComplete }) => {
    const worker = useRef(null);
    const [percentageLoaded, setPercentageLoaded] = useState(0);
    const [status, setStatus] = useState(null);
    const [loading, setLoading] = useState("");

    const loadModel = async () => {
        worker.current.postMessage({ type: "worker:load" });
        setStatus("loading");
        setLoading(true);
    }

    const generate = ({ audio, language }) => {
        worker.current.postMessage({ type: "worker:generate", data: { audio, language }, });
    }

    useEffect(() => {
        if (!worker.current) {
            // Create the worker if it does not yet exist.
            worker.current = new Worker(new URL("../workers/automaticSpeechRecognitionWorker.js", import.meta.url), {
                type: "module",
            });
        }
        const onMessageReceived = (event) => {

            switch (event.data.status) {
                case 'loading':
                    setPercentageLoaded(event.data.percentage);
                    break;
                case 'loaded':
                    setStatus("loaded");
                    setLoading(false);
                    setPercentageLoaded(100);
                    break;
                case "start":
                    onStart && onStart();
                    break;
                case "complete":
                    onComplete && onComplete(event);
                    break;
                default:
                    break;
            }

        }

        worker.current.addEventListener("message", onMessageReceived);

        return () => {
            if (worker.current) {
                worker.current.removeEventListener("message", onMessageReceived);
            }
        };
    }, [onStart, onComplete]);

    return {
        isLoaded: status === "loaded",
        loading,
        percentageLoaded,
        status,
        loadModel,
        generate,
        terminate: () => {
            try {
                if (worker.current) {
                    worker.current.terminate();
                    worker.current = null;
                }
            } catch (err) {
                console.warn('Failed to terminate worker', err);
            }
            setStatus(null);
            setLoading(false);
            setPercentageLoaded(0);
        },
    }
}

export default useWorker;