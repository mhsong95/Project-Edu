/**
 * Defines the event handler for transcription data from Google Cloud STT. 
 * It includes the UI part of the transcription and summary data.
 */

// The area in which transcriptions and summaries are displayed.
const messages = document.getElementById("messages");

/**
 * Invoked when a new transcription data arrives from the room.
 * 
 * @param {Object} names Dictionary that keeps userId <=> name mapping
 * @param {String} transcript The transcription text data
 * @param {String} userId User ID to which the transcription belongs
 * @param {Number} paragraphTimestamp Timestamp at which the paragraph started
 */
function onTranscript(names, transcript, userId, paragraphTimestamp) {
  let messageBox = getMessageBox(paragraphTimestamp);
  if (!messageBox) {
    messageBox = createMessageBox(names[userId], paragraphTimestamp);
  }

  // Accumulate the paragraph with the new transcript.
  let paragraph = messageBox.childNodes[1];
  paragraph.textContent += (transcript + " ");

  // Scroll down the messages area.
  messages.scrollTop = messages.scrollHeight;
}

/** 
 * Invoked when a new transcription data arrives from the room.
 * 
 * @param {Object} names Dictionary that keeps userId <=> name mapping
 * @param {String} transcript The summary text data
 * @param {String} userId User ID to which the summary belongs
 * @param {Number} paragraphTimestamp Timestamp at which the paragraph started
 */
function onSummary(names, summary, userId, paragraphTimestamp) {

}

// Helper functions

/**
 * Creates a new HTML element that holds a paragraph and summary from a user.
 * The timestamp also serves as the ID of the element.
 * 
 * @param {String} name The name of the speaker of the paragraph
 * @param {Number} timestamp The timestamp at which the paragraph started
 * @returns {HTMLElement} The 'div' element that has 3 elements
 */
function createMessageBox(name, timestamp) {
  let messageBox = document.createElement("div");
  messageBox.setAttribute("id", timestamp.toString());
  messageBox.className = "message-box";

  // messageBox.childNodes[0]: includes title - timestamp and name.
  let title = document.createElement("div");

  let nametag = document.createElement("span");
  let strong = document.createElement("strong");
  strong.textContent = name;
  nametag.className = "nametag";
  nametag.append(strong);

  let timetag = document.createElement("span");
  timetag.className = "timetag";
  timetag.append(document.createTextNode(formatTime(timestamp)));

  title.append(nametag, timetag);
  messageBox.append(title);

  // messageBox.childNodes[1]: includes the (unsummarized) paragraph
  let paragraph = document.createElement("p");
  paragraph.className = "paragraph";
  messageBox.append(paragraph);

  // messageBox.childNodes[2]: includes the summary
  let summary = document.createElement("p");
  messageBox.append(summary);

  // Finally append the box to 'messages' area
  messages.appendChild(messageBox);

  return messageBox;
}

/**
 * Gets an existing message box that matches the given timestamp(ID).
 * 
 * @param {Number} timestamp The timestamp at which the paragraph started
 * @returns {HTMLElement} The 'div' element that has 3 elements or null
 */
function getMessageBox(timestamp) {
  return document.getElementById(timestamp.toString());
}

// Formats time from a timestamp in hh:mm:ss AM/PM format.
function formatTime(timestamp) {
  let date = new Date(timestamp);

  let hours = appendZero(date.getHours() % 12);
  let ampm = date.getHours() < 12 ? "AM" : "PM";
  let minutes = appendZero(date.getMinutes());
  let seconds = appendZero(date.getSeconds());

  return `${hours}:${minutes}:${seconds} ${ampm}`;
}

// Appends leading zero for one-digit hours, minutes, and seconds
function appendZero(time) {
  return time < 10 ? "0" + time : time.toString();
}