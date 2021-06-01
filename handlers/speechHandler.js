const { Server, Socket } = require("socket.io");

const rooms = require("../db.js");

// Interface between audio input and recognizeStream.
const { Writable } = require("stream");
// For summary requests
const req = require("request");

// Import Google Cloud client library.
const speech = require("@google-cloud/speech");

// Create a client.
const projectId = "ai-moderator-1621563494698";
const keyFilename = "../ai-moderator-1fa097a2d18f.json";
const speechClient = new speech.SpeechClient({ projectId, keyFilename });

/**
 * Register event handlers for speech recognition.
 * @param {Server} io
 * @param {Socket} socket
 */
module.exports = function (io, socket) {
  // Options for speech recognition.
  const request = {
    config: {
      encoding: "LINEAR16",
      sampleRateHertz: 16000,
      languageCode: "en-US",
      enableAutomaticPunctuation: true, // Automatic punctuation
      /*
      speechContexts: [
        {
          phrases: ["hoful", "shwazil"],
        },
      ], // add your own speech context for better recognition
      */
    },
    interimResults: true, // If you want interim results, set this to true
  };

  // Variables for maintaining infinite stream of recognition.
  const streamingLimit = 290000; // streaming limit in ms. (~5 minutes)
  let recognizeStream = null;
  let restartCounter = 0;
  let audioInput = [];
  let lastAudioInput = [];
  let resultEndTime = 0;
  let isFinalEndTime = 0;
  let finalRequestEndTime = 0;
  let newStream = true;
  let bridgingOffset = 0;
  let lastTranscriptWasFinal = false;

  // Starts a new speech recognition stream on a room.
  function startStream(roomId, userId) {
    console.log(`Recognition starting by ${userId} in room ${roomId}.`);

    // Clear current audioInput
    audioInput = [];
    // Initiate (Reinitiate) a recognize stream
    recognizeStream = speechClient
      .streamingRecognize(request)
      .on("error", (err) => {
        if (err.code === 11) {
          // When streaming limit is exceeded, just restart stream.
          restartStream(roomId, userId);
        } else {
          console.error(
            "Error when processing audio: " +
              (err && err.code ? "Code: " + err.code + " " : "") +
              (err && err.details ? err.details : "")
          );
          socket.emit("recognitionError", err);
        }
      })
      .on("data", (stream) => {
        speechCallback(stream, roomId, userId);
      });

    // Restart stream when streamingLimit expires
    let restartTimeout = setTimeout(() => {
      restartStream(roomId, userId);
    }, streamingLimit);

    // Stop the recognition stream and stop restarting it on disconnection.
    socket.on("disconnect", () => {
      stopStream();
      clearTimeout(restartTimeout);
    });
  }

  // Callback that is called whenever data arrives from recognizeStream.
  const speechCallback = (stream, roomId, userId) => {
    let room = rooms[roomId];

    // Convert API result end time from seconds + nanoseconds to milliseconds
    resultEndTime =
      stream.results[0].resultEndTime.seconds * 1000 +
      Math.round(stream.results[0].resultEndTime.nanos / 1000000);

    // Calculate correct time based on offset from audio sent twice
    const correctedTime =
      resultEndTime - bridgingOffset + streamingLimit * restartCounter;

    // The transcription from the current API result.
    let transcript = "";
    if (stream.results[0]?.alternatives[0]) {
      transcript = stream.results[0].alternatives[0].transcript.trim();

      // When someone starts talking, the timer should be reset.
      // If isFinal transcript does not arrive in 10 seconds since
      // previous transcript (may not be isFinal), lastParagraph
      // may not contain complete sentences.
      if (room.speakTimeout) {
        clearTimeout(room.speakTimeout);
      }
      room.speakTimeout = setTimeout(() => {
        if (room.lastSpeaker) {
          requestSummary(
            room.lastParagraph,
            roomId,
            room.lastSpeaker,
            room.paragraphTimestamp
          );
        }

        room.lastSpeaker = null;
        room.lastParagraph = "";
        room.speakTimeout = null;
      }, 10000);
    }

    if (stream.results[0]?.isFinal) {
      console.log(`${correctedTime}(${userId}): ${transcript}`);

      // When speaker changes, a new paragraph starts,
      // and last paragraph is consumed for summarization.
      if (room.lastSpeaker !== userId) {
        if (room.lastSpeaker) {
          requestSummary(
            room.lastParagraph,
            roomId,
            room.lastSpeaker,
            room.paragraphTimestamp
          );
        }

        room.lastSpeaker = userId;
        room.lastParagraph = transcript;
        // paragraphTimestamp also acts as an ID to identify paragraphs.
        room.paragraphTimestamp = Date.now();
      } else {
        // Otherwise the transcript is accumulated to previous paragraph.
        room.lastParagraph += " " + transcript;
      }

      // Broadcast the transcript to the room.
      io.sockets
        .to(roomId)
        .emit("transcript", transcript, userId, room.paragraphTimestamp);

      isFinalEndTime = resultEndTime;
      lastTranscriptWasFinal = true;
    } else {
      lastTranscriptWasFinal = false;
    }
  };

  // Interface between input audio stream and recognizeStream.
  // It lets us re-send un-answered audio input on restarts.
  const audioInputStreamTransform = new Writable({
    write(chunk, encoding, next) {
      // Re-send audio input chunks when recognizeStream restarts.
      if (newStream && lastAudioInput.length !== 0) {
        // Approximate math to calculate time of chunks
        const chunkTime = streamingLimit / lastAudioInput.length;
        if (chunkTime !== 0) {
          if (bridgingOffset < 0) {
            bridgingOffset = 0;
          }
          if (bridgingOffset > finalRequestEndTime) {
            bridgingOffset = finalRequestEndTime;
          }
          const chunksFromMS = Math.floor(
            (finalRequestEndTime - bridgingOffset) / chunkTime
          );
          bridgingOffset = Math.floor(
            (lastAudioInput.length - chunksFromMS) * chunkTime
          );

          for (let i = chunksFromMS; i < lastAudioInput.length; i++) {
            recognizeStream.write(lastAudioInput[i]);
          }
        }
        newStream = false;
      }

      // Store audio input for next restart.
      audioInput.push(chunk);

      if (recognizeStream) {
        recognizeStream.write(chunk);
      }

      next();
    },

    final() {
      if (recognizeStream) {
        recognizeStream.end();
      }
    },
  });

  // Closes recognizeStream
  function stopStream() {
    if (recognizeStream) {
      recognizeStream.end();
      recognizeStream.removeAllListeners("data");
      recognizeStream = null;
    }
  }

  // Restarts recognizeStream
  function restartStream(roomId, userId) {
    stopStream();

    if (resultEndTime > 0) {
      finalRequestEndTime = isFinalEndTime;
    }
    resultEndTime = 0;

    lastAudioInput = [];
    lastAudioInput = audioInput;

    restartCounter++;
    console.log(`${streamingLimit * restartCounter}: RESTARTING REQUEST`);

    newStream = true;
    startStream(roomId, userId);
  }

  // Sends an HTTP request for a summary for a paragraph.
  // Broadcasts the summarized text on response with confidence level.
  function requestSummary(paragraph, roomId, userId, timestamp) {
    req.post({
      url: "http://143.248.133.30:5050",
      body: `usrId=${userId}&content=${paragraph}`,
    }, function (error, response, body) {
      let summary = "";
      if (!error && response.statusCode === 200) {
        summary = body;
      }
      // TODO: get the actual confidence value
      let confidence = Math.random();

      // No summary: just emit the paragraph with a sign that
      // it is not a summary (confidence = 0).
      if (!summary) {
        summary = paragraph;
        confidence = 0;
      }

      io.sockets.to(roomId).emit("summary", summary, confidence, userId, timestamp);
    });
  }

  /* ##### socket event listeners ##### */

  socket.on("startRecognitionStream", (roomId, userId) => {
    startStream(roomId, userId);
  });

  socket.on("binaryAudioData", (data) => {
    audioInputStreamTransform.write(data);
  });

  socket.on("endRecognitionStream", () => {
    stopStream();
  });

  socket.on("disconnect", () => {
    stopStream();
  });
};
