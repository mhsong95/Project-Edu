const socket = io("/", {
  transports: ["websocket"],
}); // Force WebSocket transport to assure in-order arrival of events.

// A video grid to hold participants videos.
const videoGrid = document.getElementById("video-grid");

/* ####### Peer setup ####### */

// The Peer instance to manage calls.
const myPeer = new Peer(undefined, {
  host: "/",
  port: "8080",
});

// Resolve Peer ID.
let userIdPromise = new Promise((resolve) => {
  myPeer.on("open", (id) => {
    resolve(id);
  });
});
/* When you need ID of a peer, use
userIdPromise.then((id) => {
  do_your_thing_with_id(id);
});
*/

// Dictionary of participants' names.
// names: { user1ID: user1Name, user2ID: user2Name, ... }
const names = {};

// Dictionary of participants(peers)' call objects.
// peers: { user1Id: call1, user2ID: call2, ... }
const peers = {};

// List of pending Call objects to the user.
const pendingCalls = [];

/* ####### socket.io setup ####### */

// The name of this user.
let myName;
(function setName() {
  myName = prompt("Enter your name");
  if (!myName) {
    alert("Please enter your name");
    setName();
  }
})();

// Whether the user is ready to make/accept calls.
let isReady = false;

// Error cases: room not found. Redirect to room creation page.
socket.on("rejected", (msg) => {
  alert(msg);
  location.href = `../${ROOM_ID}`; // redirect to room joining page.
});

// Get webcam & mic stream, set event listeners on socket.
navigator.mediaDevices
  .getUserMedia({
    video: true,
    audio: true,
  })
  .then((stream) => {
    // Insert your video stream into the page.
    const container = createVideoContainer();
    addVideoStream(container, stream, myName, (muted = true));

    /* ####### Call management ####### */

    // Call from a participant.
    myPeer.on("call", (call) => {
      console.log(`Call from ${call.peer}: Incoming`);

      if (!isReady) {
        // Keep the call pending if you are not ready to identify callers.
        console.log(`Call from ${call.peer}: Pending`);

        pendingCalls.push(call);
        return;
      } else {
        // Otherwise accept or decline the call with your stream.
        acceptOrDeclineCall(call, stream);
      }
    });

    // When a new participant has joined a room: call the participant.
    socket.on("participant-joined", (userId, name) => {
      console.log(`Participant joined: ${userId}`);

      // Store the name of the participant and call the participant.
      names[userId] = name;
      callParticipant(userId, stream);
    });

    // When a participant is disconnected, close the calls.
    socket.on("participant-leaved", (userId) => {
      console.log(`Participant leaved: ${userId}`);

      // Remove the name from the name dictionary.
      if (userId in names) {
        delete names[userId];
      }

      // Close the call to the peer and remove it from the set of calls.
      if (userId in peers) {
        peers[userId].close();
        delete peers[userId];
      }
    });

    // Notify the server that you want to join the room.
    userIdPromise.then((userId) => {
      socket.emit(
        "participant-connected",
        ROOM_ID,
        userId,
        myName,
        resolvePendingCalls
      );
    });

    // Callback sent to the server to receive the participants identities
    // and resolve the pending calls.
    function resolvePendingCalls(participantNames) {
      console.log("Participant list arrived from the server.");

      // Store the names of participants you received from the server.
      for (let userId in participantNames) {
        names[userId] = participantNames[userId];
      }

      // Accept or reject each pending call.
      while (pendingCalls.length > 0) {
        let call = pendingCalls.shift();
        acceptOrDeclineCall(call, stream);
      }

      // Now you do not have to keep calls pending. You're ready.
      isReady = true;
    }

    // Initiate Google Cloud STT transcription.
    AudioStreamer.initRecording(
      stream,
      (data, userId) => {
        console.log(`${names[userId]}: ${data}`);
      },
      (error) => {
        console.error("Error when recording", error);
      }
    );
  });

/* ####### Helper functions ####### */

// Call a new participant.
function callParticipant(userId, stream) {
  const call = myPeer.call(userId, stream);
  console.log(`Calling to ${userId}(${names[call.peer]})`);

  // Insert the callee's video stream into the page.
  const container = createVideoContainer();
  call.on("stream", (peerStream) => {
    console.log(`Receiving video stream from ${call.peer}`);
    addVideoStream(container, peerStream, names[call.peer]);
  });

  // Remove the video element if the call is closed.
  call.on("close", () => {
    container.remove();
  });

  // Add the call to the set of peers.
  peers[call.peer] = call;
}

// Answer or reject a call when the caller is identifiable.
function acceptOrDeclineCall(call, stream) {
  if (!(call.peer in names)) {
    // Reject the call if you cannot identify the caller.
    console.log(`Call from ${call.peer}: Rejected`);
    call.close();
  } else {
    // Otherwise answer the call with your video stream.
    console.log(`Call from ${call.peer}(${names[call.peer]}): Accepted`);
    call.answer(stream);

    // Insert the caller's video stream into the page.
    const container = createVideoContainer();
    call.on("stream", (peerStream) => {
      console.log(`Receiving video stream from ${call.peer}`);
      addVideoStream(container, peerStream, names[call.peer]);
    });

    // Remove the video element if the call is closed.
    call.on("close", () => {
      container.remove();
    });

    // Add the call to the set of peers.
    peers[call.peer] = call;
  }
}

// Creates a div element that acts as a video container.
function createVideoContainer() {
  let container = document.createElement("div");
  container.className = "video-container";
  return container;
}

// Attach a media stream to a video container, then append it to
// "video-grid" element in the document.
function addVideoStream(container, stream, name, muted = false) {
  if (container.hasChildNodes()) {
    // Handling PeerJS error: receiving the same stream twice.
    return;
  }
  // Attach video stream into a new video element.
  const video = document.createElement("video");
  video.muted = muted;

  video.srcObject = stream;
  video.addEventListener("loadedmetadata", () => {
    video.play();
  });
  container.append(video);

  // Attach overlayed name label.
  const nameOverlay = document.createElement("p");
  nameOverlay.className = "name-overlay";
  nameOverlay.append(document.createTextNode(name));
  container.append(nameOverlay);

  videoGrid.append(container);
}

// chat
const form = document.getElementById("form");
const chatInput = document.getElementById("input");
const messages = document.getElementById("messages");

// If user click submit button, send input value to server socket.
form.addEventListener("submit", function (e) {
  console.log("eventlistener!");
  e.preventDefault();
  if (chatInput.value) {
    socket.emit("message", ROOM_ID, null, null, chatInput.value, myName);
    console.log("listener: " + chatInput.value);
    chatInput.value = "";
  }
});

// Receive message1 from server.js and add given msg to all client
socket.on("message1", function (msg, name) {
  console.log("html socketon");
  var item = document.createElement("div");
  item.textContent = `${name}: ${msg}`;
  item.className = "message";
  messages.appendChild(item);
  messages.scrollTop = messages.scrollHeight;
});
