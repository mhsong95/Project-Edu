const socket = io("/");
const videoGrid = document.getElementById("video-grid");
const myPeer = new Peer(undefined, {
  host: "/",
  port: "8080",
});

// The value of this promise is used to broadcast that you've joined the room.
// Broadcasting occurs when getUserMedia completes, thus all event listeners
// (e.g. myPeer.on('call')) have had set.
const myUserIdPromise = new Promise((resolve) => {
  myPeer.on("open", (id) => {
    resolve(id); // My user ID
  });
});

const myVideo = document.createElement("video");
myVideo.muted = true;

const peers = {};

var isCreator = false; // Indicates whether you have created a room, or just joined

navigator.mediaDevices
  .getUserMedia({
    video: true,
    audio: true,
  })
  .then((stream) => {
    addVideoStream(myVideo, stream);

    myPeer.on("call", (call) => {
      call.answer(stream);
      const video = document.createElement("video");
      call.on("stream", (userVideoStream) => {
        addVideoStream(video, userVideoStream);
      });
    });

    socket.on("user-connected", (userId) => {
      console.log("User connected: " + userId);

      // Connect to the user only if you are a room creator.
      if (isCreator) {
        connectToNewUser(userId, stream);
      }
    });

    socket.on("room-created", () => {
      isCreator = true;
    });

    myUserIdPromise.then((id) => {
      socket.emit("join-room", ROOM_ID, id);
    });
  });

socket.on("user-disconnected", (userId) => {
  if (peers[userId]) peers[userId].close();
});

function addVideoStream(video, stream) {
  video.srcObject = stream;
  video.addEventListener("loadedmetadata", () => {
    video.play();
  });
  videoGrid.append(video);
}

function connectToNewUser(userId, stream) {
  const call = myPeer.call(userId, stream);
  const video = document.createElement("video");

  call.on("stream", (userVideoStream) => {
    addVideoStream(video, userVideoStream);
  });
  call.on("close", () => {
    video.remove();
  });

  peers[userId] = call;
}

// chat
// If user click submit button, send input value to server socket.
form.addEventListener("submit", function (e) {
  console.log("eventlistener!");
  e.preventDefault();
  if (input.value) {
    socket.emit("message", input.value);
    console.log("listener: " + input.value);
    input.value = "";
  }
});

// Receive message1 from server.js and add given msg to all client
socket.on("message1", function (msg) {
  console.log("html socketon");
  var item = document.createElement("li");
  item.textContent = msg;
  messages.appendChild(item);
  window.scrollTo(0, document.body.scrollHeight);
});

// webgazer
// store calibration
window.saveDataAcrossSessions = true;

const LOOK_DELAY = 3000; // 3 second

let startLookTime = Number.POSITIVE_INFINITY;
let lookDirection = null;

webgazer
  .setGazeListener((data, timestamp) => {
    // console.log(data, timestamp);
    const videogrid = document.getElementById("video-grid");
    const left = videogrid.offsetLeft;
    const right =
      videogrid.offsetLeft + videogrid.offsetWidth;
    const top = videogrid.offsetTop;
    const bottom =
      videogrid.offsetTop + videogrid.offsetHeight;

    if (data == null || lookDirection === "STOP") return;

    if (
      data.x >= left &&
      data.x <= right &&
      data.y >= top &&
      data.y <= bottom
    ) {
      videogrid.style.backgroundColor = "blue";
      startLookTime = Number.POSITIVE_INFINITY; // restart timer
      lookDirection = null;
    }
    else if (
      lookDirection !== "RESET" && lookDirection === null){
        videogrid.style.backgroundColor = "yellow";
        startLookTime = timestamp;
        lookDirection = "OUT"
      }

    if (startLookTime + LOOK_DELAY < timestamp) {
      console.log("ohoh")
      console.log(left, right, top, bottom)
      videogrid.style.backgroundColor = "red";

      startLookTime = Number.POSITIVE_INFINITY;
      lookDirection = "STOP";
      setTimeout(() => {
        lookDirection = "RESET";
      }, 200);
    }
  })
  .begin();

// uncomment to hide videopreview and predictionpoints of webgazer
// webgazer.showVideoPreview(false).showPredictionPoints(false);
