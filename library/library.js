// library.js - contains useful functions for handling events/requests.

module.exports = {
  // Mark a session as privileged:
  // the session is now authorized as a host.
  setPrivileged(session, roomId) {
    if (!session.privilegeMap) {
      // Map from { roomID => Boolean }
      session.privilegeMap = {};
    }

    session.privilegeMap[roomId] = true;
  },

  // Test if a session is privileged to a given room.
  isPrivileged(session, roomId) {
    return session.privilegeMap?.[roomId] || false;
  },
};
