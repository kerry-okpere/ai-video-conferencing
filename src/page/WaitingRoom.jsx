import { useEffect, useRef, useState } from "react";

const WaitingRoom = ({
  stream,
  actionText,
  onCollectMedia,
  onJoinCall,
  onLanguageChange,
  selectedLanguage,
  isTranslatorSupported,
  supportedLanguages,
}) => {
  const [name, setName] = useState("");
  const localVideo = useRef(null);

  useEffect(() => {
    onCollectMedia();
  }, []);

  useEffect(() => {
    if (localVideo.current && stream) {
      localVideo.current.srcObject = stream;
    }
  }, [stream]);

  return (
    <section className="waiting-room">
      <header>
        <h2>Join Call</h2>
        <p>Set up your Audio, Video and Name before joining</p>
      </header>
      <figure className="waiting-room-video">
        <video
          ref={localVideo}
          id="localVideo"
          autoPlay
          playsInline
          muted
        ></video>
      </figure>

      <div className="name-input">
        <label htmlFor="name">Your name:</label>
        <input
          id="name"
          type="text"
          placeholder="Enter your name"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </div>

      <div className="language-selection">
        <label htmlFor="language">Language:</label>
        <select
          id="language"
          value={selectedLanguage}
          onChange={(e) => onLanguageChange(e.target.value)}
          disabled={!isTranslatorSupported}
        >
          {supportedLanguages.map((lang) => (
            <option key={lang.value} value={lang.value}>
              {lang.label}
            </option>
          ))}
        </select>
        {!isTranslatorSupported && (
          <p className="warning">Translation not supported in this browser</p>
        )}
      </div>

      <button disabled={!name} onClick={() => onJoinCall(name)}>
        {actionText}
      </button>
    </section>
  );
};

export default WaitingRoom;
