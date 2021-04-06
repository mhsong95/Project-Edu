const socket = io("/");
const videoGrid = document.getElementById("video-grid");

/* ####### Peer setup ####### */

const myPeer = new Peer(undefined, {
  host: "/",
  port: "8080",
});

// Resolve Peer ID.
let userID = "";
myPeer.on("open", (id) => {
  userID = id;
  console.log("UserID is " + userID);
});

/* ####### Data structures ####### */

let presenterId = ""; // The ID of the presenter of the room.
let presenterName = ""; // The name of the presenter.
let supervisors = []; // The supervisors of the room.
let participantDict = {}; // Dictionary of participant names.

let presenter, supervisor;
let conn;

/* ####### socket.io data ####### */

// Name of the participant.
let myName = prompt("Enter your name", "anonymous");

// Whether the participant is ready to make/accept calls.
let isReady = false;

socket.on("get-ready", (pres, sups, parts) => {
  presenterId = pres.userId;
  presenterName = pres.name;
  supervisors = supervisors.concat(sups);

  for (let part of parts) {
    participantDict[part.userId] = part.name;
  }
  isReady = true;

  // Notify the server that you're ready.
  socket.emit("participant-ready", ROOM_ID, userID, myName);
});

// Error cases: room not found. redirect to room creation page.
socket.on("rejected", (msg) => {
  alert(msg);
  location.href = "../create";
});

socket.on("participant-joined", (userId, name) => {
  participantDict[userId] = name;
});

socket.on("supervisor-joined", (userId) => {
  supervisors.push(userId);
});

const myVideo = document.createElement("video");
myVideo.muted = true;

Promise.all([
  // Add your own video & audio stream.
  navigator.mediaDevices
    .getUserMedia({
      video: true,
      audio: true,
    })
    .then((stream) => {
      addVideoStream(myVideo, stream);
    }),
  // Only video stream: calls to supervisors will be made.
  navigator.mediaDevices
    .getUserMedia({
      video: true,
    })
    .then((stream) => {
      // The server tells you to connect to a new supervisor.
      socket.on("call-supervisor", (userId) => {
        callSupervisor(userId, stream);
      });
    }),
  // Only audio stream: calls from/to presenter will be made.
  navigator.mediaDevices
    .getUserMedia({
      audio: true,
    })
    .then((stream) => {
      socket.on("presenter-joined", (userId, name) => {
        console.log(`Presenter joined: ${userId}`);
        presenterId = userId;
        presenterName = name;

        // Make call to the presenter if you're ready.
        if (ready) {
          callPresenter(userId, stream);
        }
      });

      socket.on("presenter-leaved", () => {
        presenterId = "";
        presenterName = "";

        if (presenter) {
          presenter.close();
        }
      })

      // A call from the presenter
      myPeer.on("call", (call) => {
        // Reject the call if you cannot identify the presenter.
        if (presenterId !== call.peer) {
          call.close();
          return;
        }

        call.answer(stream); // Answer with your audio stream.
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
      });
    }),
]).then(() => {
  socket.emit("participant-connected", ROOM_ID);
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
    supervisor = null;
    conn = "";
  });

  if (supervisor) {
    supervisor.close();
  }
  supervisor = call;
  conn = userId;

  // Identify the callee as a supervisor.
  if (!(userId in supervisors)) {
    supervisors.push(userId);
  }
}

// Call a presenter.
function callPresenter(userId, stream) {
  const call = myPeer.call(userId, stream);
  const video = document.createElement("video");

  call.on("stream", (userVideoStream) => {
    addVideoStream(video, stream);
  });

  call.on("close", () => {
    video.remove();
  });

  if (presenter) {
    presenter.close();
  }
  presenter = call;
}

// chat
// If user click submit button, send input value to server socket.
form.addEventListener("submit", function (e) {
  console.log("eventlistener!");
  e.preventDefault();
  if (input.value) {
    socket.emit("message", input.value, ROOM_ID);
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
  send_data([userID, t, level]);
}

// data: [userID, timestamp, concentrate_level]
function send_data(data) {
  // Send data to presenter or supervisor.
  var con = myPeer.connect(conn);
  con.on("open", function () {
    con.send(data);
  });

  // Send data to server
  socket.emit("concent_data", ROOM_ID, data);
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
      // videogrid.style.backgroundColor = "blue";
      if (lookDirection !== null) {
        add_concentrate_log(timestamp, 10);
      }
      startLookTime = Number.POSITIVE_INFINITY; // restart timer
      lookDirection = null;
    } else if (lookDirection !== "RESET" && lookDirection === null) {
      // videogrid.style.backgroundColor = "yellow";
      startLookTime = timestamp;
      lookDirection = "OUT";
      add_concentrate_log(timestamp, 5);
    }

    if (startLookTime + LOOK_DELAY < timestamp) {
      console.log("ohoh");
      console.log(left, right, top, bottom);
      // videogrid.style.backgroundColor = "red";
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
