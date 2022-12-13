'use strict';

//Set up express
const express = require('express');
const { clearInterval } = require('timers');
const { threadId } = require('worker_threads');
const app = express();

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
app.get('/', (req, res) => {
  res.render('client');
});
//TODO: implement display after
/* //Handle display interface on /display
app.get('/display', (req, res) => {
  res.render('display');
}); */

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

function handleJoin(socket, username, password) {
  console.log('Join event');
  console.log(username);

  /* response = requests.post(prefix+'/player/login', json=the_input, 
            headers={'x-functions-key' : APP_KEY });
  output = response.json(); */

  //TODO: if game started player should be added to audience instead
  if(state.state > 0) {
    error(socket, 'the game has already started', true);
    return;
  }

  if (username == "davey"){
     //Start new player
    nextPlayerNumber++;
    console.log('Welcome to player ' + username);
    announce('Welcome player ' + username);

    // TOOD: player state: 1 means they're alive, figure out what this means for quiplash
    // state 1 = player, state 0 = audience member
    players.set(nextPlayerNumber, {name: username, state: 1, score: 0 });
    playersToSockets.set(nextPlayerNumber, socket);
    socketsToPlayers.set(socket, nextPlayerNumber);
  }

 
}

function startGame() {
  console.log('Game starting');
  announce('Let the games begin');

  //Prep all players
  for(const [playerNumber, player] of players) {
    player.state = 0
  }

  //Start timer
  console.log('Starting timer: ' + state.countdown);
  timer = setInterval(() => {
    tickGame();
  }, 1000);

  //Advance game
  state.state = 1;

  //TODO: figure out what needs to be done instead
  //state.light = 'red';
}

//TODO: update function for quiplash
function endGame() {
  state.state = 2;  
  console.log('Game ending');
  for(let [playerNumber, player] of players) {
    if(player.score < 100) {
      console.log('TODO endGame');
      //killPlayer(playerNumber);
    }
  }
}

function handleAdmin(player, action) {
  console.log('Admin event: ' + action);

  //player 1 is the admin of every game
  if(player != 1) {
    console.log('Failed admin action from player ' + player + ' for ' + action);
    return;
  }

  if(action == 'start' && state.state == 0) {
    startGame();
    // TODO: figure out what else admin should be able to do
  /* } else if (action == 'light' && state.state == 1) {
    gameLight(); */
  } else { 
    console.log('Unknown admin action ' + action);
  }
}

function tickGame() {
  if(state.countdown > 1) {
    state.countdown--;
    console.log('Tick ' + state.countdown);
  } else {
    clearInterval(timer);
    timer = null;
    endGame();
  }
  updateAll();
}

//TODO: figure out what this is in quiplash
/* function gameLight() {
  if(state.light != 'green') {
    state.light = 'green';
  } else {
    state.light = 'red';
  }
  announce(state.light.charAt(0).toUpperCase() + state.light.slice(1) + ' light!');
} */

// TODO: figure out game logic (player) for quiplash
/* function handleAction(action) {
  console.log('Action event: ' + action)

  if(state.state != 1) return;

  //No dead players
  const thePlayer = players.get(player);
  if(thePlayer.state != 0) return;

  console.log('Handling action: ' + action + ' from player ' + player);
  if(state.light == 'red') {
    killPlayer(player);
  } else if(lastPlayer == player) {
    tripPlayer(player);
  } else { 
    advancePlayer(player);
  }

  lastPlayer = player;
} */

//TODO: figure out quiplash alternative
/* function tripPlayer(player) {
  announce("Player " + player + " tripped over!");
  const thePlayer = players.get(player);
  thePlayer.score = 0;
} */

//TODO: figure out quiplash alternative
/* function advancePlayer(player) {
  const thePlayer = players.get(player);
  if(thePlayer.state > 0) {
    error(playersToSockets.get(player), "you have already finished!");
    return;
  }
  thePlayer.score += 1;
  announce("Player " + player + " moved forwards");
  console.log("Player " + player + " is now at " + thePlayer.score + " (+1)");
  if(thePlayer.score >= 100) {
    announce("player " + player + " is safe!");
    thePlayer.state = 1;
  }
} */

function updateAll() {
  console.log('updating all players');
  for(let [playerNumber, socket] of playersToSockets){
    updatePlayer(socket);
  }
}

function handleQuit(socket) {
  if(!socketsToPlayers.has(socket)) {
    console.log('Handling quit');
    return;
  }
  const player = socketsToPlayers.get(socket);
  socketsToPlayers.delete(socket);
  playersToSockets.delete(player);
  //killPlayer(player);

  console.log('Handling quit from player ' + player);
  announce('Goodbye player ' + player);
}

// TODO: figure out if something like this is needed.
/* function killPlayer(player) {
  console.log('Kill player ' + player);
  announce("Player " + player + " eliminated");
  const thePlayer = players.get(player);
  thePlayer.state = -1;
} */

function updatePlayer(socket){
  const playerNumber = socketsToPlayers.get(socket);
  const thePlayer = players.get(playerNumber);
  const data = {state: state, me: thePlayer, players: Object.fromEntries(players)};
  socket.emit('state',data);
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
    if(!socketsToPlayers.has(socket)) return;

    handleChat(socketsToPlayers.get(socket), message);
  });

  socket.on('join', username => {
    if(socketsToPlayers.has(socket)) return;
    handleJoin(socketsToPlayers.get(socket), username, password);
    //updateAll();
  });

  socket.on('admin', action => {
    if(!socketsToPlayers.has(socket)) return;
    handleAdmin(socketsToPlayers.get(socket), action);
    updateAll();
  });

  socket.on('action', action => {
    if(!socketsToPlayers.has(socket)) return;
    handleAction(socketsToPlayers.get(socket),action);
    updateAll();
  });

  //Handle disconnection
  socket.on('disconnect', () => {
    console.log('Dropped connection');
  });
});

//Start server
if (module === require.main) {
  startServer();
}

module.exports = server;
