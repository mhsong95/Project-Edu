var PointCalibrate = 0;
var CalibrationPoints={};

/**
 * Clear the canvas and the calibration button.
 */
function ClearCanvas(){
  $(".Calibration").hide();
  var canvas = document.getElementById("plotting_canvas");
  canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height);
}

/**
 * Show the instruction of using calibration at the start up screen.
 */
function PopUpInstruction(){
  ClearCanvas();
  ShowCalibrationPoint();
}

/**
 * Show the Calibration Points
 */
function ShowCalibrationPoint() {
  $(".Calibration").show();
  $("#Pt5").hide(); // initially hides the middle button
}

/**
* This function clears the calibration buttons memory
*/
function ClearCalibration(){
  // Clear data from WebGazer

  $(".Calibration").css('background-color','red');
  $(".Calibration").css('opacity',0.2);
  $(".Calibration").prop('disabled',false);

  CalibrationPoints = {};
  PointCalibrate = 0;
}

// sleep function because java doesn't have one, sourced from http://stackoverflow.com/questions/951021/what-is-the-javascript-version-of-sleep
function sleep (time) {
  return new Promise((resolve) => setTimeout(resolve, time));
}

/**
 * Load this function when the index page starts.
* This function listens for button clicks on the html page
* checks that all buttons have been clicked 5 times each, and then goes on to measuring the precision
*/
$(document).ready(function(){
  ClearCanvas();
     $(".Calibration").click(function(){ // click event on the calibration buttons

      var id = $(this).attr('id');

      if (!CalibrationPoints[id]){ // initialises if not done
        CalibrationPoints[id]=0;
      }
      CalibrationPoints[id]++; // increments values

      if (CalibrationPoints[id]==5){ //only turn to yellow after 5 clicks
        $(this).css('background-color','yellow');
        $(this).prop('disabled', true); //disables the button
        PointCalibrate++;
      }else if (CalibrationPoints[id]<5){
        //Gradually increase the opacity of calibration points when click to give some indication to user.
        var opacity = 0.2*CalibrationPoints[id]+0.2;
        $(this).css('opacity',opacity);
      }

      //Show the middle calibration point after all other points have been clicked.
      if (PointCalibrate == 8){
        $("#Pt5").show();
      }

      if (PointCalibrate >= 9){ // last point is calibrated
        //using jquery to grab every element in Calibration class and hide them except the middle point.
        $("#calib").hide();
        $("#main").show();
      }
    });
});

window.onload = async function() {

  $("#main").hide();

  Restart();

  webgazer.params.showVideoPreview = true;
  //start the webgazer tracker
  await webgazer.setRegression('ridge') /* currently must set regression and tracker */
      //.setTracker('clmtrackr')
      .setGazeListener(function(data, timestamp) {
        //   console.log(data); /* data is an object containing an x and y key which are the x and y prediction coordinates (no bounds limiting) */
        //   console.log(clock); /* elapsed time in milliseconds since webgazer.begin() was called */
        const videogrid = document.getElementById("video-grid");
        const left = videogrid.offsetLeft;
        const right = videogrid.offsetLeft + videogrid.offsetWidth;
        const top = videogrid.offsetTop;
        const bottom = videogrid.offsetTop + videogrid.offsetHeight;

        if (data == null || lookDirection === "STOP") return;

        if (
          data.x >= left &&
          data.x <= right &&
          data.y >= top &&
          data.y <= bottom
        ) {
          // videogrid.style.backgroundColor = "blue";
          startLookTime = Number.POSITIVE_INFINITY; // restart timer
          lookDirection = null;
          add_concentrate_log(timestamp, 10);
        } else if (lookDirection !== "RESET" && lookDirection === null) {
          // videogrid.style.backgroundColor = "yellow";
          startLookTime = timestamp;
          lookDirection = "OUT";
          add_concentrate_log(timestamp, 5);
        }

        if (startLookTime + LOOK_DELAY < timestamp) {
          console.log(left, right, top, bottom);
          // videogrid.style.backgroundColor = "red";
          add_concentrate_log(timestamp, 0);

          startLookTime = Number.POSITIVE_INFINITY;
          lookDirection = "STOP";
          setTimeout(() => {
            lookDirection = "RESET";
          }, 200);
        }
      }).begin();
      webgazer.showVideoPreview(true) /* shows all video previews */
          .showPredictionPoints(true) /* shows a square every 100 milliseconds where current prediction is */
          .applyKalmanFilter(true); /* Kalman Filter defaults to on. Can be toggled by user. */

  //Set up the webgazer video feedback.
  var setup = function() {

      //Set up the main canvas. The main canvas is used to calibrate the webgazer.
      var canvas = document.getElementById("plotting_canvas");
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
      canvas.style.position = 'fixed';
  };
  setup();

};

// Set to true if you want to save the data even if you reload the page.
window.saveDataAcrossSessions = true;

window.onbeforeunload = function() {
  webgazer.end();
}

/**
* Restart the calibration process by clearing the local storage and reseting the calibration point
*/
function Restart(){
  webgazer.clearData();
  ClearCalibration();
  PopUpInstruction();
}




function store_points_variable(){
  webgazer.params.storingPoints = true;
}

/*
 * Sets store_points to false, so prediction points aren't
 * stored any more
 */
function stop_storing_points_variable(){
  webgazer.params.storingPoints = false;
}