// supervisorHandler.js
// Defines events and behaviors on the events from a supervisor's socket.

const { Server, Socket } = require("socket.io");

// Require database and models for Room and Supervisor.
const rooms = require("../db");
const { Supervisor, Room } = require("../models/room");

// Helper functions
const { isPrivileged } = require("../library/library");

/**
 * Registers event handlers on supervisor's socket.
 * @param {Server} io
 * @param {Socket} socket
 */
module.exports = function (io, socket) {
  /* ##### Connection ##### */

  // When a supervisor wants to join a room.
  socket.on("supervisor-connected", (roomId, userId, priority, capacity) => {
    let room = rooms[roomId];

    // Check if the session is privileged, and the room is open.
    if (!isPrivileged(socket.request.session, roomId)) {
      // If not, emit an event informing of it.
      socket.emit("rejected", "Not authorized");
      socket.disconnect(true);
      return;
    } else if (!room?.isOpen) {
      // Check if the room is open.
      socket.emit("rejected", "Room not found");
      socket.disconnect(true);
      return;
    }

    // Setup event listener on disconnection
    socket.on("disconnect", () => {
      console.log(`Supervisor ${userId} leaved room ${roomId}`);
      room.removeSupervisor(userId);
    });

    // Join the socket to the room.
    socket.join(roomId);
    console.log(`Supervisor ${userId} joined room ${roomId}`);

    // Insert new supervisor to the room data structure.
    let supervisor = new Supervisor(userId, socket, priority, capacity);
    room.addSupervisor(supervisor);
  });
};
