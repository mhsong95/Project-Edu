function loginfunc(){
    var useremail = document.getElementById('email').value;
    var userpassword = document.getElementById('password').value;
    firebase.auth().signInWithEmailAndPassword(useremail, userpassword)
        .then((user) => {
            window.alert("congrat!");
            window.location = "./pages/main.html";
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