// The collection of rooms. Maps roomId => Room (models/room.js).
const rooms = {};

// Dictionary about student's concentrate data
// concentDict : {student1ID: [
//                  [studentId, timestamp, concentrate degree(0 or 5 or 10)], ... ],
//                student2ID: ...}
var concentDict = {};

// Dictionary about student's concentrate average
// concentDict : {student1ID: [
//                  [avg, enterTime, dataSum, lastData, lastTime],
//                student2ID: ...}
var avgDict = {};

module.exports = rooms;
