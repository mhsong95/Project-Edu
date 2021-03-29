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

// List of the participants who are sending their video streams.
const observees = {};

// The priority and capacity of this supervisor.
let priority, capacity;
(function setPriority() {
  priority = Number(prompt("Priority? (>= 1)"));
  if (!Number.isInteger(priority) || priority < 1) {
    alert("Enter an integer greater than or equal to 1");
    setPriority();
  }
})();
(function setCapacity() {
  capacity = Number(prompt("Capacity? (>= 1)"));
  if (!Number.isInteger(capacity) || capacity < 1) {
    alert("Enter an integer greater than or equal to 1");
    setCapacity();
  }
})();

// Call from a participant to be 'supervised'.
myPeer.on("call", (call) => {
  call.answer(); // You will be just watching the video.
  const video = document.createElement("video");

  call.on("stream", (userVideoStream) => {
    addVideoStream(video, userVideoStream, call.peer);
  });

  call.on("close", () => {
    video.remove();
  });

  observees[call.peer] = call;
});

// Get concentrate data from participant and change border color of their video.
myPeer.on("connection", function (conn) {
  conn.on("data", function (data) {
    let video_id = data[0];
    let t = data[1];
    let value = data[2];
    const v = document.getElementById(video_id);
    if (value === 0) {
      v.style.border = "5px solid red";
    } else if (value === 5) {
      v.style.border = "3px solid yellow";
    } else {
      v.style.border = "0px";
    }
  });
});

// When a participant leaves the room.
socket.on("participant-leaved", (userId) => {
  if (observees[userId]) {
    observees[userId].close();
    delete observees[userId];
  }
});

// Let the server know that a supervisor has joined.
myUserIdPromise.then((id) => {
  socket.emit("supervisor-joined", ROOM_ID, id, priority, capacity);
});

function addVideoStream(video, stream, video_id) {
  video.srcObject = stream;
  video.addEventListener("loadedmetadata", () => {
    video.play();
  });
  video.setAttribute("id", video_id);
  videoGrid.append(video);
}
