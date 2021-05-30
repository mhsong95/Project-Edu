// Stream Audio
let bufferSize = 2048,
  AudioContext,
  context,
  processor,
  input,
  globalStream;

let AudioStreamer = {
  /**
   * @param {MediaStream} stream The media stream to send to the server
   * @param {function} onData Callback to run on data each time it's received
   * @param {function} onError Callback to run on an error if one is emitted.
   */
  initRecording: function (stream, onData, onError) {
    userIdPromise.then((userId) => {
      socket.emit("startRecognitionStream", ROOM_ID, userId);
    });

    AudioContext = window.AudioContext || window.webkitAudioContext;
    context = new AudioContext();
    processor = context.createScriptProcessor(bufferSize, 1, 1);
    processor.connect(context.destination);
    context.resume();

    var handleSuccess = function (stream) {
      globalStream = stream;
      input = context.createMediaStreamSource(stream);
      input.connect(processor);

      processor.onaudioprocess = function (e) {
        microphoneProcess(e);
      };
    };

    handleSuccess(stream);

    // Bind the data handler callback
    if (onData) {
      socket.on("speechData", (transcript, userId, paragraphTimestamp) => {
        onData(transcript, userId, paragraphTimestamp);
      });
    }

    socket.on("recognitionError", (error) => {
      if (onError) {
        onError("error");
      }
      // We don't want to emit another end stream event
      // closeAll();
    });
  },

  stopRecording: function () {
    socket.emit("endRecognitionStream", "");
    closeAll();
  },
};

// Helper functions
/**
 * Processes microphone data into a data stream
 *
 * @param {object} e Input from the microphone
 */
function microphoneProcess(e) {
  var left = e.inputBuffer.getChannelData(0);
  var left16 = convertFloat32ToInt16(left);
  socket.emit("binaryAudioData", left16);
}

/**
 * Converts a buffer from float32 to int16. Necessary for streaming.
 * sampleRateHertz of 16000.
 *
 * @param {object} buffer Buffer being converted
 */
function convertFloat32ToInt16(buffer) {
  let l = buffer.length;
  let buf = new Int16Array(l / 3);

  while (l--) {
    if (l % 3 === 0) {
      buf[l / 3] = buffer[l] * 0xffff;
    }
  }
  return buf.buffer;
}

/**
 * Stops recording and closes everything down. Runs on error or on stop.
 */
function closeAll() {
  // Clear the listeners (prevents issue if opening and closing repeatedly)
  socket.off("speechData");
  socket.off("recognitionError");
  /*
  let tracks = globalStream ? globalStream.getTracks() : null;
  let track = tracks ? tracks[0] : null;
  if (track) {
    track.stop();
  }
  */

  if (processor) {
    if (input) {
      try {
        input.disconnect(processor);
      } catch (error) {
        console.warn("Attempt to disconnect input failed.");
      }
    }
    processor.disconnect(context.destination);
  }
  if (context) {
    context.close().then(function () {
      input = null;
      processor = null;
      context = null;
      AudioContext = null;
    });
  }
}
