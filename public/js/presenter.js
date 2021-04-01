const socket = io("/");
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

let presenterId = ""; // ID as a presenter.
let supervisorId = ""; // ID as a supervisor.

// Resolve IDs.
presenterPeer.on("open", (id) => {
  presenterId = id;
});
supervisorPeer.on("open", (id) => {
  supervisorId = id;
});

const screen_vid = document.getElementById("screen-video");
/* ####### Data structures ####### */

// Dictionary of participants' names.
// participantDict: { user1ID: user1Name, user2ID: user2Name, ... }
const participantDict = {};
// Dictionary of audiences' (those receiving your stream) call objects.
// audiences: { user1ID: call1, user2ID: call2, ... }
const audiences = {};
// Dictionary of observees' (those being watched by you) call objects.
// observees: { user1ID: call1, user2ID: call2, ... }
const observees = {};
navigator.mediaDevices.getDisplayMedia().then((stream) => {
  screen_vid.srcObject = stream;
  screen_vid.addEventListener("loadedmetadata", () => {
    screen_vid.play();
  });
  socket.on("participant-joined", (userId) => {
    console.log(`Participant joined: ${userId}`);

    // Call the participant to provide your stream.
    callParticipant(userId, stream, true);
  });

  // When this presenter has re-entered to the room,
  // the server will make you to call those participants
  // who were already in the room.
  socket.on("call-to", (peers) => {
    for (let userId of peers) {
      callParticipant(userId, stream, true);
    }
  });
});

/* ####### socket.io data ####### */

// The name of this user.
let myName = prompt("Enter your name", "anonymous");

// Whether the presenter is ready to make/accept calls.
let isReady = false;

// Now you are possible to identify participants: You are ready.
socket.on("get-ready", (participants) => {
  for (let part of participants) {
    participantDict[part.userId] = part.name;
  }
  isReady = true;

  // Notify that data is synchronized, and you are ready to go.
  socket.emit("presenter-ready", ROOM_ID, presenterId, supervisorId, myName);
});

// Error cases: Not authorized or presenter already exists.
socket.on("rejected", (msg) => {
  alert(msg);
  location.href = `../${ROOM_ID}`; // redirect to room joining page.
});

const myVideo = document.createElement("video");
myVideo.muted = true;

navigator.mediaDevices
  .getUserMedia({
    video: true,
    audio: true,
  })
  .then((stream) => {
    addVideoStream(myVideo, stream, presenterId);

    /* ####### Peer Call establishments ####### */

    // Call from a participant to the PRESENTER (audio only)
    presenterPeer.on("call", (call) => {
      // Reject the call if you cannot identify the caller.
      if (participantDict[call.peer] === undefined) {
        call.close();
        return;
      }

      call.answer(stream); // Give your stream.
      const audio = document.createElement("audio");

      call.on("stream", (userAudioStream) => {
        addAudioStream(audio, userAudioStream, call.peer);
      });

      call.on("close", () => {
        audio.remove();
      });

      audiences[call.peer] = call;
    });

    // Call from a participant to the SUPERVISOR (video only)
    supervisorPeer.on("call", (call) => {
      call.answer(); // NO stream.
      const video = document.createElement("video");

      call.on("stream", (userVideoStream) => {
        addVideoStream(video, userVideoStream, call.peer);
      });

      call.on("close", () => {
        video.remove();
      });

      observees[call.peer] = call;
    });

    /* ####### Socket event handling ####### */

    // When a new participant has joined a room.
    socket.on("participant-joined", (userId, name) => {
      console.log(`Participant joined: ${userId}, ${name}`);

      participantDict[userId] = name;
      if (isReady) {
        // Call the participant only if him/her can identify you.
        callParticipant(userId, stream, false);
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

      if (participantDict[userId]) {
        delete participantDict[userId];
      }
    });

    // Notify the server that you want to join the room.
    socket.emit("presenter-connected", ROOM_ID);
  });

function addVideoStream(video, stream, video_id) {
  video.srcObject = stream;
  video.addEventListener("loadedmetadata", () => {
    video.play();
  });
  video.setAttribute("id", video_id);
  videoGrid.append(video);
}

function addAudioStream(audio, stream, audio_id) {
  audio.srcObject = stream;
  audio.addEventListener("loadedmetadata", () => {
    audio.play();
  });
  audio.setAttribute("id", audio_id);
  audio.setAttribute("controls", "controls");
  audioGrid.append(audio);
}

// Get concentrate data from participant and change border color of their video.
supervisorPeer.on("connection", function (conn) {
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

// Call a new participant. The participant will answer with audio stream.
function callParticipant(userId, stream, screen) {
  const call = presenterPeer.call(userId, stream, [screen]);
  const audio = document.createElement("audio");

  call.on("stream", (userAudioStream) => {
    addAudioStream(audio, stream, userId);
  });

  call.on("close", () => {
    audio.remove();
  });

  audiences[userId] = call;
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

/* ######### concentrate graph ############ */
// Update concentrate data.
socket.on("update-concent", function (value) {
  console.log(value);
  draw_chart(value);
});

// Radialize the colors
Highcharts.setOptions({
  colors: Highcharts.map(Highcharts.getOptions().colors, function (color) {
    return {
      radialGradient: {
        cx: 0.5,
        cy: 0.3,
        r: 0.7,
      },
      stops: [
        [0, color],
        [1, Highcharts.color(color).brighten(-0.3).get("rgb")], // darken
      ],
    };
  }),
});

draw_chart = function (value) {
  if (value == null) {
    value = 100;
  }

  // Build the chart
  Highcharts.chart("container", {
    chart: {
      plotBackgroundColor: null,
      plotBorderWidth: null,
      plotShadow: false,
      type: "pie",
      animation: false,
    },
    title: {
      text: null,
    },
    tooltip: {
      enabled: false,
    },
    plotOptions: {
      pie: {
        allowPointSelect: false,
        cursor: "pointer",
        dataLabels: {
          enabled: true,
          format: "<b>{point.name}</b><br>{point.percentage:.1f} %",
          distance: -40,
        },
      },
      series: {
        animation: false,
        states: {
          hover: {
            enabled: false,
          },
        },
      },
    },
    series: [
      {
        name: "Share",
        data: [
          { name: "Good", y: value },
          { name: "Bad", y: 100 - value },
        ],
      },
    ],
    credits: {
      enabled: false,
    },
  });
};

draw_chart(null);

function createLabeledVideoElement() {
  let div = document.createElement("div");
  let video = document.createElement("video");
  let label = document.createElement("label");

  div.append(video);
  div.append(label);

  return {
    div: div,
    video: video,
    label: label,
  };
}
