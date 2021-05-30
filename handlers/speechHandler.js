const { Server, Socket } = require("socket.io");

const rooms = require("../db.js");

// Interface between audio input and recognizeStream.
const { Writable } = require("stream");

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
    interimResults: false, // If you want interim results, set this to true
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
    setTimeout(() => {
      restartStream(roomId, userId);
    }, streamingLimit);
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
    }

    if (stream.results[0]?.isFinal) {
      // console.log(`${correctedTime}(${userId}): ${transcript}`);

      // When speaker changes, a new paragraph starts,
      // and last paragraph is consumed for summarization.
      if (room.lastSpeaker !== userId) {
        // TODO: Consume room.lastParagraph
        // CAUTION: room.lastSpeaker can be null.

        room.lastSpeaker = userId;
        room.lastParagraph = transcript;
        // paragraphTimestamp also acts as an ID to identify paragraphs.
        room.paragraphTimestamp = Date.now();
      } else {
        // Otherwise the transcript is accumulated to previous paragraph.
        room.lastParagraph += (" " + transcript);
      }

      console.log(`${room.paragraphTimestamp}: ${room.lastParagraph}`);

      // Paragraph also changes after 10 seconds since last speech.
      if (room.speakTimeout) {
        clearInterval(room.speakTimeout);
      }
      room.speakTimeout = setTimeout(() => {
        // TODO: consume room.lastParagraph
        // CAUTION: room.lastSpeaker can be null.

        room.lastSpeaker = null;
        room.lastParagraph = "";
        room.speakTimeout = null;
      }, 10000);

      // Broadcast the transcript to the room.
      io.sockets
        .to(roomId)
        .emit("speechData", transcript, userId, room.paragraphTimestamp);

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
