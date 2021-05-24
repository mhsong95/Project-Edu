// participantHandler.js
// Defines events and behaviors on the events from a participant's socket.

const { Server, Socket } = require("socket.io");

// Require database and models for Room and Participant.
const rooms = require("../db");
const { User, Room } = require("../models/room");

// Session handlers.
const { isPrivileged } = require("../library/library");

/**
 * Registers event handlers on participant's socket.
 * @param {Server} io
 * @param {Socket} socket
 */
module.exports = function (io, socket) {
  /* ##### Connection ##### */

  // When a participant wants to join a room.
  socket.on("participant-connected", (roomId, userId, name, callback) => {
    let room = rooms[roomId];
    let participant;

    if (!room) {
      // There is no room with the given ID. Reject connection.
      socket.emit("rejected", "Room not found");
      socket.disconnect(true);
      return;
    } else if (!room.isOpen) {
      // Room is being created. Create a new room 
      // after checking if the session is privileged to create a room.
      if (!isPrivileged(socket.request.session, roomId)) {
        socket.emit("rejected", "Not authorized for the room")
        socket.disconnect(true);
        return;
      }

      // Mark the socket as a host,
      participant = new User(userId, socket, name);
      room.host = participant;
      socket.isHost = true;

      // then open the room.
      room.isOpen = true;
    } else {
      participant = new User(userId, socket, name);

      if (room.host === null && isPrivileged(socket.request.session, roomId)) {
        // If the session is privileged to a open room, the socket is now a new host.
        room.host = participant;
        socket.isHost = true;
      }
    }

    // Event listener on disconnection.
    socket.on("disconnect", () => {
      console.log(`Participant ${userId} leaved from room ${roomId}`);

      socket.broadcast.to(roomId).emit("participant-leaved", userId);
      room.removeParticipant(userId);

      if (socket.isHost) {
        // Special treatment when the disconnected user is a host.
        room.host = null;
      }
    });

    // Join the socket to the room.
    socket.join(roomId);

    // Add the participant to the room data structure,.
    room.addParticipant(participant);

    // Give the list of participants through the callback.
    let participantNames = {};
    for (let part of room.participants) {
      participantNames[part.userId] = part.name;
    }
    callback(participantNames);

    // Broadcast that a new participant has joined.
    socket.broadcast.to(roomId).emit("participant-joined", userId, name);
    console.log(`Participant ${userId} has joined room ${roomId}`);
  });
};
