import { MAX_SAMPLES } from "../constants";

const getAudioInput = (chunks, type, audioElem, onLoadend) => {
  const blob = new Blob(chunks, { type });

  const fileReader = new FileReader();

  fileReader.onloadend = async () => {
    const arrayBuffer = fileReader.result;

    try {
      const decoded = await audioElem.current.decodeAudioData(arrayBuffer);
      let audio = decoded.getChannelData(0);
      if (audio.length > MAX_SAMPLES) {
        // Get last MAX_SAMPLES
        audio = audio.slice(-MAX_SAMPLES);
      }

      onLoadend && onLoadend(audio);
    } catch (error) {
      console.error("Audio decode error:", error);
      return;
    }
  };

  fileReader.onerror = (error) => {
    console.error("FileReader error:", error);
  };

  fileReader.readAsArrayBuffer(blob);
};

export default getAudioInput;