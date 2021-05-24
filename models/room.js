/**
 * Datastructure for a user.
 */
class User {
  constructor(userId, socket, name) {
    this.userId = userId;
    this.socket = socket;
    this.name = name;
  }
}

/**
 * Datastructure for a room.
 */
class Room {
  constructor(roomId, name, passcode) {
    // Basic information about a room.
    this.roomId = roomId;
    this.name = name;
    this.passcode = passcode;

    this.isOpen = false;  // Whether the room is open.
    this.isTranscribing = false;  // Whether the transcription is ongoing.

    this.host = null; // The host (creator) of the room.
    this.participants = []; // List of participants.
  }

  getParticipant(userId) {
    for (let part of this.participants) {
      if (part.userId === userId) {
        return part;
      }
    }
    return null;
  }

  /**
   * Add a new participant into the room.
   * @param {Participant} participant
   */
  addParticipant(participant) {
    // Push the new participant at the end of the array.
    this.participants.push(participant);
  }

  /**
   * Removes a participant from the room's participants list.
   * This should be called after the participant is 'disconnect'ed.
   * @param {String} userId  The ID of the participant to remove.
   */
  removeParticipant(userId) {
    let index = this.participants.findIndex((participant) => {
      return participant.userId === userId;
    });

    if (index !== -1) {
      this.participants.splice(index, 1);
    }
  }
}

module.exports = { User, Room };
