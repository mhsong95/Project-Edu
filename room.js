class User {
  constructor(userId, socket) {
    this.userId = userId;
    this.socket = socket;
  }
}

class Supervisor extends User {
  constructor(userId, socket, priority, capacity) {
    super(userId, socket);
    this.priority = priority;
    this.capacity = capacity;
  }
}

class Participant extends User {
  constructor(userId, socket) {
    super(userId, socket);
    this.supervisorId = null;
  }
}

class Room {
  constructor(roomId, passcode) {
    this.roomId = roomId;
    this.passcode = passcode;
    this.presenter = null;
    this.supervisors = [];
    this.participants = [];
    this.isOpened = false;
  }

  /**
   * Add a new supervisor into the room. According to its priority,
   * some participants' streams will be redirected among the supervisors.
   * @param {Supervisor} supervisor
   */
  addSupervisor(supervisor) {
    // Push the new supervisor and sort the array according to priority.
    this.supervisors.push(supervisor);
    this.supervisors.sort((sup1, sup2) => {
      return sup1.priority - sup2.priority;
    });

    this.reassignParticipants();
  }

  /**
   * Add a new participant into the room. According to its concentration measure,
   * some participants' streams will be redirected among the supervisors.
   * @param {Participant} participant
   */
  addParticipant(participant) {
    // Push the new participant and sort the array
    // according to participants' concentration measure.
    this.participants.push(participant);
    /* TODO: include 'concentration measure'
    this.participants.sort((part1, part2) => {
      return part1.concentration - part2.concentration;
    });
    */

    this.reassignParticipants();
  }

  /**
   * Removes a supervisor from the room's supervisors list.
   * This should be called after the supervisor is 'disconnect'ed,
   * and participants will be reassigned among the remaining supervisors.
   * @param {String} userId The ID of the supervisor to remove.
   */
  removeSupervisor(userId) {
    let index = this.supervisors.findIndex((supervisor) => {
      return supervisor.userId === userId;
    });

    if (index !== -1) {
      this.supervisors.splice(index, 1)
      this.reassignParticipants();
    }
  }

  /**
   * Removes a participant from the room's participants list.
   * This should be called after the participant is 'disconnect'ed,
   * and participants will be reassigned among the remaining supervisors.
   * @param {String} userId  The ID of the participant to remove.
   */
  removeParticipant(userId) {
    let index = this.participants.findIndex((participant) => {
      return participant.userId === userId;
    });

    if (index !== -1) {
      this.participants.splice(index, 1)
      this.reassignParticipants();
    }
  }

  /**
   * Reassigns the participants among supervisors according to their priority.
   * For the participants whose supervisor is to changed, "call-to" event is
   * emitted to their sockets so that they can remake the calls.
   */
  reassignParticipants() {
    let index = 0;
    for (let supervisor of this.supervisors) {
      for (let capacity = supervisor.capacity; capacity > 0; capacity--) {
        let participant = this.participants[index];
        if (!participant) return;

        // Check if the participant have to change the supervisor.
        if (participant.supervisorId !== supervisor.userId) {
          participant.socket.emit("call-to", supervisor.userId);
          participant.supervisorId = supervisor.userId;
        }
        index++;
      }
    }
  }
}

module.exports = { User, Supervisor, Participant, Room };
