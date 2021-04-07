class User {
  constructor(userId, socket) {
    this.userId = userId;
    this.socket = socket;
  }
}

class Presenter extends User {
  constructor(userId, socket, name) {
    super(userId, socket);
    this.name = name;
  }
}

class Supervisor extends User {
  constructor(userId, socket, priority, capacity) {
    super(userId, socket);
    this.priority = priority;
    this.capacity = capacity;
  }
}

class Participant extends Presenter {
  constructor(userId, socket, name) {
    super(userId, socket, name);
    this.supervisorId = null;
    this.concentLevels = []; // [{time: ..., degree: ...}, ...]
    this.concentSummary = {
      avg: 0,
      enterTime: 0,
      dataSum: 0,
      lastData: 0,
      lastTime: 0,
    };
  }
}

class Room {
  constructor(roomId, name, passcode) {
    this.roomId = roomId;
    this.name = name;
    this.passcode = passcode;
    this.isOpen = false;

    this.presenter = null;
    this.supervisors = [];
    this.participants = [];
  }

  getParticipant(userId) {
    for (let part of participants) {
      if (part.userId === userId) {
        return part;
      }
    }
    return null;
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
    // Push the new participant at the end of the array.
    this.participants.push(participant);

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
      this.supervisors.splice(index, 1);
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
      this.participants.splice(index, 1);
      this.reassignParticipants();
    }
  }

  /**
   * Reassigns the participants among supervisors according to their priority.
   * For the participants whose supervisor is to changed, "call-supervisor" event is
   * emitted to their sockets so that they can remake the calls.
   * @param {Boolean} sort Whether you want to sort the participants according to concentration average.
   */
  reassignParticipants(sort = false) {
    let index = 0;

    // If participant sorting is required, sort them before re-assigning.
    if (sort) {
      this.participants.sort((part1, part2) => {
        return part1.concentSummary.avg - part2.concentSummary.avg;
      });
    }

    for (let supervisor of this.supervisors) {
      for (let capacity = supervisor.capacity; capacity > 0; capacity--) {
        let participant = this.participants[index];
        if (!participant) return;

        // Check if the participant have to change the supervisor.
        if (participant.supervisorId !== supervisor.userId) {
          participant.socket.emit("call-supervisor", supervisor.userId);
          participant.supervisorId = supervisor.userId;
        }
        index++;
      }
    }
  }
}

module.exports = { User, Presenter, Supervisor, Participant, Room };
