const express = require('express')
const app = express()
const server = require('http').Server(app)
const io = require('socket.io')(server)
const { v4: uuidV4 } = require('uuid')
var url = require('url')

app.set('view engine', 'ejs')
app.engine('html', require('ejs').renderFile)
app.use(express.static('public'))

app.get('/', (req, res) => {
    res.render('../public/index.html');
})

app.get('/create', (req, res) => {
    res.redirect(`/${uuidV4()}`)
    //res.redirect('/room')
})

//app.get('/room', (req, res) => {
app.get('/:room', (req, res) => {
    res.render('room', { roomId: req.params.room })
    //res.render('room', { roomId: uuidV4() })
})

io.on('connection', socket => {
    socket.on('join-room', (roomId, userId) => {
        console.log(roomId, userId)
        socket.join(roomId)
        socket.broadcast.to(roomId).emit('user-connected', userId)

        socket.on('disconnect', () => {
            socket.broadcast.to(roomId).emit('user-disconnected', userId)
        })
    })
})

server.listen(80)