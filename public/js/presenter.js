const socket = io("/");
const videoGrid = document.getElementById("video-grid");
const myPeer = new Peer(undefined, {
  host: "/",
  port: "8080",
});

var myID = "";

// The value of this promise is used to broadcast that you've joined the room.
// Broadcasting occurs when getUserMedia completes, thus all event listeners
// (e.g. myPeer.on('call')) have had set.
const myUserIdPromise = new Promise((resolve) => {
  myPeer.on("open", (id) => {
    resolve(id); // My user ID
    myID = id;
  });
});

const myVideo = document.createElement("video");
myVideo.muted = true;

// List of the participants who are receiving your video streams.
const audiences = {};

// List of the participants who are sending their video streams.
// This is only necessary if the presenter also serves as a supervisor.
const observees = {};

navigator.mediaDevices
  .getUserMedia({
    video: true,
    audio: true,
  })
  .then((stream) => {
    addVideoStream(myVideo, stream, myID);

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

    // When a new participant has joined a room.
    socket.on("participant-joined", (userId) => {
      console.log(`Participant joined: ${userId}`);

      // Call the participant to provide your stream.
      callParticipant(userId, stream);
    });

    // When this presenter has re-entered to the room,
    // the server will make you to call those participants
    // who were already in the room.
    socket.on("call-to", (peers) => {
      for (let userId of peers) {
        callParticipant(userId, stream);
      }
    });

    // When a participant is disconnected, make sure you close
    // the call, and thus remove the video on the page.
    socket.on("participant-leaved", (userId) => {
      if (audiences[userId]) {
        audiences[userId].close();
        delete audiences[userId];
      }

      if (observees[userId]) {
        observees[userId].close();
        delete observees[userId];
      }
    });

    // Let the server know that a presenter has joined.
    myUserIdPromise.then((id) => {
      socket.emit("presenter-joined", ROOM_ID, id);
    });
  });

function addVideoStream(video, stream, video_id) {
  video.srcObject = stream;
  video.addEventListener("loadedmetadata", () => {
    video.play();
  });
  video.setAttribute("id", video_id);
  videoGrid.append(video);
}

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

// Call a participant to provide the presenter's stream.
// The callee will answer this call with no stream (or with audio stream),
// thus one-way (presenter => participant) call will be established.
function callParticipant(userId, stream) {
  const call = myPeer.call(userId, stream);

  // TODO: it isn't sure if this will work. The callee
  // will answer this call with no stream.
  call.on("stream", (userVideoStream) => {
    console.log(`Stream from ${userId} coming in.`);
  });

  call.on("close", () => {
    console.log(`Participant closed: ${userId}`);
  });

  audiences[userId] = call;
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
