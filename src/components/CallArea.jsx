import React from 'react';

export default function CallArea({
  localVideoRef,
  remoteVideoRef,
  remoteStream,
  currentRoom,
  clientId,
  participantName,
  listening,
  videoEnabled,
  onToggleMic,
  onToggleVideo,
  onEndCall,
}) {
  const hasRemote = Boolean(remoteStream || (currentRoom?.participants?.find(p => p.clientId !== clientId)));

  return (
    <>
      <div className="videos">
        <div className={`video-row ${!hasRemote ? 'single' : ''}`}>
          <figure className="video-box">
            <figcaption>Me</figcaption>
            <video
              ref={localVideoRef}
              id="localVideo"
              autoPlay
              playsInline
              muted
              className="rounded-video"
            />
          </figure>

          {hasRemote && (
            <figure className="video-box">
              <figcaption>{participantName || 'Participant'}</figcaption>
              <video
                ref={remoteVideoRef}
                id="remoteVideo"
                autoPlay
                playsInline
                className="rounded-video"
              />
            </figure>
          )}
        </div>

        <div className="video-controls">
          <button
            className={`icon-btn ${!listening ? 'muted' : ''}`}
            onClick={onToggleMic}
            aria-label={listening ? 'Mute microphone' : 'Unmute microphone'}
            aria-pressed={listening}
          >
            <span className="material-symbols-outlined">
              {listening ? 'mic' : 'mic_off'}
            </span>
          </button>

          <button
            className={`icon-btn ${!videoEnabled ? 'muted' : ''}`}
            onClick={onToggleVideo}
            aria-label={videoEnabled ? 'Turn off video' : 'Turn on video'}
            aria-pressed={videoEnabled}
          >
            <span className="material-symbols-outlined">
              {videoEnabled ? 'videocam' : 'videocam_off'}
            </span>
          </button>

          <button
            className="end-btn"
            onClick={onEndCall}
          >
            <span className="material-symbols-outlined">call_end</span>
            <span className="end-label">End Call</span>
          </button>
        </div>
      </div>
    </>
  );
}
