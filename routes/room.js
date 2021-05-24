// room.js - contains express routes for path under "/room"
// A route is a mapping from (request method, path) to a controller function,
// to which a request for that path and method is forwarded.

const express = require("express");
const router = express.Router();

// Require controller module for room.
const room_controller = require("../controllers/roomController");

// GET room home page.
// Redirect to room creation page for now.
router.get("/", (req, res) => {
  res.redirect(req.baseUrl + "/create");
});

// GET request for creating a room.
// NOTE: This must come before routes that use :room_id in their URL.
router.get("/create", room_controller.room_create_get);

// POST request for creating a room.
router.post("/create", room_controller.room_create_post);

// GET request for entering a room as a host.
router.get("/:room_id/host", room_controller.room_host_get);

// GET request for joining a room.
router.get("/:room_id", room_controller.room_join_get);

// POST request for authorizing a user as a host.
// router.post("/:room_id", room_controller.room_join_post);

// GET request for entering a room as a normal participant.
router.get("/:room_id/participant", room_controller.room_participant_get);

module.exports = router;
