import { TextStreamer, AutoProcessor, full, AutoTokenizer, WhisperForConditionalGeneration } from '@huggingface/transformers';

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

async function load() {
    console.log("WEBWORKER: Loading model in worker...");
    try {
        console.log("WEBWORKER: Loading AutomaticSpeechRecognitionPipeline...");
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
        self.postMessage({ status: "error", error: error.message });
    }
}

let processing = false;
async function generate({ audio, language }) {
    if (processing) return;
    processing = true;

    // Tell the main thread we are starting
    self.postMessage({ status: "start" });

    // Load the model and tokenizer
    const [tokenizer, processor, model] = await AutomaticSpeechRecognitionPipeline.getInstance();

    // Stream text
    const streamer = new TextStreamer(tokenizer, {
        skip_prompt: true,
        skip_special_tokens: true,
    });


    // Try this part 1 below out to see if it works 
    // streamer.onText = (text) => {
    //     self.postMessage({ status: "partial", transcription: text });
    // };

    // Try this part 2 below out to see if it works
    // const streamer = new WhisperTextStreamer(tokenizer, {
    //     callback_function: (text) => {
    //         // new text chunk arrived
    //         postMessage({ type: "partial", text });
    //     },
    //     on_chunk_start: (index) => { /* e.g. show "chunk 1 started" */ },
    //     on_chunk_end: (index) => { /* e.g. chunk ended */ },
    //     on_finalize: (text) => {
    //         postMessage({ type: "final", text });
    //     },
    // });

    const inputs = await processor(audio);

    // Part 3: Try this part 3 out to see if it works
    // // Process the audio input
    // const audioInput = processor.audioToInput(audio);
    // const transcription = await model.generate(audioInput);

    const outputs = await model.generate({
        ...inputs,
        max_new_tokens: MAX_NEW_TOKENS,
        language,
        streamer,
    });

    console.log("WEBWORKER: Waiting for outputs...", outputs);

    const decoded = tokenizer.batch_decode(outputs, {
        skip_special_tokens: true,
    });

    // Send the transcription back to the main thread
    self.postMessage({
        status: "complete",
        output: decoded,
    });
    console.log("WEBWORKER: Transcription complete:", decoded);
    processing = false;

    // self.postMessage({ status: "done", transcription });
    // processing = false;
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