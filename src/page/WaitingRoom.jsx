import { useEffect, useRef, useState } from "react";

const WaitingRoom = ({ stream, actionText, onCollectMedia, onJoinCall }) => {
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
    <section>
      <figure>
        <figcaption>Local Video</figcaption>
        <video
          ref={localVideo}
          id="localVideo"
          autoPlay
          playsInline
          muted
          style={{ width: "300px", height: "200px", backgroundColor: "black" }}
        ></video>
      </figure>

      <input
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
      />

      <button onClick={onJoinCall}>{actionText}</button>
    </section>
  );
};

export default WaitingRoom;
