const express = require("express");
const app = express();

/* VSCode intellisense does not work
const server = require('http').Server(app)
const io = require('socket.io')(server)
*/
const server = require("http").createServer(app);
const io = new (require("socket.io").Server)(server);

const { v4: uuidV4 } = require("uuid");
var url = require("url");

app.set("view engine", "ejs");
app.engine("html", require("ejs").renderFile);
app.use(express.static("public"));

app.get("/", (req, res) => {
  res.render("../public/index.html");
});

app.get("/create", (req, res) => {
  res.redirect(`/${uuidV4()}`);
});

app.get("/:room", (req, res) => {
  res.render("room", { roomId: req.params.room });
});

io.on("connection", (socket) => {
  socket.on("join-room", (roomId, userId) => {
    // If the room roomId does not exist, the user is the creator of the room.
    // You can signal him/her that you are a creator.
    if (!io.sockets.adapter.rooms.has(roomId)) {
      socket.join(roomId);
      socket.emit("room-created");
    } else {
      socket.join(roomId);
      socket.broadcast.to(roomId).emit("user-connected", userId);
    }
    console.log(roomId, userId);

    socket.on("disconnect", () => {
      socket.broadcast.to(roomId).emit("user-disconnected", userId);
    });
  });

  // client sent "message" when user click submit button. Sever sends it back to all client.
  socket.on("message", (msg) => {
    console.log("server socket msg" + msg);
    io.sockets.emit("message1", msg);
  });
});

server.listen(8000);
