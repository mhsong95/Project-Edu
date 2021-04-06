// supervisorHandler.js
// Defines events and behaviors on the events from a supervisor's socket.

const { Server, Socket } = require("socket.io");

// Require database and models for Room and Supervisor.
const { rooms, avgDict, concentDict } = require("../db");
const { Supervisor, Room } = require("../models/room");

// Helper functions
const { isPrivileged } = require("../library/library");

/**
 * Registers event handlers on supervisor's socket.
 * @param {Server} io
 * @param {Socket} socket
 */
module.exports = function (io, socket) {
  /* ##### Handshaking ##### */

  // When a supervisor wants to join a room.
  socket.on("supervisor-connected", (roomId) => {
    supervisorConnected(socket, roomId);
  });

  // Data is synchronized, and the supervisor is ready.
  socket.on("supervisor-ready", (roomId, userId, priority, capacity) => {
    supervisorReady(socket, roomId, userId, priority, capacity);
  });
};

/**
 * Authenticate the user, join the user to the room,
 * make the user get ready for interactions.
 * @param {Socket} socket
 * @param {String} roomId
 */
const supervisorConnected = (socket, roomId) => {
  /**
   * @type {Room}
   */
  let room = rooms[roomId];

  // Check if the session is privileged, and the room is open.
  if (!isPrivileged(socket.request.session, roomId)) {
    // If not, emit an event informing of it.
    socket.emit("rejected", "not-authorized");
    socket.disconnect(true);
    return;
  } else if (!room?.isOpen) {
    // Check if the room is open.
    socket.emit("rejected", "room-not-found");
    socket.disconnect(true);
    return;
  }

  // Participant list.
  let participants = room.participants.map((part) => {
    return {
      userId: part.userId,
      name: part.name,
    };
  });

  // Join the socket to the room:
  // The supervisor now can synchronize participant data.
  socket.join(roomId);

  // Send the participant list.
  socket.emit("get-ready", participants);
};

/**
 * The supervisor is now ready to receive calls.
 * Store data structures, broadcast that
 * the supervisor has joined.
 * @param {Socket} socket
 * @param {String} roomId
 * @param {String} userId
 * @param {String} name
 * @returns
 */
const supervisorReady = (socket, roomId, userId, priority, capacity) => {
  let room = rooms[roomId];

  // Check if the session is privileged, and the room is open.
  if (!isPrivileged(socket.request.session, roomId)) {
    // If not, emit an event informing of it.
    socket.emit("rejected", "not-authorized");
    socket.disconnect(true);
    return;
  } else if (!room?.isOpen) {
    // Check if the room is open.
    socket.emit("rejected", "room-not-found");
    socket.disconnect(true);
    return;
  }

  // Setup event listeners.
  socket.on("disconnect", () => {
    socket.broadcast.to(roomId).emit("supervisor-leaved", userId);
    room.removeSupervisor(userId);
  });

  // Broadcast that a new supervisor has joined.
  socket.broadcast.to(roomId).emit("supervisor-joined", userId);

  // Add data structure for a supervisor, then reassign the participants.
  let supervisor = new Supervisor(userId, socket, priority, capacity);
  room.addSupervisor(supervisor);
};
