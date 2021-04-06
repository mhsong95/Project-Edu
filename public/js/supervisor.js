const socket = io("/");
const videoGrid = document.getElementById("video-grid");

/* ####### Peer setup ####### */

const myPeer = new Peer(undefined, {
  host: "/",
  port: "8080",
});

// Resolve Peer ID.
let userId = "";
myPeer.on("open", (id) => {
  userId = id;
});

/* ####### Data structures ####### */

// Dictionary of participants' names.
// participantDict: { user1ID: user1Name, user2ID: user2Name, ... }
const participantDict = {};
// Dictionary of observees' (those being watched by you) call objects.
// observees: { user1ID: call1, user2ID: call2, ... }
const observees = {};

/* ####### socket.io data ####### */

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

// Error cases: not authorized or the room is not open.
socket.on("rejected", (msg) => {
  alert(msg);

  if (msg === "not-authorized") {
    // If not authorized, redirect to room joining page.
    location.href = `../${ROOM_ID}`;
  } else {
    // If room not found, redirect to room creation page.
    location.href = "../create";
  }
});

socket.on("get-ready", (participants) => {
  for (let part of participants) {
    participantDict[part.userId] = part.name;
  }
  // Notify that the data is synchronized, and you are ready to go.
  socket.emit("supervisor-ready", ROOM_ID, userId, priority, capacity);
});

// Call from a participant to be SUPERVISED.
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
  if (participantDict[userId]) {
    delete participantDict[userId];
  }
});

// When a participant joins the room, remember his name.
socket.on("participant-joined", (userId, name) => {
  participantDict[userId] = name;
});

// Notify the server that the supervisor wants to join the room.
socket.emit("supervisor-connected", ROOM_ID);

function addVideoStream(video, stream, video_id) {
  video.srcObject = stream;
  video.addEventListener("loadedmetadata", () => {
    video.play();
  });
  video.setAttribute("id", video_id);
  videoGrid.append(video);
}
