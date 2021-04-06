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
  /* ##### Handshaking ##### */

  // When a participant wants to join a room.
  socket.on("participant-connected", (roomId) => {
    participantConnected(socket, roomId);
  });

  // Data is synchronized, and the participant is ready.
  socket.on("participant-ready", (roomId, userId, name) => {
    participantReady(socket, roomId, userId, name);
  });
};

/**
 * Check if the room is open, and get the participant ready
 * by synchronizing data.
 * @param {Socket} socket
 * @param {String} roomId
 */
const participantConnected = (socket, roomId) => {
  /**
   * @type {Room}
   */
  let room = rooms[roomId];

  // Room not found.
  if (!room?.isOpen) {
    socket.emit("rejected", "room-not-found");
    socket.disconnect(true);
    return;
  }

  // Synchronize data with server.

  let presenter = null;
  if (room.presenter) {
    presenter = { userId: room.presenter.userId, name: room.presenter.name };
  }
  let supervisors = room.supervisors.map((sup) => sup.userId);
  let participants = room.participants.map((part) => {
    return {
      userId: part.userId,
      name: part.name,
    };
  });

  // Join the socket to the room:
  // The participant now can synchronize data with server.
  socket.join(roomId);

  // Send the room information.
  socket.emit("get-ready", presenter, supervisors, participants);
};

/**
 * The participant is now ready to receive calls.
 * Store data structures, broadcast that
 * the participant has joined.
 * @param {Socket} socket
 * @param {String} roomId
 * @param {String} userId
 * @param {String} name
 * @returns
 */
const participantReady = (socket, roomId, userId, name) => {
  let room = rooms[roomId];

  // Room not found.
  if (!room?.isOpen) {
    socket.emit("rejected", "room-not-found");
    socket.disconnect(true);
    return;
  }

  // Setup event listeners.
  socket.on("disconnect", () => {
    socket.broadcast.to(roomId).emit("participant-leaved", userId);
    room.removeParticipant(userId);
  });

  // Broadcast that a new participant has joined.
  socket.broadcast.to(roomId).emit("participant-joined", userId, name);

  // Add data structure for a participant, then reassign the participants.
  let participant = new Participant(userId, socket, name);
  room.addParticipant(participant);
};
