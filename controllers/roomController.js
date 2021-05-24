const { body, validationResult } = require("express-validator");
const { v4: uuidV4 } = require("uuid");

// Require database and Room model.
const rooms = require("../db");
const { Room } = require("../models/room");

// Helper functions.
const { setPrivileged, isPrivileged } = require("../library/library")

module.exports = {
  // Display room creation page.
  room_create_get: function (req, res, next) {
    res.render("create-room", { room_name: "", passcode: "", error: null });
  },

  // Handle room create on POST.
  room_create_post: [
    // Validate and sanitize fields in the form.
    body("room_name")
      .trim()
      .isLength({ min: 1 })
      .escape()
      .withMessage("Room name must be specified."),
    body("passcode")
      .trim()
      .isLength({ min: 1 })
      .escape()
      .withMessage("Passcode must be specified."),

    // Create the room after validation
    function (req, res, next) {
      // Extract the validation errors from the request.
      const errors = validationResult(req);

      if (!errors.isEmpty()) {
        // There are errors. Render form again with sanitized values and error messages.
        res.render("create-room", {
          room_name: req.body.room_name,
          passcode: req.body.passcode,
          error: errors.array()[0], // Send only the first error.
        });
        return;
      }

      // Otherwise, create the room. NOTE: The room is not yet open.
      // This is the only place where a new room ID is generated.
      let roomId = uuidV4();
      let room = new Room(roomId, req.body.room_name, req.body.passcode);

      // Save the room and mark the session as privileged for the room.
      rooms[roomId] = room;
      setPrivileged(req.session, roomId);

      // Redirect to host page.
      res.render("redirect", {
        msg: `Created Room: ${room.name}`,
        url: `${roomId}/host`,
      });
    },
  ],

  // Display room for a host after checking authorization.
  room_host_get: function (req, res, next) {
    let roomId = req.params.room_id; // The room ID from URL.
    let room = rooms[roomId];

    // Check if there is such room.
    if (!room) {
      // If not, redirect to room creation page.
      res.render("redirect", {
        msg: "Room not found",
        url: "../create",
      });
    } else if (!isPrivileged(req.session, roomId)) {
      // Check if the user is privileged to the room.
      // If not, redirecto to room joining page.
      res.render("redirect", {
        msg: "You are not authorized as a host",
        url: `../${roomId}`,
      });
    } else {
      // Otherwise, render the presenter room page.
      res.render("presenter-room", { room_id: roomId, room_name: room.name });
    }
  },

  // Display the page to join a room.
  room_join_get: function (req, res, next) {
    let roomId = req.params.room_id; // The room ID from URL.
    let room = rooms[roomId];

    // Check if there is such room that is open.
    if (!room?.isOpen) {
      // If no such room, redirect to room creation page.
      res.render("redirect", {
        msg: "No such room",
        url: "create",
      });
    } else {
      // Otherwise render the page for joining a room.
      res.render("join-room", { room_name: room.name, error: null });
    }
  },

  // Handle POST request to join a room as a supervisor.
  /*
  room_join_post: [
    // Validate and sanitize the inputs in the form.
    body("passcode")
      .trim()
      .isLength({ min: 1 })
      .escape()
      .withMessage("Passcode must be specified."),

    // Handle join room after validation.
    function (req, res, next) {
      const errors = validationResult(req);

      // There are validation error in the form.
      if (!errors.isEmpty()) {
        // Render form again with sanitized values and error messages.
        res.render("join-room", {
          room_name: req.body.room_name,
          passcode: req.body.passcode,
          error: errors.array()[0],
        });
        return;
      }

      let roomId = req.params.room_id; // Room ID from URL.
      let passcode = req.body.passcode; // Passcode from the form.

      let room = rooms[roomId];

      // Check if the room exists and is open.
      if (!room?.isOpen) {
        // If no such room, redirect to room creation page.
        res.render("redirect", {
          msg: "No such room",
          url: "create",
        });
      } else if (passcode !== room.passcode) {
        // Check the passcode. If wrong, redirect to room joining page.
        res.render("redirect", {
          msg: "Wrong passcode!",
          url: "",
        });
      } else {
        // Set the session as privileged. Redirect to supervisor room page.
        setPrivileged(req.session, roomId);
        res.render("redirect", {
          msg: "Joining as a supervisor",
          url: `${roomId}/supervisor`,
        });
      }
    },
  ],
  */

  // Display the room page for a normal participant.
  room_participant_get: function (req, res, next) {
    let roomId = req.params.room_id; // Room ID from URL.
    let room = rooms[roomId];

    // Check if there is the room that is open.
    if (!room?.isOpen) {
      // If no such room, redirect to room creation page.
      res.render("redirect", {
        msg: "No such room",
        url: "../create",
      });
    } else {
      // Otherwise render the room for participants.
      res.render("presenter-room", { room_id: roomId, room_name: room.name });
    }
  },
};
