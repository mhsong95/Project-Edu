const socket = io("/");
const videoGrid = document.getElementById("video-grid");
const myPeer = new Peer(undefined, {
<<<<<<< HEAD:public/js/script.js
    host: '/',
    port: '8080'
})

// The value of this promise is used to broadcast that you've joined the room.
// Broadcasting occurs when getUserMedia completes, thus all event listeners
// (e.g. myPeer.on('call')) have had set.
const myUserIdPromise = new Promise((resolve) => {
    myPeer.on('open', id => {
        resolve(id);    // My user ID
    });
});

const myVideo = document.createElement('video')
myVideo.muted = true

const peers = {}

var isCreator = false;  // Indicates whether you have created a room, or just joined

navigator.mediaDevices.getUserMedia({
    video: true,
    audio: true
}).then(stream => {
    addVideoStream(myVideo, stream)

    myPeer.on('call', call => {
        call.answer(stream)
        const video = document.createElement('video')
        call.on('stream', userVideoStream => {
            addVideoStream(video, userVideoStream)
        })
    })

    socket.on('user-connected', userId => {
        console.log('User connected: ' + userId)

        // Connect to the user only if you are a room creator.
        if (isCreator) {
            connectToNewUser(userId, stream)
        }
    });

    socket.on('room-created', () => {
        isCreator = true;
    });

    myUserIdPromise.then(id => {
        socket.emit('join-room', ROOM_ID, id);
    });

})

socket.on('user-disconnected', userId => {
    if(peers[userId]) peers[userId].close()
})

function addVideoStream(video, stream) {
    console.log("new")
    video.srcObject = stream
    video.addEventListener('loadedmetadata', () => {
        video.play()
    })
    videoGrid.append(video)
}

function connectToNewUser(userId, stream) {
    const call = myPeer.call(userId, stream)
    const video = document.createElement('video')

    call.on('stream', userVideoStream => {
        addVideoStream(video, userVideoStream)
    })
    call.on('close', () => {
        video.remove()
    })

    peers[userId] = call
}
=======
  host: "/",
  port: "8080",
});

myPeer.on("open", (id) => {
  socket.emit("join-room", ROOM_ID, id);
});

const myVideo = document.createElement("video");
myVideo.muted = true;

const peers = {};

// chat
var messages = document.getElementById("messages");
var form = document.getElementById("form");
var input = document.getElementById("input");

// navigator.mediaDevices
//   .getUserMedia({
//     video: true,
//     audio: true,
//   })
//   .then((stream) => {
//     addVideoStream(myVideo, stream);

//     myPeer.on("call", (call) => {
//       call.answer(stream);
//       const video = document.createElement("video");
//       call.on("stream", (userVideoStream) => {
//         addVideoStream(video, userVideoStream);
//       });
//     });

//     socket.on("user-connected", (userId) => {
//       sleep(2000);
//       console.log("User connected: " + userId);
//       connectToNewUser(userId, stream);
//     });
//   });

socket.on("user-connected", (userId) => {
  sleep(2000);
  console.log("User connected: " + userId);
  var item = document.createElement("li");
  connectToNewUser(userId, item);
});

socket.on("user-disconnected", (userId) => {
  if (peers[userId]) peers[userId].close();
});

// function addVideoStream(video, stream) {
//   console.log("new");
//   video.srcObject = stream;
//   video.addEventListener("loadedmetadata", () => {
//     video.play();
//   });
//   videoGrid.append(video);
// }

function addChatMsg(item, msg) {
  console.log("new msg");
  item.textContent = msg;
  messages.appendChild(item);
  window.scrollTo(0, document.body.scrollHeight);
}

// function connectToNewUser(userId, stream) {
//   const call = myPeer.call(userId, stream);
//   const video = document.createElement("video");
//   call.on("stream", (userVideoStream) => {
//     addVideoStream(video, userVideoStream);
//   });
//   call.on("close", () => {
//     video.remove();
//   });

//   peers[userId] = call;
// }

function connectToNewUser(userId, item) {
  const call = myPeer.call(userId, item);
  //   const video = document.createElement("video");
  call.on("item", (i) => {
    addChatMsg(item);
  });

  peers[userId] = call;
}

function sleep(ms) {
  const wakeUpTime = Date.now() + ms;
  while (Date.now() < wakeUpTime) {}
}

// chat

form.addEventListener("submit", function (e) {
  console.log("eventlistener!");
  e.preventDefault();
  if (input.value) {
    myPeer.on("call", (call) => {
      var item = document.createElement("li");
      item.textContent = msg;

      window.scrollTo(0, document.body.scrollHeight);
      call.on("chatmsg", (chatmsg) => {
        messages.appendChild(item);
      });
    });
    socket.emit("message", input.value);
    console.log("listener: " + input.value);
    input.value = "";
  }
});

socket.on("message1", function (msg) {
  console.log("html socketon");
  var item = document.createElement("li");
  item.textContent = msg;
  messages.appendChild(item);
  window.scrollTo(0, document.body.scrollHeight);
});
>>>>>>> WIP link-chat:public/script.js
