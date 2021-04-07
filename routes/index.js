// index.js

const express = require("express");
const router = express.Router();

// GET home page. Redirect to "/room".
router.get("/", (req, res) => {
  res.redirect("/room");
});

module.exports = router;
