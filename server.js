const express = require("express");
const session = require("express-session");
const { v4: uuidV4 } = require("uuid");

const app = express();
const server = require("http").createServer(app);
const io = new (require("socket.io").Server)(server);

app.set("view engine", "ejs");
app.engine("html", require("ejs").renderFile);
app.use(express.static("public", { index: false }));

// body-parser middleware.
// Parses the body of HTTP requests so that you can easily access the
// contents in the body of each request(in JSON-way).
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Session management middleware.
// Introduces the notion of 'session' between a browser tab and the server.
// You may store and access user auth info(e.g. user type) in each session.
const sessionMiddleware = session({
  secret: "(*$#(!)+My cat entered this secret@9412)#$*@",
  resave: false,
  saveUninitialized: true,
});

app.use(sessionMiddleware);
io.use((socket, next) =>
  sessionMiddleware(socket.request, socket.request.res || {}, next)
);

// Maps roomId => passcode
// TODO: use a database and use UID instead of passcode.
const rooms = {};

/* ################ Express routing ################ */

// 'http://my.server/': have the user create a new room.
// REDIRECTS TO '/create-room'
app.get("/", (req, res) => {
  res.redirect("/create-room");
});

// 'http://my.server/create-room'
// ACCEPTS POST of a form with the new room's passcode.
app.get("/create-room", (req, res) => {
  // Whether this request is sent because previous creation is failed.
  let prevCreationFailed = req.session.creationFailed;
  req.session.creationFailed = false;

  res.render("create-room", {
    roomId: uuidV4(), // A new room ID
    creationFailed: prevCreationFailed || false, // Whether you previously failed.
  });
});

// POST from 'http://my.server/create-room' with a room's passcode.
// Save the { roomId: passcode } mapping on the server.
// REDIRECTS TO '/:room/presenter' if successful.
app.post("/create-room", (req, res) => {
  let roomId = req.body.roomId;
  let passcode = req.body.passcode;

  // Create a room only when those values are provided
  if (roomId && passcode) {
    if (io.sockets.adapter.rooms.has(roomId)) {
      // Redirect to '/create-room' if the room already exists.
      req.session.creationFailed = true;
      res.redirect("/create-room");
    } else {
      // Else the session is marked as 'privileged' for the room
      setPrivileged(req.session, roomId);
      req.session.creationFailed = false;

      rooms[roomId] = new Room(roomId, passcode);
      res.redirect(`/${roomId}/presenter`);
    }
  } else {
    // No passcode => redirect to '/create-room'
    req.session.creationFailed = true;
    res.redirect("/create-room");
  }
});

// 'http://my.server/:room/presenter'
// Enter a room as a presenter mode.
app.get("/:room/presenter", (req, res) => {
  let roomId = req.params.room; // Room ID from the URL

  if (isPrivileged(req.session, roomId) && rooms[roomId]) {
    // TODO: give separate scripts/html to different types of users.
    res.render("presenter-room", { roomId: roomId });
  } else {
    res.send("Wrong access!");
    // TODO: res.redirect(`/${roomId}`, ...)
  }
});

// 'http://my.server/:room'
// Lets the user join an existing room as either a supervisor or a normal participant.
// ACCEPT POST of a form with the room's passcode.
app.get("/:room", (req, res) => {
  // Whether this request is from failure of previous access.
  let prevJoinFailed = req.session.joinFailed;
  req.session.joinFailed = false;

  // If there's no such room, you cannot enter it.
  if (!io.sockets.adapter.rooms.has(req.params.room)) {
    res.send("No such room!");
  } else {
    res.render("join-room", {
      roomId: req.params.room,
      joinFailed: prevJoinFailed || false,
    });
  }
});

// POST from 'http://my.server/:room'
// Verifies if the request to join room as a supervisor
// is valid. (i.e. if the passcode matches the room)
app.post("/:room", (req, res) => {
  let roomId = req.body.roomId;
  let passcode = req.body.passcode;

  // Check if the passcode is valid for the room.
  if (roomId && passcode && rooms[roomId]?.passcode === passcode) {
    // If valid, the session is marked as 'privileged' for the room
    setPrivileged(req.session, roomId);
    req.session.joinFailed = false; // Whether the passcode is wrong.

    res.redirect(`/${roomId}/supervisor`);
  } else {
    // Wrong passcode => redirect to '/:room'
    req.session.joinFailed = true;
    res.redirect(`/${roomId}`);
  }
});

// 'http://my.server/:room/supervisor'
// The page that a supervisor will see.
app.get("/:room/supervisor", (req, res) => {
  let roomId = req.params.room;

  if (
    isPrivileged(req.session, roomId) &&
    io.sockets.adapter.rooms.has(roomId)
  ) {
    // TODO: Serve different page
    res.render("supervisor-room", { roomId: roomId });
  } else {
    res.send("Wrong access!");
    // TODO: res.redirect(`/${roomId}`, ...);
  }
});

// 'http://my.server/:room/participant'
// Anyone can enter a room given the room ID.
app.get("/:room/participant", (req, res) => {
  req.session.userType = "participant";
  // TODO: Serve different page
  res.render("room", { roomId: req.params.room });
});

/* ################ Socket.io logic ################ */
// Dictionary about student's concentrate data
// concentDict : {student1ID: [
//                  [studentId, timestamp, concentrate degree(0 or 5 or 10)], ... ],
//                student2ID: ...}
var concentDict = {};

io.on("connection", (socket) => {
  // When a presenter joins a room.
  socket.on("presenter-joined", (roomId, userId) => {
    if (isPrivileged(socket.request.session, roomId)) {
      presenterJoined(socket, roomId, userId);
    } else {
      // Wrong access!
      socket.disconnect(true);
    }
  });

  // When a supervisor joins a room.
  socket.on("supervisor-joined", (roomId, userId, priority, capacity) => {
    if (isPrivileged(socket.request.session, roomId)) {
      supervisorJoined(socket, roomId, userId, priority, capacity);
    } else {
      // Wrong access!
      socket.disconnect(true);
    }
  });

  // When a participant joins a room.
  socket.on("participant-joined", (roomId, userId) => {
    participantJoined(socket, roomId, userId);
  });

  // Client sent "message" when user click submit button. Sever sends it back to all client.
  socket.on("message", (msg) => {
    console.log("server socket msg" + msg);
    io.sockets.emit("message1", msg);
  });

  // get concentrate data from students
  socket.on("concent_data", (data) => {
    if (data[0] in concentDict) {
      concentDict[data[0]].push(data);
    } else {
      concentDict[data[0]] = [data];
    }
  });
});

/* ################ Helper functions ################ */

// Server side data structures to manage rooms.
const { Room, Supervisor, Participant } = require("./room");

// Sets up event listeners for the presenter.
function presenterJoined(socket, roomId, userId) {
  const room = rooms[roomId];

  // Room is opened and there is already a presenter => wrong access!
  if (room.isOpened && room.presenter) {
    socket.disconnect(true);
  } else {
    // Else you either start a room or re-enter as a presenter
    // A presenter is also a supervisor with infinite capacity and lowest priority.
    let presenter = new Supervisor(userId, socket, Infinity, Infinity);
    room.presenter = presenter;

    if (!room.isOpened) {
      room.isOpened = true;
    } else {
      // If the presenter has re-entered the room, make him call the
      // participants who were already there.
      socket.emit(
        "call-to",
        room.participants.map((part) => part.userId)
      );
    }

    // When the presenter is disconnected, the room still remains,
    // but some server-side data structures change.
    socket.on("disconnect", () => {
      room.presenter = null;
      room.removeSupervisor(userId);
    });

    socket.join(roomId);
    room.addSupervisor(presenter);
  }
}

// Sets up event listeners for supervisors.
function supervisorJoined(socket, roomId, userId, priority, capacity) {
  const room = rooms[roomId];

  // You cannot join a room that is not open.
  if (!room.isOpened) {
    socket.disconnect(true);
  } else {
    let supervisor = new Supervisor(userId, socket, priority, capacity);

    // When the supervisor is disconnected, let participant know
    // where to redirect their calls.
    socket.on("disconnect", () => {
      room.removeSupervisor(userId);
    });

    socket.join(roomId);
    room.addSupervisor(supervisor);
  }
}

// Sets up event listeners for normal participants.
function participantJoined(socket, roomId, userId) {
  const room = rooms[roomId];

  // You cannot join a room that is not open.
  if (!room.isOpened) {
    socket.disconnect(true);
  } else {
    let participant = new Participant(userId, socket);

    // When the participant is disconnected, the supervisor
    // screens should be re-arranged.
    socket.on("disconnect", () => {
      room.removeParticipant(userId);
      socket.broadcast.to(roomId).emit("participant-leaved", userId);
    });

    socket.join(roomId);
    room.addParticipant(participant);

    socket.broadcast.to(roomId).emit("participant-joined", userId);
  }
}

// Mark a session as privileged to a room.
// 'Privilege' is the authorization of being a
// presenter or a supervisor.
function setPrivileged(session, roomId) {
  if (!session.privilegeMap) {
    // Map from { roomID => Boolean }
    session.privilegeMap = {};
  }

  session.privilegeMap[roomId] = true;
}

// Test if a session is privileged to a given room.
function isPrivileged(session, roomId) {
  return session.privilegeMap?.[roomId] || false;
}

server.listen(8000);
