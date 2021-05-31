/**
 * Defines AudioStreamer, which records and sends audio stream (microphone)
 * to the server, and starts a speech recognition stream.
 * This file DOES NOT include event handlers on data arrival on the socket,
 * because those events can fire even if the user did not start audio streaming.
 */

// Stream Audio
let bufferSize = 2048,
  AudioContext,
  context,
  processor,
  input,
  globalStream,
  recognizeSocket;

let AudioStreamer = {
  /**
   * @param {MediaStream} stream The media stream to send to the server
   * @param {Socket} socket The socket instance to communicate events
   * @param {function} onError Callback to run on an error if one is emitted.
   */
  initRecording: function (stream, socket, onError) {
    recognizeSocket = socket;

    userIdPromise.then((userId) => {
      recognizeSocket?.emit("startRecognitionStream", ROOM_ID, userId);
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

    /*
    // Bind the data handler callback
    recognizeSocket?.on(
      "speechData",
      (transcript, userId, paragraphTimestamp) => {
        console.log(`${names[userId]}(${paragraphTimestamp}): ${transcript}`);
      }
    );
    */

    recognizeSocket?.on("recognitionError", (error) => {
      if (onError) {
        onError("error");
      }
      // We don't want to emit another end stream event
      closeAll();
    });
  },

  stopRecording: function () {
    recognizeSocket?.emit("endRecognitionStream", "");
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
  recognizeSocket?.emit("binaryAudioData", left16);
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
  if (recognizeSocket) {
    recognizeSocket.off("speechData");
    recognizeSocket.off("recognitionError");
    recognizeSocket = null;
  }
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
