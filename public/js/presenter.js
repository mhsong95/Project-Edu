const socket = io("/", {
  transports: ["websocket"],
}); // Force WebSocket transport to assure in-order arrival of events.

const videoGrid = document.getElementById("video-grid");
const audioGrid = document.getElementById("audio-grid");

/* ####### Peer setup ####### */

// The Peer instance to manage calls as a presenter.
const presenterPeer = new Peer(undefined, {
  host: "/",
  port: "8080",
});
// The Peer instance to manage calls as a supervisor.
const supervisorPeer = new Peer(undefined, {
  host: "/",
  port: "8080",
});
// The peer instance to manage calls to/from shared screen.
const screenPeer = new Peer(undefined, {
  host: "/",
  port: "8080",
});

// Resolve IDs.
// When you need ID of a peer, use
/* 
xxxIdPromise.then((id) => {
  do_your_thing_with_id(id);
});
*/
let presenterIdPromise = new Promise((resolve) => {
  presenterPeer.on("open", (id) => {
    resolve(id);
  });
});
let supervisorIdPromise = new Promise((resolve) => {
  supervisorPeer.on("open", (id) => {
    resolve(id);
  });
});
let screenIdPromise = new Promise((resolve) => {
  screenPeer.on("open", (id) => {
    resolve(id);
  });
});

/* ####### Data structures ####### */

// Dictionary of participants' names.
// participantDict: { user1ID: user1Name, user2ID: user2Name, ... }
const participants = {};

// List of pending calls to presenterPeer.
presenterPeer.pendingCalls = [];
// Dictionary of audiences' call objects
// audiences: { user1ID: call1, user2ID: call2, ... }
presenterPeer.audiences = {};

// List of pending calls to screenPeer.
screenPeer.pendingCalls = [];
// Dictionary of audiences' call objects
// audiences: { user1ID: call1, user2ID: call2, ... }
screenPeer.audiences = {};

// List of pending calls & connections to supervisor.
supervisorPeer.pendingCalls = [];
supervisorPeer.pendingConns = [];
// Dictionary of observees' (those being watched by you) call objects.
// observees: { user1ID: { call: call1, conn: conn1 }, user2ID: ... }
supervisorPeer.observees = {};
// Represents current assignment of participants to this supervisor.
// The assignment is time-stamped.
supervisorPeer.currentAssignment = null;

/* ####### socket.io data ####### */

// The name of this user.
let myName = prompt("Enter your name", "anonymous");
// Whether the presenter is ready to make/accept calls.
let isReady = false;
// The stream of the shared screen. Set to null if not sharing screen.
let screenStream = null;

// Error cases: Not authorized or presenter already exists.
socket.on("rejected", (msg) => {
  alert(msg);
  location.href = `../${ROOM_ID}`; // redirect to room joining page.
});

// Get webcam stream, set event listeners on socket.
navigator.mediaDevices
  .getUserMedia({
    video: true,
    audio: true,
  })
  .then((stream) => {
    // Insert your video stream into the page.
    const container = createVideoContainer();
    presenterIdPromise.then((presenterId) => {
      addVideoStream(container, stream, presenterId, myName, true);
    });

    /* ####### Presenter event listeners ####### */

    // Call from a participant to the PRESENTER (audio only)
    presenterPeer.on("call", (call) => {
      console.log(`Call from ${call.peer} to presenterPeer: incoming`);

      // Keep the call pending if you do not have list of participants yet.
      if (!isReady) {
        console.log(`Call from ${call.peer} to presenterPeer: pending`);

        presenterPeer.pendingCalls.push(call);
        return;
      }

      // Accept the call if you can identify the caller.
      acceptOrDeclineCall(call, presenterPeer, stream);
    });

    // Call from a participant to the SCREEN (empty stream)
    screenPeer.on("call", (call) => {
      console.log(`Call from ${call.peer} to screenPeer: incoming`);

      // Reject the call if you are not sharing screen.
      if (!screenStream) {
        console.log(`Call from ${call.peer} to screenPeer: not sharing screen`);

        call.close();
        return;
      } else if (!isReady) {
        // Keep the call pending if you do not have list of participants yet.
        console.log(`Call from ${call.peer} to screenPeer: pending`);

        screenPeer.pendingCalls.push(call);
        return;
      }

      // Accept the call if you are sharing screen and can identify the caller.
      acceptOrDeclineCall(call, screenPeer, screenStream);
    });

    // When a new participant has joined a room: call the participant.
    socket.on("participant-joined", (userId, name) => {
      console.log(`Participant joined: ${userId}`);

      // Store the name of the participant.
      participants[userId] = name;

      // Call the participant with your webcam stream,
      callParticipant(userId, stream, presenterPeer);

      // and possibly with your screen stream, if you are sharing screen.
      if (screenStream) {
        callParticipant(userId, screenStream, screenPeer);
      }
    });

    // When a participant is disconnected, close the calls.
    socket.on("participant-leaved", (userId) => {
      console.log(`Participant leaved: ${userId}`);

      // Close the call to the presenterPeer (that with audio stream)
      if (userId in presenterPeer.audiences) {
        presenterPeer.audiences[userId].close();
        delete presenterPeer.audiences[userId];
      }
      // Close the call to the screenPeer (that with empty stream)
      if (userId in screenPeer.audiences) {
        screenPeer.audiences[userId].close();
        delete screenPeer.audiences[userId];
      }

      // Remove his name from the participants list.
      if (userId in participants) {
        delete participants[userId];
      }
    });

    // Notify the server that you want to join the room.
    presenterIdPromise.then((presenterId) => {
      socket.emit(
        "presenter-connected",
        ROOM_ID,
        presenterId,
        myName,
        resolvePendingCalls
      );
    });

    // Callback sent to the server to receive the list of participants
    // and resolve the pending calls.
    function resolvePendingCalls(participantDict) {
      console.log("Participant list arrived from the server.");

      // Store the names of participants you received from the server.
      for (let userId in participantDict) {
        participants[userId] = participantDict[userId];
      }

      // Accept or reject each pending calls to presenterPeer.
      while (presenterPeer.pendingCalls.length > 0) {
        let call = presenterPeer.pendingCalls.shift();
        acceptOrDeclineCall(call, presenterPeer, stream);
      }

      // Accept or reject each pending calls to screenPeer.
      while (screenPeer.pendingCalls.length > 0) {
        let call = screenPeer.pendingCalls.shift();

        // Answer only if you are sharing screen.
        if (screenStream) {
          acceptOrDeclineCall(call, screenPeer, screenStream);
        }
      }

      // Now you do not have to keep calls pending. You're ready.
      isReady = true;
    }

    /* ####### Supervisor event listeners ####### */

    // When new assignment arrives, update the currentAssignment
    // and accept or decline possible pending calls.
    socket.on("new-assignment", (participants, time) => {
      console.log(
        `New assignment: ${JSON.stringify(participants)}, ${Date(time)}`
      );

      let observees = supervisorPeer.observees;
      // Close any existing calls that are not in the new assignment
      for (let userId in observees) {
        if (!(userId in participants)) {
          observees[userId].call?.close();
          observees[userId].conn?.close();
          delete observees[userId];
        }
      }
      // Update currentAssignment data structure.
      supervisorPeer.currentAssignment = {
        participants: participants,
        time: time,
      };

      let pendingCalls = supervisorPeer.pendingCalls;
      // Accept or decline pending calls if there are any.
      for (let i = pendingCalls.length - 1; i >= 0; i--) {
        let call = pendingCalls[i];

        // Possibly the call is from a new assignment: keep it pending.
        if (call.metadata.time > time) {
          continue;
        }
        // Otherwise, you either accept or decline the call.
        acceptOrDeclineCall(call, supervisorPeer, null);
        pendingCalls.splice(i, 1);
      }

      let pendingConns = supervisorPeer.pendingConns;
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
    supervisorPeer.on("call", (call) => {
      console.log(`Call from ${call.peer} to supervisor: incoming`);

      if (!call.metadata?.time) {
        // If there's no metadata, reject right away.
        console.log(
          `Call from ${call.peer} to supervisor: rejected - no metadata`
        );

        call.close();
        return;
      }
      if (
        !supervisorPeer.currentAssignment ||
        call.metadata.time > supervisorPeer.currentAssignment.time
      ) {
        // If the current assignment didn't arrive or
        // the call's timestamp exceeds current assignment's, keep it pending.
        console.log(`Call from ${call.peer} to supervisor: pending`);

        supervisorPeer.pendingCalls.push(call);
        return;
      }

      // Otherwise you either accept or decline the call.
      acceptOrDeclineCall(call, supervisorPeer, null);
    });

    // Data connection from a participant to be SUPERVISED.
    supervisorPeer.on("connection", (conn) => {
      console.log(`Data connection from ${conn.peer}: incoming`);

      if (!conn.metadata?.time) {
        // If there's no metadata, reject right away.
        console.log(
          `Data connection from ${conn.peer}: rejected - no metadata`
        );

        conn.close();
        return;
      }
      if (
        !supervisorPeer.currentAssignment ||
        conn.metadata.time > supervisorPeer.currentAssignment.time
      ) {
        // If the current assignment didn't arrive
        // or the conn's timestamp exceeds current assignment's, keep it pending.
        console.log(`Data connection from ${conn.peer}: pending`);

        supervisorPeer.pendingConns.push(conn);
        return;
      }

      // Otherwise you either accept or decline the call.
      acceptOrDeclineConn(conn);
    });

    // Notify the server that the supervisor wants to join the room.
    // A presenter is by now also a supervisor
    // with lowest priority and infinite capacity.
    supervisorIdPromise.then((supervisorId) => {
      socket.emit("supervisor-connected", ROOM_ID, supervisorId, 1000, 1000);
    });
  });

/* ####### Helper functions ####### */

// Call a new participant from specified peer (presenterPeer || screenPeer).
function callParticipant(userId, stream, peer) {
  const call = peer.call(userId, stream);
  console.log(`Calling to ${userId} from ${peer.id}`);

  if (peer === presenterPeer) {
    // Insert audio stream of the participant into the page.
    const audio = document.createElement("audio");
    call.on("stream", (audioStream) => {
      console.log(`Receiving audio stream from ${userId}`);
      addAudioStream(audio, audioStream, userId);
    });

    // Remove the audio element if the call is closed.
    call.on("close", () => {
      audio.remove();
    });
  }

  // Add the call to the list of audiences.
  peer.audiences[userId] = call;
}

// Answer or reject a call to peer with the specified stream.
function acceptOrDeclineCall(call, peer, stream) {
  /* ##### Calls to supervisor ##### */

  if (peer === supervisorPeer) {
    let { currentAssignment, observees } = supervisorPeer;

    if (call.metadata.time < currentAssignment.time) {
      // Reject any out-dated calls.
      console.log(`Call from ${call.peer} to supervisor: rejected - outdated`);

      call.close();
      return;
    } else if (call.metadata.time === currentAssignment.time) {
      // Accept if timestamp matches, and the peer is in the current assignment.
      if (call.peer in currentAssignment.participants) {
        console.log(`Call from ${call.peer} to supervisor: accepted`);

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
        console.log(
          `Call from ${call.peer} to supervisor: rejected - not assigned`
        );

        call.close();
      }
      return;
    }

    // The cases
    // 1. call.metadata?.time === undefined
    // 2. call.metadata.time > currentAssignment.time
    // should be handled before calling this function.
    console.log(`Here should not be reached!!!`);
    return;
  }

  /* ##### Calls to presenterPeer & screenPeer ##### */

  // Reject the call if you cannot identify the caller.
  if (!(call.peer in participants)) {
    console.log(`Call from ${call.peer} to ${peer.id}: rejected`);

    call.close();
  } else {
    console.log(`Call from ${call.peer} to ${peer.id}: accepted`);

    call.answer(stream);

    // If the call is to presenterPeer,
    if (peer === presenterPeer) {
      // Insert audio stream of the participant into the page.
      const audio = document.createElement("audio");
      call.on("stream", (audioStream) => {
        console.log(`Receiving audio stream from ${call.peer}`);
        addAudioStream(audio, audioStream, call.peer);
      });

      // Remove the audio element if the call is closed.
      call.on("close", () => {
        audio.remove();
      });
    }

    // Add the call to the list of audiences.
    peer.audiences[call.peer] = call;
  }
}

// Accept or close a data connection according to current assignment.
function acceptOrDeclineConn(conn) {
  let { currentAssignment, observees } = supervisorPeer;

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

// Start screen sharing.
function startScreenSharing() {
  // Get the screen stream.
  navigator.mediaDevices.getDisplayMedia().then((stream) => {
    // The video element to attach screen stream.
    const screen_vid = document.getElementById("screen-video");
    screen_vid.muted = true;

    // Attach the screen stream into the video element.
    screen_vid.srcObject = stream;
    screen_vid.onloadedmetadata = (ev) => {
      screen_vid.play();
    };

    // "Share Screen" button.
    const share_button = document.getElementById("screen-share");

    // When the screen sharing stops.
    stream.oninactive = () => {
      // Attach a new empty stream to the video element.
      screen_vid.srcObject = new MediaStream();

      // Hangup the calls and delete them.
      for (let userId in screenPeer.audiences) {
        screenPeer.audiences[userId].close();
        delete screenPeer.audiences[userId];
      }

      // Notify that screen sharing has stopped.
      socket.emit("screenshare-stopped", ROOM_ID);
      screenStream = null;

      // Chage the button name and the action on click.
      share_button.innerHTML = "Share Screen";
      share_button.onclick = startScreenSharing;
    };

    // Notify that screen sharing has started.
    screenIdPromise.then((screenId) => {
      socket.emit("screenshare-started", ROOM_ID, screenId);
    });
    screenStream = stream;

    // Change the button name and the action on click.
    share_button.innerHTML = "Stop Sharing";
    share_button.onclick = stopScreenSharing;
  });
}

// Stop screen sharing. You just stop every media track in the stream,
// then the "oninactive" event listener will do everything else for you.
function stopScreenSharing() {
  screenStream.getTracks().forEach((track) => track.stop());
}

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

// Attach a media stream to an audio element, then append it to
// "audio-grid" element in the document.
function addAudioStream(audio, stream, audio_id) {
  audio.srcObject = stream;
  audio.addEventListener("loadedmetadata", () => {
    audio.play();
  });
  audio.setAttribute("id", audio_id);
  audioGrid.append(audio);
}

// chat
const form = document.getElementById("form");
const input = document.getElementById("input");
const messages = document.getElementById("messages");

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

/* ######### concentrate graph ############ */
// Update concentrate data.
socket.on("update-concent", function (value) {
  console.log(value);
  draw_chart(value);
});

Chart.pluginService.register({
  beforeDraw: function (chart) {
    var width = chart.chart.width,
      height = chart.chart.height,
      ctx = chart.chart.ctx;

    ctx.restore();
    var fontSize = (height / 120).toFixed(2);
    ctx.font = fontSize + "em sans-serif";
    ctx.textBaseline = "middle";

    var text = chart.config.data.datasets[0].data[0] + "%",
      textX = Math.round((width - ctx.measureText(text).width) / 2),
      textY = height / 2;

    ctx.fillText(text, textX, textY);
    ctx.save();
  },
});

var ctx = document.getElementById("myChart");
const data = {
  labels: ["Concentrate", "Not concentrate"],
  datasets: [
    {
      label: "concentrate rates",
      data: [0, 100],
      backgroundColor: ["#4169E1", "#FF5675"],
      // borderColor: ["rgba(54, 162, 235, 1)", "rgba(255, 99, 132, 1)"],
      borderWidth: 1,
    },
  ],
};
const config = {
  type: "doughnut",
  data,
  options: {
    legend: {
      display: false,
      // position: "top",
    },
    tooltips: {
      callbacks: {
        label: function (tooltipItem) {
          return tooltipItem.yLabel;
        },
      },
    },
    responsive: true,
    plugins: {
      title: {
        display: false,
        text: "Chart.js Doughnut Chart",
      },
      scales: {
        y: {
          beginAtZero: true,
        },
      },
    },
  },
};

var myChart = new Chart(ctx, config);

draw_chart = function (value) {
  if (value == null) {
    value = 100;
  }

  myChart.data.datasets.forEach((dataset) => {
    dataset.data.pop();
    dataset.data.pop();
  });

  myChart.data.datasets.forEach((dataset) => {
    dataset.data.push(value);
    dataset.data.push(100 - value);
  });

  myChart.update();
};

draw_chart(null);
