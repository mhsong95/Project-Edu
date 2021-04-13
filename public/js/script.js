const socket = io("/");
const videoGrid = document.getElementById("video-grid");
let questions = {};
let colors = ["#D88559", "#D159D8", "#595BD9", "#5CD859", "#8022D9", "#2D3436", "#24A6D9", "#A7CBD9"];

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
var det = document.getElementById("partlist");
var cont = document.createElement("text");
cont.textContent = myName;
det.appendChild(cont);
var newline = document.createElement("br");
det.appendChild(newline);

// Whether the participant is ready to make/accept calls.
let isReady = false;

socket.on("get-ready", (pres, sups, parts) => {
  presenterId = pres.userId;
  screenId = pres.screenId;
  presenterName = pres.name;
  supervisors = supervisors.concat(sups);

  for (let part of parts) {
    participantDict[part.userId] = part.name;
    var det = document.getElementById("partlist");
    var cont = document.createElement("text");
    cont.textContent = part.name;
    det.appendChild(cont);
    var newline = document.createElement("br");
    det.appendChild(newline);
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
  var det = document.getElementById("partlist");
  var cont = document.createElement("text");
  cont.textContent = name;
  det.appendChild(cont);
  var newline = document.createElement("br");
  det.appendChild(newline);
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
    addVideoStream(prof_cam, userVideoStream);
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
    socket.emit("message", ROOM_ID, "question", null, input.value, myName);
    console.log("listener: " + input.value);
    input.value = "";
  }
});

function showbig(id){
  document.getElementById("questions").style.display = "none";
  document.getElementById(id).style.display = "block";
}

function closenres(id){
  document.getElementById(id).style.display = "none";
  document.getElementById("questions").style.display = "block";
}
function sendnback(uuid){
  var answer = document.getElementById(uuid + "-ans").value;
  if(answer){
    socket.emit("message", ROOM_ID, "answer", uuid, answer, myName);
    input.value = "";
  }
  var id = uuid + "--detail";
  document.getElementById(id).style.display = "none";
  document.getElementById("questions").style.display = "block";
}

function doupdate(uuid){
  var det = document.getElementById(uuid + "-content");
  det.innerHTML = "";
  lis = questions[uuid];
  if(lis.length > 2){
    for(var i = 2; i < lis.length; i++){
      var cont = document.createElement("text");
      cont.textContent = lis[i][0] + ": " + lis[i][1];
      det.appendChild(cont);
      var newline = document.createElement("br");
      det.appendChild(newline);
    }
  }
}

function partilist(){
  var e = document.getElementById("partlist");
  if(e.style.display == "none"){
    e.style.display = "block";
  }
  else{
    e.style.display = "none";
  }
}

// Receive message1 from server.js and add given msg to all client
socket.on("question", function (uuid, msg, name) {
  console.log("question arrived");
  questions[uuid] = [];
  questions[uuid].push(msg, name);
  //entry information
  var fr = document.createElement("div");
  var title = document.createElement("text");
  var btn = document.createElement("button");
  fr.className = "fr";
  fr.id = uuid;
  fr.style.height = "20%";
  len = Object.keys(questions).length;
  fr.style.backgroundColor = colors[len%8];
  title.className = "tit";
  title.textContent = msg;
  fr.appendChild(title);
  btn.className = "btn";
  btn.textContent = "Detail";
  fr.appendChild(btn);

  document.getElementById("questions").appendChild(fr);
//detail information
  list = questions[uuid];
  var biginfo = document.createElement("div");
  biginfo.id = uuid + "--detail"
  biginfo.className = "biginfo";
  biginfo.style.backgroundColor = colors[len%8];
  document.getElementById("main").appendChild(biginfo);

  var btitle = document.createElement("text");
  btitle.textContent = list[0];
  btitle.className = "btitle";
  biginfo.appendChild(btitle);

  var cont = document.createElement("div");
  cont.id = uuid + "-content";
  biginfo.appendChild(cont);

  var inp = document.createElement("input");
  inp.id = uuid + "-ans";
  inp.className = "inp";
  inp.placeholder = "Answer";
  biginfo.appendChild(inp);
  var sub = document.createElement("button");
  sub.id = uuid + "-sub";
  sub.className = "sub";
  sub.textContent = "Submit";
  sub.onclick = function(){
    sendnback(uuid);
  }
  var clobtn = document.createElement("button");
  clobtn.textContent = "Close";
  clobtn.className = "clobtn";
  clobtn.onclick = function(){
    closenres(biginfo.id);
  }
  biginfo.appendChild(sub);
  biginfo.appendChild(clobtn);
  biginfo.style.display = "none";

  btn.onclick = function(){
    showbig(biginfo.id);
  }
});

socket.on("answer", function (uuid, msg, name) {
  console.log("answer arrived");
  var queslist = questions[uuid];
  queslist.push([name, msg])
  console.log(questions);
  doupdate(uuid);
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
