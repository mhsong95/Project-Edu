const socket = io("/");
const videoGrid = document.getElementById("video-grid");

/* ####### Peer setup ####### */

const screen_vid = document.getElementById("screen-video");
const my_cam = document.getElementById("my-cam");
const prof_cam = document.getElementById("prof-cam");

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
let screenId = ""; // The ID of the presenter's screen.
let presenterName = ""; // The name of the presenter.
let supervisors = []; // The supervisors of the room.
let participantDict = {}; // Dictionary of participant names.

let presenter, supervisor, screen;
let conn;

// An empty media stream.
let emptyStream = new MediaStream([
  (function ({ width, height }) {
    const canvas = Object.assign(document.createElement("canvas"), {
      width,
      height,
    });
    canvas.getContext("2d").fillRect(0, 0, width, height);

    const stream = canvas.captureStream();
    const track = stream.getVideoTracks()[0];

    return Object.assign(track, { enabled: false });
  })({ width: 10, height: 10 }),
]);

/* ####### socket.io data ####### */

// Name of the participant.
let myName = prompt("Enter your name", "anonymous");

// Whether the participant is ready to make/accept calls.
let isReady = false;

socket.on("get-ready", (pres, sups, parts) => {
  presenterId = pres.userId;
  screenId = pres.screenId;
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

//const myVideo = document.createElement("video");
//myVideo.muted = true;
my_cam.muted = true;

Promise.all([
  // Add your own video & audio stream.
  navigator.mediaDevices
    .getUserMedia({
      video: true,
      audio: true,
    })
    .then((stream) => {
      addVideoStream(my_cam, stream, false);
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
        if (isReady) {
          callPresenter(userId, stream);
        }
      });

      socket.on("presenter-leaved", () => {
        presenterId = "";
        presenterName = "";

        if (presenter) {
          presenter.close();
          presenter = null;
        }
      });

      socket.on("screenshare-started", (userId) => {
        screenId = userId;

        // Make call to the screen peer if you're ready.
        if (isReady) {
          callScreen(userId);
        }
      });

      socket.on("screenshare-stopped", () => {
        screenId = "";

        if (screen) {
          screen.close();
          screen = null;
        }
      });

      // A call from the presenter
      myPeer.on("call", (call) => {
        if (call.peer === presenterId) {
          // Call from the presenter's webcam.
          call.answer(stream);

          call.on("stream", (userVideoStream) => {
            addVideoStream(prof_cam, userVideoStream, false);
          });

          call.on("close", () => {
            prof_cam.srcObject = new MediaStream();
          });

          if (presenter) {
            presenter.close();
          }
          presenter = call;
        } else if (call.peer === screenId) {
          // Call from the presenter's screen.
          call.answer();

          call.on("stream", (screenStream) => {
            addVideoStream(screen_vid, screenStream, true);
          });

          call.on("close", () => {
            screen_vid.srcObject = new MediaStream();
          });

          if (screen) {
            screen.close();
          }
          screen = call;
        } else {
          // Reject any other calls.
          call.close();
          return;
        }
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
  //if (!screen) {
  //  videoGrid.append(video);
  //}
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
  //const video = document.createElement("video");

  call.on("stream", (userVideoStream) => {
    addVideoStream(prof_cam, stream);
  });

  call.on("close", () => {
    prof_cam.srcObject = new MediaStream();
  });

  if (presenter) {
    presenter.close();
  }
  presenter = call;
}

// Call a screen sharing peer.
function callScreen(userId) {
  const call = myPeer.call(userId, emptyStream);

  call.on("stream", (screenStream) => {
    addVideoStream(screen_vid, screenStream, true);
  });

  call.on("close", () => {
    screen_vid.srcObject = new MediaStream();
  });

  if (screen) {
    screen.close();
  }
  screen = call;
}

// chat
// If user click submit button, send input value to server socket.
form.addEventListener("submit", function (e) {
  console.log("eventlistener!");
  e.preventDefault();
  if (input.value) {
    socket.emit("message", ROOM_ID, input.value, myName);
    console.log("listener: " + input.value);
    input.value = "";
  }
});

// Receive message1 from server.js and add given msg to all client
socket.on("message1", function (msg, name) {
  console.log("html socketon");
  var item = document.createElement("li");
  item.textContent = `${name}: ${msg}`;
  messages.appendChild(item);
  window.scrollTo(0, document.body.scrollHeight);
});

// webgazer
// store calibration
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
