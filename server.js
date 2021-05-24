const express = require("express");
const session = require("express-session");
const createError = require("http-errors");
const logger = require("morgan");
const path = require("path");

// HTTPS bypassing (Use only for DEVELOPMENT!!)
const fs = require("fs");
const options = {
  key: fs.readFileSync("fake-keys/private.pem"),
  cert: fs.readFileSync("fake-keys/private.crt"),
  ca: fs.readFileSync("fake-keys/rootCA.pem"),
  requestCert: false,
  rejectUnauthorized: false,
};

const app = express(); // Express server
const server = require("https").createServer(options, app); // HTTP server
const io = new (require("socket.io").Server)(server, {  // Socket.io server
  transports: [ "websocket" ],
}); // Force WebSocket transport to assure in-order arrival of events.

// Require routers
const indexRouter = require("./routes/index");
const roomRouter = require("./routes/room");

// Initialize database
const db = require("./db");

// View engine setup.
app.set("views", path.join(__dirname, "views"));
app.set("view engine", "ejs");
app.engine("html", require("ejs").renderFile);

// Logger
app.use(logger("dev"));

// body-parser middleware: you can use "req.body.form_field" in controllers.
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Session management middleware: you can use "req.session" as the session.
const sessionMiddleware = session({
  secret: "(*$#(!)+My cat entered this secret@9412)#$*@",
  resave: false,
  saveUninitialized: true,
});

app.use(sessionMiddleware);
io.use((socket, next) =>
  sessionMiddleware(socket.request, socket.request.res || {}, next)
);

// express.static middleware.
app.use(express.static(path.join(__dirname, "public")));

// Setup routes for paths under "/" and "/room";
app.use("/", indexRouter);
app.use("/room", roomRouter);

/* ################ Socket.io logic ################ */

// Require socket event handlers.
const registerParticipantHandler = require("./handlers/participantHandler");
const registerServerHandler = require("./handlers/serverHandler");
const registerSpeechHandler = require("./handlers/speechHandler");
const registerRoomHandler = require("./handlers/roomHandler");

registerRoomHandler(io);
io.on("connection", (socket) => {
  registerParticipantHandler(io, socket);
  registerServerHandler(io, socket);
  registerSpeechHandler(io, socket);
});

// catch 404 and forward to error handler
app.use(function (req, res, next) {
  next(createError(404));
});

// error handler
app.use(function (err, req, res, next) {
  // set locals, only providing error in development
  res.locals.message = err.message;
  res.locals.error = req.app.get("env") === "development" ? err : {};

  // render the error page
  res.status(err.status || 500);
  res.render("error");
});

server.listen(8000);
