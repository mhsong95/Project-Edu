// serverHandler.js
// Defines events and behaviors on the events handled by the server.

const { Server, Socket } = require("socket.io");

// Require database and models for Room and Participant.
const rooms = require("../db");
const { Participant } = require("../models/room");

/**
 * Registers event handlers on server side event.
 * @param {Server} io
 * @param {Socket} socket
 */
module.exports = function (io, socket) {
  // Client sent "message" when user click submit button. Sever sends it back to all client.
  socket.on("message", (roomId, msg, name) => {
    console.log("server socket msg " + msg);

    io.sockets.to(roomId).emit("message1", msg, name);
  });

  // get concentrate data from students
  socket.on("concent_data", (roomId, data) => {
    let [userId, time, degree] = data;
    /**
     * @type {Participant}
     */
    let participant = rooms[roomId]?.getParticipant(userId);

    // Store the data into the right participant's data structure.
    if (participant) {
      // If there were no previous data, set summary data as it is.
      let levels = participant.concentLevels;
      let summary = participant.concentSummary;

      if (levels.length === 0) {
        levels.push({ time: time, degree: degree });

        summary.avg = degree;
        summary.enterTime = time;
        summary.dataSum = degree;
      } else {
        // Otherwise update the summary.
        levels.push({ time: time, degree: degree });

        let { enterTime, dataSum, lastData, lastTime } = summary;
        // Update average and sum.
        summary.dataSum = dataSum + (time - lastTime - 2) * lastData + degree;
        summary.avg = summary.dataSum / ((time - enterTime) * 10);
      }

      // Update last data and last time.
      summary.lastData = degree;
      summary.lastTime = time;

      // Log the updated summary and data list for the user.
      console.log(userId, summary);
      console.log(userId, levels);
    }
  });
};
