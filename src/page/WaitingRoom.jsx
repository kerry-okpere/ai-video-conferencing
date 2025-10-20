import { useEffect, useRef, useState } from "react";

const WaitingRoom = ({
  stream,
  actionText,
  onCollectMedia,
  onJoinCall,
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

      <button disabled={!name} onClick={() => onJoinCall(name)}>
        {actionText}
      </button>
    </section>
  );
};

export default WaitingRoom;
