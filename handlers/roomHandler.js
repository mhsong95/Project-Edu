// Defines behaviors on room creation and deletion.
// This module should be required once when the server initializes.

const { Server, Socket } = require("socket.io");

// Require database and models for Room and Participant.
const rooms = require("../db");

/**
 * Registers event handlers on room creation and deletion.
 * @param {Server} io
 * @param {Socket} socket
 */
module.exports = function (io) {
  io.of("/").adapter.on("delete-room", (roomId) => {
    if (rooms[roomId]) {
      if (rooms[roomId].speakTimeout) {
        // Clear timer for last paragraph, if it exists.
        clearTimeout(rooms[roomId].speakTimeout);
      }
      delete rooms[roomId];
    }
  });
};