// presenterHandler.js
// Defines events and behaviors on the events from a presenter's socket.

const { Server, Socket } = require("socket.io");

// Require database and models for Room and Presenter.
const rooms = require("../db");
const { Presenter, Supervisor, Room } = require("../models/room");

// Helper functions
const { isPrivileged } = require("../library/library");

/**
 * Registers event handlers on presenter's socket.
 * @param {Server} io
 * @param {Socket} socket
 */
module.exports = function (io, socket) {
  /* ##### Connection ##### */

  // When a presenter wants to join a room.
  socket.on("presenter-connected", (roomId, presenterId, name, callback) => {
    let room = rooms[roomId];

    // Check if the session is privileged for the room.
    if (!isPrivileged(socket.request.session, roomId)) {
      // If not, reject the connection.
      socket.emit("rejected", "You're not authorized for the room");
      socket.disconnect(true);
      return;
    } else if (room.isOpen && room.presenter) {
      // If there is already a presenter, also reject the connection.
      socket.emit("rejected", "Presenter already exists");
      socket.disconnect(true);
      return;
    }

    // Periodically send average concentrate data to presenter.
    let update_concent = setInterval(function () {
      let sumConcent = 0;
      let sumTime = 0;
      for (let participant of room.participants) {
        sumConcent = sumConcent + participant.concentSummary.avg;
        sumTime =
          sumTime +
          participant.concentSummary.lastTime -
          participant.concentSummary.enterTime;
      }
      socket.emit("update-concent", (sumConcent / (sumTime * 10)) * 100);
    }, 10000);

    // Setup event listener on disconnection.
    socket.on("disconnect", () => {
      // Stop sending average concentration.
      clearInterval(update_concent);

      // Clear the presenter from the room's data structure and broadcast.
      room.presenter = null;
      socket.broadcast.to(roomId).emit("screenshare-stopped");
      socket.broadcast.to(roomId).emit("presenter-leaved");

      console.log(`Presenter ${presenterId} leaved from room ${roomId}`);
    });

    // Update the room's presenter.
    let presenter = new Presenter(presenterId, socket, name);
    room.presenter = presenter;

    // Join the socket to the room.
    socket.join(roomId);

    // Give the list of participants so that he/she can accept calls from them.
    let participantDict = {};
    if (room.isOpen) {
      for (let part of room.participants) {
        participantDict[part.userId] = part.name;
      }
    }
    callback(participantDict);

    if (!room.isOpen) {
      // Open the room if it is not already open.
      room.isOpen = true;

      // Periodically sort participants among supervisors at room creation.
      let sortParticipants = setInterval(function () {
        // Also try deleting the room.
        tryDeleteRoom(room, sortParticipants);
        room.reassignParticipants(true);
      }, 60 * 1000); // Every 60 seconds.
    } else {
      // Otherwise broadcast that a new presenter has joined.
      socket.broadcast.to(roomId).emit("presenter-joined", presenterId, name);
    }

    console.log(`Presenter ${presenterId} joined room ${roomId}`);

    // If no one is in the room, delete the room.
    function tryDeleteRoom(room, intervalId) {
      if (
        !room.presenter &&
        room.participants.length === 0 &&
        room.supervisors.length === 0
      ) {
        console.log(`Room ${room.roomId} being deleted.`);

        clearInterval(intervalId);
        delete rooms[room.roomId];
      }
    }
  });

  /* ##### Screen sharing ##### */

  socket.on("screenshare-started", (roomId, screenId) => {
    let room = rooms[roomId];

    // Authenticate the user.
    if (!isPrivileged(socket.request.session, roomId) || !room?.isOpen) {
      // If not authorized, reject the connection.
      socket.emit("rejected", "not-authorized");
      socket.disconnect(true);
      return;
    }

    // Update presenter's screenId from null to given ID.
    let presenter = room.presenter;
    presenter.screenId = screenId;

    // Broadcast to the room.
    socket.broadcast.to(roomId).emit("screenshare-started", screenId);
    console.log(`Screen sharing on room ${roomId} started by ${screenId}`);
  });

  socket.on("screenshare-stopped", (roomId) => {
    let room = rooms[roomId];

    // Authenticate the user.
    if (!isPrivileged(socket.request.session, roomId) || !room?.isOpen) {
      // If not, emit an event informing of it.
      socket.emit("rejected", "not-authorized");
      socket.disconnect(true);
      return;
    }

    // Set presenter's screenId to null.
    let presenter = room.presenter;
    presenter.screenId = null;

    // Broadcast to the room.
    socket.broadcast.to(roomId).emit("screenshare-stopped");
    console.log(`Screen sharing on room ${roomId} stopped`);
  });
};
