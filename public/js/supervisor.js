const socket = io("/", {
  transports: ["websocket"],
}); // Force WebSocket transport to assure in-order arrival of events.

const videoGrid = document.getElementById("video-grid");

/* ####### Peer setup ####### */

const myPeer = new Peer(undefined, {
  host: "/",
  port: "8080",
});

/* ####### Data structures ####### */

// List of pending calls & connections to supervisor.
const pendingCalls = [];
const pendingConns = [];

// Dictionary of observees' (those being watched by you) call objects.
// observees: { user1ID: { call: call1, conn: conn1 }, user2ID: ... }
const observees = {};

// Represents current assignment of participants to this supervisor.
// The assignment is time-stamped.
let currentAssignment = null;

// Everything starts when the peer ID is resolved.
myPeer.on("open", (userId) => {
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

    if (msg === "Not authorized") {
      // If not authorized, redirect to room joining page.
      location.href = `../${ROOM_ID}`;
    } else {
      // If room not found, redirect to room creation page.
      location.href = "../create";
    }
  });

  // When new assignment arrives, update the currentAssignment
  // and accept or decline possible pending calls.
  socket.on("new-assignment", (participants, time) => {
    console.log(
      `New assignment: ${JSON.stringify(participants)}, ${Date(time)}`
    );

    // Close any existing calls that are not in the new assignment
    for (let userId in observees) {
      if (!(userId in participants)) {
        observees[userId].call?.close();
        observees[userId].conn?.close();
        delete observees[userId];
      }
    }
    // Update currentAssignment data structure.
    currentAssignment = { participants: participants, time: time };

    // Accept or decline pending calls if there are any.
    for (let i = pendingCalls.length - 1; i >= 0; i--) {
      let call = pendingCalls[i];

      // Possibly the call is from a new assignment: keep it pending.
      if (call.metadata.time > time) {
        continue;
      }
      // Otherwise, you either accept or decline the call.
      acceptOrDeclineCall(call);
      pendingCalls.splice(i, 1);
    }
    // Accept or decline pending connections if there are any.
    for (let i = pendingConns.length - 1; i >= 0; i--) {
      let conn = pendingConns[i];

      // Possibly the connection is from a new assignment: keep it pending.
      if (conn.metadata.time > time) {
        continue;
      }
      // Otherwise, you either accept or decline the connection.
      acceptOrDeclineConn(conn);
      pendingConns.splice(i, 1);
    }
  });

  // Call from a participant to be SUPERVISED.
  myPeer.on("call", (call) => {
    console.log(`Call from ${call.peer}: incoming`);

    if (!call.metadata?.time) {
      // If there's no metadata, reject right away.
      console.log(`Call from ${call.peer}: rejected - no metadata`);

      call.close();
      return;
    }
    if (!currentAssignment || call.metadata.time > currentAssignment.time) {
      // If the current assignment didn't arrive
      // or the call's timestamp exceeds current assignment's, keep it pending.
      console.log(`Call from ${call.peer}: pending`);

      pendingCalls.push(call);
      return;
    }

    // Otherwise you either accept or decline the call.
    acceptOrDeclineCall(call);
  });

  // Data connection from a participant to be SUPERVISED.
  myPeer.on("connection", (conn) => {
    console.log(`Data connection from ${conn.peer}: incoming`);

    if (!conn.metadata?.time) {
      // If there's no metadata, reject right away.
      console.log(`Data connection from ${conn.peer}: rejected - no metadata`);

      conn.close();
      return;
    }
    if (!currentAssignment || conn.metadata.time > currentAssignment.time) {
      // If the current assignment didn't arrive
      // or the conn's timestamp exceeds current assignment's, keep it pending.
      console.log(`Data connection from ${conn.peer}: pending`);

      pendingConns.push(conn);
      return;
    }

    // Otherwise you either accept or decline the call.
    acceptOrDeclineConn(conn);
  });

  // Notify the server that the supervisor wants to join the room.
  socket.emit("supervisor-connected", ROOM_ID, userId, priority, capacity);
});

// Creates a div element that acts as a video container.
function createVideoContainer() {
  let container = document.createElement("div");
  container.className = "video-container";
  return container;
}

// Attach a media stream to a video container, then append it to
// "video-grid" element in the document.
function addVideoStream(container, stream, video_id, name) {
  // Attach video stream into a new video element.
  const video = document.createElement("video");
  video.muted = true;

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

  container.setAttribute("id", video_id);
  videoGrid.append(container);
}

// Answer or reject a call according to current assignment.
function acceptOrDeclineCall(call) {
  if (call.metadata.time < currentAssignment.time) {
    // Reject any out-dated calls.
    console.log(`Call from ${call.peer}: rejected - outdated`);

    call.close();
    return;
  } else if (call.metadata.time === currentAssignment.time) {
    // Accept if timestamp matches, and the peer is in the current assignment.
    if (call.peer in currentAssignment.participants) {
      console.log(`Call from ${call.peer}: accepted`);

      call.answer();

      const container = createVideoContainer();
      call.on("stream", (userVideoStream) => {
        addVideoStream(
          container,
          userVideoStream,
          call.peer,
          currentAssignment.participants[call.peer]
        );
      });

      call.on("close", () => {
        container.remove();
      });

      // Save the call in the 'observees' dictionary.
      if (!observees[call.peer]) {
        observees[call.peer] = { call: null, conn: null };
      }
      observees[call.peer].call = call;
    } else {
      console.log(`Call from ${call.peer}: rejected - not assigned`);

      call.close();
    }
    return;
  }

  // The cases
  // 1. call.metadata?.time === undefined
  // 2. call.metadata.time > currentAssignment.time
  // should be handled before calling this function.
  console.log(`Here should not be reached!!!`);
}

// Accept or close a data connection according to current assignment.
function acceptOrDeclineConn(conn) {
  if (conn.metadata.time < currentAssignment.time) {
    // Reject any out-dated connections.
    console.log(`Connection from ${conn.peer}: rejected - outdated`);

    conn.close();
    return;
  } else if (conn.metadata.time === currentAssignment.time) {
    // Accept if timestamp matches, and the peer is in the current assignment.
    if (conn.peer in currentAssignment.participants) {
      console.log(`Connection from ${conn.peer}: accepted`);

      // Change border color of the participant's video whenever data arrives.
      conn.on("data", (data) => {
        let [video_id, t, value] = data;
        const video = document.getElementById(video_id);

        if (value === 0) {
          video.style.border = "5px solid red";
        } else if (value === 5) {
          video.style.border = "3px solid yellow";
        } else {
          video.style.border = "0px";
        }
      });

      // Save the connection in the 'observees' dictionary.
      if (!observees[conn.peer]) {
        observees[conn.peer] = { call: null, conn: null };
      }
      observees[conn.peer].conn = conn;
    } else {
      console.log(`Connection from ${conn.peer}: rejected - not assigned`);

      conn.close();
    }
    return;
  }

  // The cases
  // 1. conn.metadata?.time === undefined
  // 2. conn.metadata.time > currentAssignment.time
  // should be handled before calling this function.
  console.log(`Here should not be reached!!!`);
}
