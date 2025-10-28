import { AutoProcessor, full, AutoTokenizer, WhisperForConditionalGeneration } from '@huggingface/transformers';

const MAX_NEW_TOKENS = 64;

class AutomaticSpeechRecognitionPipeline {
    static model_id = "onnx-community/whisper-base";
    static tokenizer = null;
    static processor = null;
    static model = null;

    static async getInstance(progress_callback = null) {
        console.log("WEBWORKER: AutomaticSpeechRecognitionPipeline: Loading model, tokenizer, and processor...");
        this.tokenizer ??= AutoTokenizer.from_pretrained(this.model_id, { progress_callback });
        this.processor ??= AutoProcessor.from_pretrained(this.model_id, {
            progress_callback,
        });
        this.model ??= WhisperForConditionalGeneration.from_pretrained(
            this.model_id,
            {
                dtype: {
                    encoder_model: "fp32", // 'fp16' works too
                    decoder_model_merged: "q4", // or 'fp32' ('fp16' is broken)
                },
                device: "webgpu",
                progress_callback,
            },
        );

        return Promise.all([this.tokenizer, this.processor, this.model]);
    }
}

async function load() {
    console.log("WEBWORKER: Loading model in worker...");
    try {
        const [_, __, model] = await AutomaticSpeechRecognitionPipeline.getInstance(handleLoaded);

        // Compiling shaders and warming up model
        // Run model and warming up model and with dummy input to compile shaders...
        await model.generate({
            input_features: full([1, 80, 3000], 0.0),
            max_new_tokens: 1,
        });
        self.postMessage({ status: "loaded" });
    } catch (error) {
        console.log("WEBWORKER: Error loading model:", error);
    }
}

let processing = false;
async function generate({ audio, language }) {
    if (processing) return;
    processing = true;

    self.postMessage({ status: "start" });

    const [tokenizer, processor, model] = await AutomaticSpeechRecognitionPipeline.getInstance();

    const inputs = await processor(audio);

    const outputs = await model.generate({
        ...inputs,
        max_new_tokens: MAX_NEW_TOKENS,
        language,
    });

    const decoded = tokenizer.batch_decode(outputs, {
        skip_special_tokens: true,
    });

    self.postMessage({ status: "complete", text: decoded.join(" ") });
    processing = false;
}

self.addEventListener("message", async (event) => {
    const { type, data } = event.data;

    switch (type) {
        case "worker:load":
            load();
            break;
        case "worker:generate":
            generate(data);
            break;
    }
});


// Helper functions for tracking progress of model loading
let files = new Map();
function handleLoaded(loaded) {
    // Status: 'initiate' | 'download' | 'progress' | 'done'

    switch (loaded.status) {
        case "initiate":
            // we don't know total yet, so mark as 0
            files.set(loaded.file, { loaded: 0, total: 0 });
            break;

        case "progress":
            files.set(loaded.file, {
                loaded: loaded.loaded,
                total: loaded.total ?? 0,
            });
            sendProgress();
            break;

        case "done":
            files.set(loaded.file, {
                loaded: loaded.total ?? 0,
                total: loaded.total ?? 0,
            });
            sendProgress();
            break;
    }
}

function sendProgress() {
    // compute weighted progress
    let totalLoaded = 0;
    let totalSize = 0;

    for (let { loaded, total } of files.values()) {
        totalLoaded += loaded;
        totalSize += total;
    }

    if (totalSize > 0) {
        const percentage = Math.floor((totalLoaded / totalSize) * 100);
        self.postMessage({ status: "loading", percentage });
    }
}
