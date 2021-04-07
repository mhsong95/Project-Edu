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
  /* ##### Handshaking ##### */

  // When a presenter wants to join a room.
  socket.on("presenter-connected", (roomId) => {
    presenterConnected(socket, roomId);
  });

  // By this time, the presenter is able to make/accept calls to/from participants.
  socket.on("presenter-ready", (roomId, presenterId, supervisorId, name) => {
    presenterReady(socket, roomId, presenterId, supervisorId, name);
  });
};

/**
 * Authenticate the user, join the user to the room,
 * make the user get ready for interactions.
 * @param {Socket} socket
 * @param {String} roomId
 * @param {String} userId
 * @param {String} name
 */
const presenterConnected = (socket, roomId) => {
  /**
   * @type {Room}
   */
  let room = rooms[roomId];

  // Check if the session is privileged, and there's no presenter.
  if (!isPrivileged(socket.request.session, roomId)) {
    // If not, emit an event informing of it.
    socket.emit("rejected", "not-authorized");
    socket.disconnect(true);
    return;
  } else if (room.isOpen && room.presenter) {
    // If there is already a presenter, also reject.
    socket.emit("rejected", "presenter-exists");
    socket.disconnect(true);
    return;
  }

  // If re-entering the room, let the presenter get ready for calls.
  let participants = []; // The list of participants to send.
  if (room.isOpen) {
    participants = room.participants.map((part) => {
      return {
        userId: part.userId,
        name: part.name,
      };
    });
  }

  // Join the socket to the room:
  // The presenter is now able to synchronize data with the server,
  // but cannot make or receive calls.
  socket.join(roomId);

  // Send the participant list.
  socket.emit("get-ready", participants);
};

/**
 * The presenter is now ready to make/receive calls.
 * Store data structures, open the room or broadcast that
 * the presenter has joined.
 * @param {Socket} socket
 * @param {String} roomId
 * @param {String} userId
 * @param {String} name
 * @returns
 */
const presenterReady = (socket, roomId, presenterId, supervisorId, name) => {
  let room = rooms[roomId];

  // Check if the session is privileged, and there's no presenter.
  if (!isPrivileged(socket.request.session, roomId)) {
    // If not, emit an event informing of it.
    socket.emit("rejected", "not-authorized");
    socket.disconnect(true);
    return;
  } else if (room.isOpen && room.presenter) {
    // If there is already a presenter, also rejected.
    socket.emit("rejected", "presenter-exists");
    socket.disconnect(true);
    return;
  }

  // Setup event listeners.
  socket.on("disconnect", () => {
    room.presenter = null;
    socket.broadcast.to(roomId).emit("presenter-leaved");
    room.removeSupervisor(supervisorId);
    clearInterval(update_concent); // Stop updating.
  });

  // Data structures for presenter
  let presenter = new Presenter(presenterId, socket, name);
  room.presenter = presenter;

  // Open the room if it is not already open.
  if (!room.isOpen) {
    room.isOpen = true;

    // Periodically sort participants among supervisors at room creation.
    let sortParticipants = setInterval(function () {
      // Also try deleting the room.
      tryDeleteRoom(room, sortParticipants);
      room.reassignParticipants(true);
    }, 60 * 1000); // Every 60 seconds.
  } else {
    // Otherwise broadcast that the presenter has joined.
    socket.broadcast.to(roomId).emit("presenter-joined", presenterId, name);
  }

  // Presenter is also a supervisor with highest priority and infinite capacity.
  let supervisor = new Supervisor(supervisorId, socket, Infinity, Infinity);
  room.addSupervisor(supervisor);

  // Send average concentrate data to presenter.
  var update_concent = setInterval(function () {
    var sumConcent = 0;
    var sumTime = 0;
    for (let participant of room.participants) {
      sumConcent = sumConcent + participant.concentSummary.avg;
      sumTime =
        sumTime +
        participant.concentSummary.lastTime -
        participant.concentSummary.enterTime;
    }
    socket.emit("update-concent", (sumConcent / (sumTime * 10)) * 100);
  }, 10000);

  // If no one is in the room, delete the room.
  function tryDeleteRoom(room, intervalId) {
    if (
      !room.presenter &&
      room.participants.length === 0 &&
      room.supervisors.length === 0
    ) {
      clearInterval(intervalId);
      delete rooms[room.roomId];
    }
  }
};
