const { Server, Socket } = require("socket.io");

const rooms = require("../db.js");

// Import Google Cloud client library.
const speech = require("@google-cloud/speech");

// Create a client.
const projectId = "ai-moderator-1621563494698";
const keyFilename = "../ai-moderator-1fa097a2d18f.json";
const speechClient = new speech.SpeechClient({ projectId, keyFilename });

// Options for speech recognition.
const request = {
  config: {
    encoding: "LINEAR16",
    sampleRateHertz: 16000,
    languageCode: "en-US",
    profinityFilter: false,
    enableWordTimeOffsets: true,
    /*
    speechContexts: [{
      phrases: ["hoful","shwazil"]
    }], // add your own speech context for better recognition
    */
  },
  interimResults: false, // If you want interim results, set this to true
};

/**
 * Register event handlers for speech recognition.
 * @param {Server} io
 * @param {Socket} socket
 */
module.exports = function (io, socket) {
  socket.on("startGoogleCloudStream", (roomId, userId) => {
    startRecognitionStream(socket, roomId, userId);
  });

  socket.on("binaryAudioData", (data) => {
    if (socket.recognizeStream) {
      socket.recognizeStream.write(data);
    }
  });

  socket.on("endGoogleCloudStream", () => {
    stopRecognitionStream(socket);
  });

  socket.on("disconnect", () => {
    stopRecognitionStream(socket);
  });

  /**
   * Starts a new speech recognition stream on a room.
   */
  function startRecognitionStream(socket, roomId, userId) {
    console.log(`Recognition starting for room ${roomId} by ${userId}`);

    socket.recognizeStream = speechClient
      .streamingRecognize(request)
      .on("error", (err) => {
        console.error(
          "Error when processing audio: " +
            (err && err.code ? "Code: " + err.code + " " : "") +
            (err && err.details ? err.details : "")
        );
        socket.emit("googleCloudStreamError", err);
        stopRecognitionStream(socket);
      })
      .on("data", (data) => {
        if (data.results[0]?.alternatives[0]) {
          io.sockets
            .to(roomId)
            .emit("speechData", data.results[0].alternatives[0].transcript, userId);

          console.log(`${userId}: ${data.results[0].alternatives[0].transcript}`);
        } else {
          // if end of utterance, let's restart stream
          // this is a small hack. After 65 seconds of silence, the stream will still throw an error for speech length limit
          stopRecognitionStream(socket);
          startRecognitionStream(socket, roomId, userId);
        }

        /*
        // if end of utterance, let's restart stream
        // this is a small hack. After 65 seconds of silence, the stream will still throw an error for speech length limit
        if (data.results[0] && data.results[0].isFinal) {
          stopRecognitionStream(roomId);
          startRecognitionStream(roomId);
          // console.log('restarted stream serverside');
        }
        */
      });
  }

  /**
   * Closes the recognize stream and wipes it
   */
  function stopRecognitionStream(socket) {
    if (socket.recognizeStream) {
      socket.recognizeStream.end();
    }
    socket.recognizeStream = null;
  }
};
