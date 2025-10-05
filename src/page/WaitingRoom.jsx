import { useEffect, useRef, useState } from "react";

const WaitingRoom = ({
  stream,
  actionText,
  onCollectMedia,
  onJoinCall,
  model,
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
    <section>
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

      {model.loading && (
        <div className="loading-progress">
          <label htmlFor="file">
            Loading model, this might take a few minutes...
          </label>

          <progress id="file" max={100} value={model.percentage}>
            {model.percentage}%
          </progress>
        </div>
      )}

      {!model.isLoaded && (
        <button onClick={() => onJoinCall(name)}>{`${actionText} without model`}</button>
      )}
      {model.isLoaded ? (
        <button disabled={!name} onClick={() => onJoinCall(name)}>
          {actionText}
        </button>
      ) : (
        <div className="model-loader">
          {!model.loading && (
            <p>Call requires STT model to be loaded before you can join.</p>
          )}
          <button disabled={model.loading} onClick={model.load}>
            {model.loading
              ? `loading model... (${model.percentage}%)`
              : "Load model"}
          </button>
        </div>
      )}
    </section>
  );
};

export default WaitingRoom;
