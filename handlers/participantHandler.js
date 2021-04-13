// participantHandler.js
// Defines events and behaviors on the events from a participant's socket.

const { Server, Socket } = require("socket.io");

// Require database and models for Room and Participant.
const rooms = require("../db");
const { Participant, Room } = require("../models/room");

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

    // Check if there is a room.
    if (!room?.isOpen) {
      socket.emit("rejected", "Room not found");
      socket.disconnect(true);
      return;
    }

    // Event listener on disconnection.
    socket.on("disconnect", () => {
      socket.broadcast.to(roomId).emit("participant-leaved", userId);
      console.log(`Participant ${userId} leaved from room ${roomId}`);

      room.removeParticipant(userId);
    });

    // Join the socket to the room.
    socket.join(roomId);

    // Give the presenter's information so that he/she can accept calls.
    let presenterInfo = null;
    if (room.presenter) {
      presenterInfo = {
        presenterId: room.presenter.userId,
        screenId: room.presenter.screenId,
        name: room.presenter.name,
      };
    }
    callback(presenterInfo);

    // Broadcast that a new participant has joined.
    socket.broadcast.to(roomId).emit("participant-joined", userId, name);
    console.log(`Participant ${userId} has joined room ${roomId}`);

    // Add the participant to the room data structure, 
    // then rearrange participants.
    let participant = new Participant(userId, socket, name);
    room.addParticipant(participant);
  });
};
