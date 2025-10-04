export const MAX_RECONNECTION_ATTEMPTS = 3;
export const ICE_CANDIDATE_STATE = {
  NEW: 'new',
  CHECKING: 'checking',
  CONNECTED: 'connected',
  COMPLETED: 'completed',
  FAILED: 'failed',
  DISCONNECTED: 'disconnected',
  CLOSED: 'closed'
}
export const rtcConfig = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
    { urls: "stun:stun2.l.google.com:19302" },
    { urls: "stun:stun3.l.google.com:19302" },
    { urls: "stun:stun4.l.google.com:19302" },
  ],
};

export const WHISPER_SAMPLING_RATE = 16_000;
const MAX_AUDIO_LENGTH = 30; // seconds
export const MAX_SAMPLES = WHISPER_SAMPLING_RATE * MAX_AUDIO_LENGTH;