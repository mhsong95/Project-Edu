function loginfunc(){
    var useremail = document.getElementById('email').value;
    var userpassword = document.getElementById('password').value;
    firebase.auth().signInWithEmailAndPassword(useremail, userpassword)
        .then((user) => {
            window.alert("congrat!");
            window.location = "main.html";
        })
        .catch((error) => {
            var errorCode = error.code;
            var errorMessage = error.message;
            window.alert(errorCode + "haha" + errorMessage);
        });
}

function signupfunc(){
    var useremail = document.getElementById("emails").value;
    var userpassword = document.getElementById("passwords").value;
    var userpasswordconfirm = document.getElementById("passwordconfirms").value;
    if(useremail == ""){
        window.alert("null email!!");
    }
    if (userpassword != userpasswordconfirm){
        window.alert("password different!!");
        document.getElementById("emails").value = '';
        document.getElementById("passwords").value = '';
        document.getElementById("userpasswordconfirms").value = '';
    }
    firebase.auth().createUserWithEmailAndPassword(useremail, userpassword)
        .then((user) => {
            window.alert("success!");
            window.location = "../index.php";
         })
        .catch((error) => {
            var errorCode = error.code;
            var errorMessage = error.message;
            window.alert(errorCode + errorMessage);
        });
}

function create_class(){
    firebase.auth().onAuthStateChanged((user) => {
        if (user) {
          var uid = user.uid;
          console.log(uid);
          window.location.href = `/create?user=${uid}`;
        } else {
          console.log("fail")
        }
      });
}

function join_class(){
    firebase.auth().onAuthStateChanged((user) => {
        if (user) {
          var uid = user.uid;
          console.log(uid);
          roomID = document.getElementById("roomid").value;
          console.log(roomID);
          window.location.href = '/join?id=' + roomID + '&user=' + uid;
        } else {
          console.log("fail")
        }
      });
}
