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
const screenPeer = new Peer(undefined, {
  host: "/",
  port: "8080",
});

let presenterId = ""; // ID as a presenter.
let supervisorId = ""; // ID as a supervisor.
var screenID = "";

// Resolve IDs.
presenterPeer.on("open", (id) => {
  presenterId = id;
});
supervisorPeer.on("open", (id) => {
  supervisorId = id;
});
screenPeer.on("open", (id) => {
  screenID = id;
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

Promise.all([
  navigator.mediaDevices.getDisplayMedia(),
  navigator.mediaDevices.getUserMedia({
    video: true,
    audio: true,
  }),
]).then(([screenStream, presenterStream]) => {
  addVideoStream(screen_vid, screenStream, screenID, (screen = true));
  addVideoStream(myVideo, presenterStream, presenterId);

  // Call from a participant to the PRESENTER (audio only)
  presenterPeer.on("call", (call) => {
    // Reject the call if you cannot identify the caller.
    if (participantDict[call.peer] === undefined) {
      call.close();
      return;
    }

    call.answer(presenterStream); // Give your stream.
    const audio = document.createElement("audio");

    call.on("stream", (userAudioStream) => {
      addAudioStream(audio, userAudioStream, call.peer);
    });

    call.on("close", () => {
      audio.remove();
    });

    audiences[call.peer] = call;
  });

  // Call from a participant to the SCREEN (empty stream).
  screenPeer.on("call", (call) => {
    // Reject the call if you cannot identify the caller.
    if (participantDict[call.peer] === undefined) {
      call.close();
      return;
    }

    call.answer(screenStream); // Give your stream.
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

  // When a new participant has joined a room.
  socket.on("participant-joined", (userId, name) => {
    console.log(`Participant joined: ${userId}, ${name}`);

    participantDict[userId] = name;
    if (isReady) {
      // Call the participant only if him/her can identify you.
      callParticipant(userId, presenterStream, false);
      callParticipant(userId, screenStream, true);
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

function addVideoStream(video, stream, video_id, screen = false) {
  video.srcObject = stream;
  video.addEventListener("loadedmetadata", () => {
    video.play();
  });
  video.setAttribute("id", video_id);

  if (!screen) {
    videoGrid.append(video);
  }
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
  let peer = screen ? screenPeer : presenterPeer;

  const call = peer.call(userId, stream, {
    metadata: { scn: screen },
  });
  const audio = document.createElement("audio");

  if (!screen) {
    call.on("stream", (userAudioStream) => {
      addAudioStream(audio, userAudioStream, userId);
    });

    call.on("close", () => {
      audio.remove();
    });

    audiences[userId] = call;
  }
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
