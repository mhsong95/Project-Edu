// serverHandler.js
// Defines events and behaviors on the events handled by the server.

const { Server, Socket } = require("socket.io");

// Require database and models for Room and Participant.
const rooms = require("../db");
const { Participant } = require("../models/room");
const {v4: uuidV4} = require("uuid");

/**
 * Registers event handlers on server side event.
 * @param {Server} io
 * @param {Socket} socket
 */
module.exports = function (io, socket) {
  // Client sent "message" when user click submit button. Sever sends it back to all client.
  socket.on("message", (roomId, type, uuid,  msg, name) => {
    console.log("server socket msg " + msg);
    if(type == "question"){
      io.sockets.to(roomId).emit("question", `${uuidV4()}`, msg, name);
    }
    else if(type == "answer"){
      io.sockets.to(roomId).emit("answer", uuid, msg, name);
    }

    io.sockets.to(roomId).emit("message1", msg, name);
  });
};
