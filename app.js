'use strict';

const { response } = require('express');
//Set up express
const express = require('express');
const app = express();
const fetch = require('node-fetch');

//Setup socket.io
const server = require('http').Server(app);
const io = require('socket.io')(server);

let players = new Map();
let playersToSockets = new Map();
let socketsToPlayers = new Map();
let nextPlayerNumber = 0;
let lastPlayer = null;
//States: 0 Joining, 1 Prompts, 2 Answers, 3 Voting, 4 Results, 5 Scores, 6 Game Over
//Rounds: 3 rounds total
let state = {state: 0, round: 0, countdown: 90};
let timer = null;


//Setup static page handling
app.set('view engine', 'ejs');
app.use('/static', express.static('public'));

//Handle client interface on /
app.get('/', (req, res) => {
  res.render('client');
});
//Handle display interface on /display
app.get('/display', (req, res) => {
  res.render('display');
});

//Start the server
function startServer() {
    const PORT = process.env.PORT || 8080;
    server.listen(PORT, () => {
        console.log(`Server listening on port ${PORT}`);
    });
}

//Chat message
function handleChat(message) {
    console.log('Handling chat: ' + message); 
    io.emit('chat',message);
}

async function azureLogin(username, password){

  const prefix = "https://coursework1-dd1g19.azurewebsites.net/api";
  const APP_KEY = "0Pp4ScvdFf8r1dWJHs_MQyQQZwwNQ-JLuRNyO2fUcH-lAzFuYRNUog==";
  const the_input = {"username": username, "password": password};

  const response = await(await fetch(prefix + '/player/login', {
    method: 'POST',
    body: JSON.stringify(the_input),
    headers: {'x-functions-key' : APP_KEY },
  }).then(res => res.json()))
 
  console.log(response);
  return response;
}

//Login
async function handleLogin(socket, username, password) {
  console.log('login event');

  const resp = await(azureLogin(username, password));

  if (resp.result == false) {
    console.log('error')
  } else {
    console.log('Welcome to player ' + username + " " + password);

    nextPlayerNumber++;
    
    players.set(nextPlayerNumber, {name: nextPlayerNumber, state: 1, score: 0});
    console.log(players);
    playersToSockets.set(nextPlayerNumber, socket);
    socketsToPlayers.set(socket, nextPlayerNumber);
  }
}

//Update state of all players
function updateAll() {
  console.log('updating all players');
  for(let [playerNumber, socket] of playersToSockets){
    updatePlayer(socket);
  }
}

//Update one player
function updatePlayer(socket){
  const playerNumber = socketsToPlayers.get(socket);
  const thePlayer = players.get(playerNumber);
  const data = {state: state, me: thePlayer, players: Object.fromEntries(players)};
  socket.emit('state', data);
}

function error(socket, message, halt) {
  console.log('Error: ' + message);
  socket.emit('fail', message);
  if(halt) {
    socket.disconnect();
  }
}

function announce(message) {
  console.log('Announcement: ' + message);
  io.emit('chat', message);
}

//Handle new connection
io.on('connection', socket => { 
  console.log('New connection');

  //Handle on chat message received
  socket.on('chat', message => {
    handleChat(message);
  });

  //Handle disconnection
  socket.on('disconnect', () => {
    console.log('Dropped connection');
  });

  socket.on('login', (username, password) => {
    if(socketsToPlayers.has(socket)) return;
    handleLogin(socketsToPlayers.get(socket), username, password);
    console.log("fast");
    updateAll();
  })
});

//Start server
if (module === require.main) {
  startServer();
}

module.exports = server;
