const socket = io("/");
const videoGrid = document.getElementById("video-grid");
const myPeer = new Peer(undefined, {
  host: "/",
  port: "8080",
});

var concent = [];
var userID = "";

// The value of this promise is used to broadcast that you've joined the room.
// Broadcasting occurs when getUserMedia completes, thus all event listeners
// (e.g. myPeer.on('call')) have had set.
const myUserIdPromise = new Promise((resolve) => {
  myPeer.on("open", (id) => {
    resolve(id); // My user ID
    userID = id;
    console.log("UserID is " + userID);
  });
});

const myVideo = document.createElement("video");
myVideo.muted = true;

let presenter, supervisor;
let conn;

// A call from the presenter
myPeer.on("call", (call) => {
  call.answer(); // You just watch the presenter.
  const video = document.createElement("video");

  call.on("stream", (userVideoStream) => {
    addVideoStream(video, userVideoStream);
  });

  call.on("close", () => {
    video.remove();
  });

  if (presenter) {
    presenter.close();
  }
  presenter = call;
  conn = call.peer;
});

navigator.mediaDevices
  .getUserMedia({
    video: true,
    audio: true,
  })
  .then((stream) => {
    addVideoStream(myVideo, stream);

    // The server tells you to connect to a new supervisor.
    socket.on("call-to", (userId) => {
      callSupervisor(userId, stream);
    });

    myUserIdPromise.then((id) => {
      socket.emit("participant-joined", ROOM_ID, id);
    });
  });

function addVideoStream(video, stream) {
  video.srcObject = stream;
  video.addEventListener("loadedmetadata", () => {
    video.play();
  });
  videoGrid.append(video);
}

// Call a supervisor to provide the participant's stream.
// The callee will answer this call with no stream,
// thus one-way (participant => supervisor) will be established.
function callSupervisor(userId, stream) {
  const call = myPeer.call(userId, stream);

  // TODO: it isn't sure if this will work. The callee
  // will answer this call with no stream.
  call.on("stream", (userVideoStream) => {
    console.log(`Stream from ${userId} coming in.`);
  });

  call.on("close", () => {
    console.log(`Supervisor closed: ${userId}`);
  });

  if (supervisor) {
    supervisor.close();
  }
  supervisor = call;
  conn = userId;
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

function add_concentrate_log(t, level) {
  concent.push([userID, t, level]);
  send_data([userID, t, level]);
}

// Send data to presenter or spervisor.
function send_data(data) {
  var con = myPeer.connect(conn);
  con.on("open", function () {
    con.send(data);
  });
}

webgazer
  .setGazeListener((data, timestamp) => {
    // console.log(data, timestamp);
    const videogrid = document.getElementById("video-grid");
    const left = videogrid.offsetLeft;
    const right = videogrid.offsetLeft + videogrid.offsetWidth;
    const top = videogrid.offsetTop;
    const bottom = videogrid.offsetTop + videogrid.offsetHeight;

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
      add_concentrate_log(timestamp, 10);
    } else if (lookDirection !== "RESET" && lookDirection === null) {
      videogrid.style.backgroundColor = "yellow";
      startLookTime = timestamp;
      lookDirection = "OUT";
      add_concentrate_log(timestamp, 5);
    }

    if (startLookTime + LOOK_DELAY < timestamp) {
      console.log("ohoh");
      console.log(left, right, top, bottom);
      videogrid.style.backgroundColor = "red";
      add_concentrate_log(timestamp, 0);

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
