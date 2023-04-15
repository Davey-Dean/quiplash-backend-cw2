'use strict';

const { response, text } = require('express');
const e = require('express');
//Set up express
const express = require('express');
const app = express();
const fetch = require('node-fetch');
const { emit } = require('process');

//Setup socket.io
const server = require('http').Server(app);
const io = require('socket.io')(server);

//API stuff
const prefix = "https://coursework1-dd1g19.azurewebsites.net/api";
//const prefix = "http://localhost:7071/api"
//const APP_KEY = "C2y6yDjf5/R+ob0N8A7Cgv30VRDJIWEHLM+4QDU5DE2nQ9nDuVTqobD4b8mGGyPMbIZnqyMsEcaGQy67XIw/Jw=="
const APP_KEY = "0Pp4ScvdFf8r1dWJHs_MQyQQZwwNQ-JLuRNyO2fUcH-lAzFuYRNUog==";

//prompts list
let curPromptsList = [];
let apiPromptsList = [];

let displaySoc = null;
let finalPlayers = new Map();
let audience = new Map();
let players = new Map();
let playersToSockets = new Map();
let socketsToPlayers = new Map();
let nextPlayerNumber = 0;

let numberToPrompt = new Map();
let numberToAnswer = new Map();
let nextRefNumber = 0;

//States for me.state: 0: still doing action, 1: action done waiting for others

//Rounds: 3 rounds total
//States for me.state: 0 Joining, 1 Prompts, 2 Answers, 3 Voting, 4 Results, 5 Scores, 6 Game Over
let state = {state: 0, round: 0 };//, countdown: 90};
let timer = null;
let displayState = 0;

let votingPrompts = []; //[ref, prompt, {ans, ref}
let voteGroupUno = [];
let voteGroupDos = [];


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

//API LOGIN CALL
async function azureLogin(username, password) {

  const the_input = {"username": username, "password": password};

  const response = await(await fetch(prefix + '/player/login', {
    method: 'POST',
    body: JSON.stringify(the_input),
    headers: {'x-functions-key' : APP_KEY },
  })).json()
 
  //console.log(response);
  return response;
}

//API REGISTER CALL
async function azureRegister(username, password) {

  const the_input = {"username": username, "password": password};

  const response = await(await fetch(prefix + '/player/register', {
    method: 'POST',
    body: JSON.stringify(the_input),
    headers: {'x-functions-key' : APP_KEY },
  })).json()
 
  //console.log(response);
  return response;
}

//API SUBMIT PROMPT CALL
async function azureCreate(username, password, prompt) {

  const the_input = {"text": prompt, "username": username , "password": password}

  const response  = await(await fetch(prefix + '/prompt/create', {
    method: 'POST',
    body: JSON.stringify(the_input),
    headers: {'x-functions-key' : APP_KEY },
  })).json()

  //console.log(response);
  return response;
}

//API grab prompts
async function azureGrabPrompts(numberOfPrompts) {

  const the_input = {"prompts" : numberOfPrompts}

  const response = await(await fetch(prefix + '/prompts/get', {
    method: 'POST',
    body: JSON.stringify(the_input),
    headers: {'x-functions-key' : APP_KEY},
  })).json()

  //console.log(response + " response from API GET PROMPT");
  return response;
}

//API update games played and scores for all players
async function azureUpdateScores(username, passowrd, finalScore) {

  const the_input = {"username": username , "password": passowrd , "add_to_games_played": 1 , "add_to_score" : finalScore }

  const response = await(await fetch(prefix + '/player/update', {
    method: 'POST',
    body: JSON.stringify(the_input),
    headers: {'x-functions-key' : APP_KEY},
  })).json()

  console.log(JSON.stringify(response) + " response from API UPDATE");
  return response;
}

//Login
async function handleLogin(socket, username, password) {
  console.log('2 login event');

  //checks if username is already logged into game
  for (const [key, value] of players.entries()) {
    if (value.name == username) {
      console.log("ERROR USER ALREADY LOGGED IN")
      error(socket, "User already logged in", false);
      return;
    }
  }

  //perform api check
  const resp = await(azureLogin(username, password));

  if (resp.result == false) {
    console.log('2 error')
    error(socket, resp.msg, false);
    return;
  } else {

    nextPlayerNumber++;
    
    //console.log('players.size = ' + players.size)
    if ((state.state > 0) | (players.size >= 8)) {

      console.log('too many users');
      error(socket,'The game has already started or there are too many players, added as audience member',false);
      audience.set(nextPlayerNumber, {name: username, number: nextPlayerNumber, state: 1, player: false});

    } else {

      console.log('2 Welcome to player ' + username + " " + password);
      announce('Welcome Player: ' + username);
      players.set(nextPlayerNumber, {name: username, password: password, number: nextPlayerNumber, state: 1, roundScore: 0, totalScore: 0, prompts: [], player: true});
    }

    playersToSockets.set(nextPlayerNumber, socket);
    socketsToPlayers.set(socket, nextPlayerNumber);
    console.log('2 fin');
  }
}

//Register
async function handleRegister(socket, username, password) {
  console.log('2 register event');

  const resp = await(azureRegister(username, password));

  if (resp.result == false) {
    console.log('2 error')
    error(socket, resp.msg, false);
    return;
  } else {
    await handleLogin(socket, username, password);
  }
}

//submit prompt
async function handlePrompt(socket, username, password, prompt) {

  const playerNumber = socketsToPlayers.get(socket);
  //console.log((players.get(playerNumber))['state']);
  const resp = await(azureCreate(username, password, prompt));

  if (resp.result == false) {
    console.log('prompt error')
    error(socket, resp.msg, false);
    return;
  } else {
    console.log('prompt submitted: ' + prompt);

    //add prompt to list
    curPromptsList.push(prompt);

    if (players.has(playerNumber)) {
      players.get(playerNumber)['state'] = 1;
    } else {
      audience.get(playerNumber)['state'] = 1;
    }
  }
}

function handleAnswer(socket, username, inAnswer, prompt) {

  const playerNumber = socketsToPlayers.get(socket);

  if (inAnswer == "") {
    console.log('answer error')
    error(socket, "answer cannot be empty!", false);
    return;
  } else {

    let userAnswer = {answer: inAnswer, user: playerNumber, name: players.get(playerNumber)['name']};

    //adds answers to numberToAnswer
    if (numberToAnswer.has(prompt['ref'])) {
      numberToAnswer.get(prompt['ref']).push(userAnswer);
    } else {
      numberToAnswer.set(prompt['ref'], [userAnswer]);
    }
    //?how to grab whole "userAnswer"
    //console.log(JSON.stringify(numberToAnswer.get(prompt['ref'])));
    //?how to grab answer
    //console.log(numberToAnswer.get(prompt['ref'])['answer']);
    
    players.get(playerNumber)['prompts'].splice(0, 1);

    if (players.get(playerNumber)['prompts'].length == 0) {
       players.get(playerNumber)['state'] = 1;
    } else {
      console.log('first prompt submitted');
    }
  }
}

function handleVote(socket, votePrompt, vote, username) {

  const playerNumber = socketsToPlayers.get(socket);
  const answerOwner = votePrompt[2][vote]['user'];

  if (answerOwner == playerNumber) {
    console.log('vote error')
    error(socket, "You cannot vote for your own answer!", false);
    return;
  } else{

    players.get(answerOwner)['roundScore'] += state.round * 100

    if (vote == 0) {
      voteGroupUno.push(username);
    } else if (vote == 1) {
      voteGroupDos.push(username);
    } else {
      console.log('Unknown vote?!?!')
    }
    
    if (players.has(playerNumber)) {
      players.get(playerNumber)['state'] = 1;
    } else {
      audience.get(playerNumber)['state'] = 1;
    }
  }
}

async function handleAdmin(player, action) {

  if(player != 1) {
    console.log('Failed admin action from player ' + player + ' for ' + action);
    return;
  }

  if (players.size < 2) {
    console.log('Not enough players to continue game')
    error(playersToSockets.get(player), "Not enough players to continue", false);
    return;
  }

  if(action == 'start' && state.state == 0) {
    await startGame();
  } else if (action == 'advance' && state.state == 1) {
    advanceToAnswer(player);
  } else if (action == 'advance' && state.state == 2) {
    advanceToVoting(player);
  } else if (action == 'advance' && state.state == 3) {
    advanceToResult(player);
  } else if (action == 'next' && state.state == 4) {
    showNextPrompt(player);
  } else if (action == 'advance' && state.state == 4) {
    advanceToScore(player);
  } else if (action == 'advance' && state.state == 5) {
    await advanceFromScore(player);
  } else {
    console.log('Unknown admin action: ' + action);
  }
}

//Start Game
async function startGame() {
  console.log('Game Starting');
  announce('Let the games begin!');

  for(const [playerNumber, player] of players) {
    //players state set to not done current action
    player.state = 0;
  }

  for (const [audienceNumber, aud] of audience) {
    //audience state set to not done enter prompt
    aud.state = 0;
  }

  //advance game state to prompts phase
  state.round = 1;
  state.state = 1;
  displayState = 1;

  //grab all prompts required from API for game
  const numPlayers = players.size;
  let apiPrompts = 0;

  if (numPlayers % 2 == 0) {
    //numPlayers / 4 gives prompts needed from api per round, then * 3 for all rounds
    apiPrompts = (Math.floor(numPlayers / 4)) * 3;
    //console.log(numPlayers, " + ", apiPrompts + "numPlayers + ApiPrompts");

  } else {
    //odd player count
    apiPrompts = (Math.floor(numPlayers / 2)) * 3;
    //console.log(numPlayers + apiPrompts + "numPlayers + ApiPrompts");
  }

  const resp = await (azureGrabPrompts(apiPrompts));
  console.log(JSON.stringify(resp));
  for (const p of resp) {
    apiPromptsList.push(p.text);
  }
}

//Advance to answers
function advanceToAnswer(adminPlayer) {
  // ! inefficent having two of the same for loops,
  // ! however had an issue where the players checked that were reset to state 0, where then able
  // ! to submit a second prompt
  for(const [playerNumber, player] of players) {
    //check all players have submitted a prompt
    if (player['state'] != 1) {
      console.log('not all players ready')
      error(playersToSockets.get(adminPlayer), 'Please wait for every PLAYER to submit a prompt', false);
      return;
    }
  }

  for (const [playerNumber, player] of players) {
    //reset player action to 0
    player.state = 0;
  }

  for (const [audNumber, audMember] of audience) {
    //reset player action to 0
    audMember.state = 0;
  }

  console.log('Game Advancing to Answers');
  announce('Moving to Answering Prompts');
  assignPrompts();
  state.state = 2;
  displayState = 2;
}

//Advance to answers
function advanceToVoting(adminPlayer) {

  for(const [playerNumber, player] of players) {
    //check all players have submitted a prompt
    if (player['state'] != 1) {
      console.log('not all players ready')
      error(playersToSockets.get(adminPlayer), 'Please wait for every PLAYER to submit an answer', false);
      return;
    }
  }

  for (const [playerNumber, player] of players) {
    //reset player action to 0
    player.state = 0;
  }

  for (const [audNumber, audMember] of audience) {
    //reset player action to 0
    audMember.state = 0;
  }

  organisePrommptsAns();
  console.log('Game Advancing to Voting');
  announce('Moving to Voting');
  state.state = 3;
  displayState = 3;
}

//show next prompt for voting
function showNextPrompt(adminPlayer) {

  console.log('show next prompt!');
  console.log('remove prompt in [0]');
  //remove first prompt (already voted on)
  votingPrompts.splice(0, 1);

  //reset voting groups
  voteGroupUno = [];
  voteGroupDos = [];

  //move back to voting
  state.state = 3;
  displayState = 3;
}

//Advance to results
function advanceToResult(adminPlayer) {

  for(const [playerNumber, player] of players) {
    //check all players have submitted a prompt
    if (player['state'] != 1) {
      console.log('not all players ready')
      error(playersToSockets.get(adminPlayer), 'Please wait for every PLAYER to submit a vote', false);
      return;
    }
  }

  for (const [playerNumber, player] of players) {
    //reset player action to 0
    player.state = 0;
  }

  for (const [audNumber, audMember] of audience) {
    //reset player action to 0
    audMember.state = 0;
  }

  console.log('Game Advancing to Result');
  announce('Moving to Result');
  state.state = 4;
  displayState = 4;
}

//Advance to round scores / final scores
function advanceToScore(adminPlayer) {

  for(const [playerNumber, player] of players) {
    //players state set to not done current action
    player.totalScore += player.roundScore;
    player.roundScore = 0;
  }

  if (state.round == 3){ 
    console.log('Game Advancing to Final Scores');
    announce('Moving to Final Scores');
  } else {
    console.log('Game Advancing to Scores');
    announce('Moving to Scores');
  }
  
  state.state = 5;
  displayState = 5;
}

//Advance from scores (to next round or game over)
async function advanceFromScore(adminPlayer) {

  if (state.round == 3){ 
    console.log('Game Over');
    for (const [num, player] of players) {
      await azureUpdateScores(player['name'],player['password'],player['totalScore']);
    }
    finalPlayers = new Map(players);
    state.state = 6;
    announce('Game Over');
  } else {
    console.log('Game Advancing to Next Round');
    announce('Moving to Next Round');

    for (const [playerNumber, player] of players) {
      //reset player action to 0
      player.state = 0;
    }
  
    for (const [audNumber, audMember] of audience) {
      //reset player action to 0
      audMember.state = 0;
    }

    //reset all values for next round
    votingPrompts.splice(0, 1);
    voteGroupUno = [];
    voteGroupDos = [];
    numberToPrompt.clear();
    numberToAnswer.clear();

    //advance game state to prompts phase
    state.round += 1;
    state.state = 1;
    displayState = 1;
  }
}

//put prompts and answers into a list for client
function organisePrommptsAns() {

  for (const [ref, prompt] of numberToPrompt) {

    let answer = numberToAnswer.get(ref);

    votingPrompts.push([ref, prompt, answer]);
  }
}

//Assign Prompts to Players for Round
function assignPrompts() {
  console.log('Assigning Prompts to Players');
  const iteratorPlayers = players.entries();
  const numPlayers = players.size;
  let promptsRequired = 0;
  let localPrompts = 0;
  let apiPrompts = 0;
  let combinedPrompts = [];

  //console.log(numPlayers + ' numPlayers');
  //if even amount of players
  if (numPlayers % 2 == 0) {
    promptsRequired = (numPlayers / 2);
    localPrompts = Math.ceil(promptsRequired / 2);
    apiPrompts = Math.floor(promptsRequired / 2);

    //console.log('apiPrompts = ' + apiPrompts);
    //console.log('APIpromptslistSIZE = ' + apiPromptsList.length);

    //check enough API prompts left if not restructure prompts
    //console.log('if api - apisize ' + apiPrompts + " - " + apiPromptsList.length)
    if (apiPrompts - apiPromptsList.length > 0 ) {
      localPrompts += (apiPrompts - apiPromptsList.length);
      apiPrompts -= (apiPrompts - apiPromptsList.length);
    }

    //combine two lists
    for (let i = 0; i < localPrompts; i++) {
      let randomPrompt = curPromptsList[Math.floor(Math.random() * curPromptsList.length)];
      combinedPrompts.push(randomPrompt);
      curPromptsList.splice(curPromptsList.indexOf(randomPrompt), 1);
    }
    for (let i = 0; i < apiPrompts; i++) {
      let randomPrompt = apiPromptsList[Math.floor(Math.random() * apiPromptsList.length)];
      combinedPrompts.push(randomPrompt);
      apiPromptsList.splice(apiPromptsList.indexOf(randomPrompt), 1);
    }//finish combine
    
    //assign prompts to players
    for (let i = 0; i < (localPrompts + apiPrompts); i++) {
      //console.log("I = " + i)
      nextRefNumber++;
      
      let randomPrompt = combinedPrompts[Math.floor(Math.random() * combinedPrompts.length)];

      numberToPrompt.set(nextRefNumber, randomPrompt);

      let curPlayerANum = (iteratorPlayers.next().value)[0];
      players.get(curPlayerANum)['prompts'].push({ref: nextRefNumber, prompt: randomPrompt});

      let curPlayerBNum = (iteratorPlayers.next().value)[0];
      players.get(curPlayerBNum)['prompts'].push({ref: nextRefNumber, prompt: randomPrompt});

      //console.log(combinedPrompts + ' BEFORE');
      combinedPrompts.splice(combinedPrompts.indexOf(randomPrompt), 1);
      //console.log(combinedPrompts + ' AFTER');
    }
  } else {
    //odd amount of players
    promptsRequired = numPlayers;
    localPrompts = Math.ceil(promptsRequired / 2);
    apiPrompts = Math.floor(promptsRequired / 2);

    //console.log('apiPrompts = ' + apiPrompts);
    //console.log('APIpromptslistSIZE = ' + apiPromptsList.length);
    //check enough API prompts left if not restructure prompts
    //console.log('if api - apisize ' + apiPrompts + " - " + apiPromptsList.length)
    if (apiPrompts - apiPromptsList.length > 0 ) {
      localPrompts += (apiPrompts - apiPromptsList.length);
      apiPrompts -= (apiPrompts - apiPromptsList.length);
    }

    //combine two lists
    for (let i = 0; i < localPrompts; i++) {
      let randomPrompt = curPromptsList[Math.floor(Math.random() * curPromptsList.length)];
      combinedPrompts.push(randomPrompt);
      curPromptsList.splice(curPromptsList.indexOf(randomPrompt), 1);
    }
    for (let i = 0; i < apiPrompts; i++) {
      let randomPrompt = apiPromptsList[Math.floor(Math.random() * apiPromptsList.length)];
      combinedPrompts.push(randomPrompt);
      apiPromptsList.splice(apiPromptsList.indexOf(randomPrompt), 1);
    }//finish combine

    if (numPlayers == 1) {
      console.log('Not enough players to continue');
      return;

    } else if (numPlayers == 3) {
      // 3 players
      let randomPromptOne = combinedPrompts[Math.floor(Math.random() * combinedPrompts.length)];
      combinedPrompts.splice(combinedPrompts.indexOf(randomPromptOne), 1);
      let randomPromptTwo = combinedPrompts[Math.floor(Math.random() * combinedPrompts.length)];
      combinedPrompts.splice(combinedPrompts.indexOf(randomPromptTwo), 1);
      let randomPromptThree = combinedPrompts[Math.floor(Math.random() * combinedPrompts.length)];
      combinedPrompts.splice(combinedPrompts.indexOf(randomPromptThree), 1);

      let refUno = nextRefNumber++; //1
      numberToPrompt.set(refUno, randomPromptOne);
      let refDos = nextRefNumber++; //2
      numberToPrompt.set(refDos, randomPromptTwo);
      let refTres = nextRefNumber++; //3
      numberToPrompt.set(refTres, randomPromptThree);

      //assign player one prompts
      let curPlayerOneNum = (iteratorPlayers.next().value)[0];
      players.get(curPlayerOneNum)['prompts'].push({ref: refUno, prompt: randomPromptOne});
      players.get(curPlayerOneNum)['prompts'].push({ref: refDos, prompt: randomPromptTwo});

      //assign player two prompts
      let curPlayerTwoNum = (iteratorPlayers.next().value)[0];
      players.get(curPlayerTwoNum)['prompts'].push({ref: refUno, prompt: randomPromptOne});
      players.get(curPlayerTwoNum)['prompts'].push({ref: refTres, prompt: randomPromptThree});

      //assign player two prompts
      let curPlayerThreeNum = (iteratorPlayers.next().value)[0];
      players.get(curPlayerThreeNum)['prompts'].push({ref: refDos, prompt: randomPromptTwo});
      players.get(curPlayerThreeNum)['prompts'].push({ref: refTres, prompt: randomPromptThree});

    } else if (numPlayers == 5) {
      // 5 players
      let randomPromptOne = combinedPrompts[Math.floor(Math.random() * combinedPrompts.length)];
      combinedPrompts.splice(combinedPrompts.indexOf(randomPromptOne), 1);
      let randomPromptTwo = combinedPrompts[Math.floor(Math.random() * combinedPrompts.length)];
      combinedPrompts.splice(combinedPrompts.indexOf(randomPromptTwo), 1);
      let randomPromptThree = combinedPrompts[Math.floor(Math.random() * combinedPrompts.length)];
      combinedPrompts.splice(combinedPrompts.indexOf(randomPromptThree), 1);
      let randomPromptFour = combinedPrompts[Math.floor(Math.random() * combinedPrompts.length)];
      combinedPrompts.splice(combinedPrompts.indexOf(randomPromptFour), 1);
      let randomPromptFive = combinedPrompts[Math.floor(Math.random() * combinedPrompts.length)];
      combinedPrompts.splice(combinedPrompts.indexOf(randomPromptFive), 1);

      let refUno = nextRefNumber++; //1
      numberToPrompt.set(refUno, randomPromptOne);
      let refDos = nextRefNumber++; //2
      numberToPrompt.set(refDos, randomPromptTwo);
      let refTres = nextRefNumber++; //3
      numberToPrompt.set(refTres, randomPromptThree);
      let refQuad = nextRefNumber++; //4
      numberToPrompt.set(refQuad, randomPromptFour);
      let refCin = nextRefNumber++; //5
      numberToPrompt.set(refCin, randomPromptFive);      

      //assign player one prompts
      let curPlayerOneNum = (iteratorPlayers.next().value)[0];
      players.get(curPlayerOneNum)['prompts'].push({ref: refUno, prompt: randomPromptOne});
      players.get(curPlayerOneNum)['prompts'].push({ref: refTres, prompt: randomPromptThree});

      //assign player two prompts
      let curPlayerTwoNum = (iteratorPlayers.next().value)[0];
      players.get(curPlayerTwoNum)['prompts'].push({ref: refUno, prompt: randomPromptOne});
      players.get(curPlayerTwoNum)['prompts'].push({ref: refQuad, prompt: randomPromptFour});

      //assign player three prompts
      let curPlayerThreeNum = (iteratorPlayers.next().value)[0];
      players.get(curPlayerThreeNum)['prompts'].push({ref: refDos, prompt: randomPromptTwo});
      players.get(curPlayerThreeNum)['prompts'].push({ref: refQuad, prompt: randomPromptFour});

      //assign player four prompts
      let curPlayerFourNum = (iteratorPlayers.next().value)[0];
      players.get(curPlayerFourNum)['prompts'].push({ref: refDos, prompt: randomPromptTwo});
      players.get(curPlayerFourNum)['prompts'].push({ref: refCin, prompt: randomPromptFive});

      //assign player five prompts
      let curPlayerFiveNum = (iteratorPlayers.next().value)[0];
      players.get(curPlayerFiveNum)['prompts'].push({ref: refTres, prompt: randomPromptThree});
      players.get(curPlayerFiveNum)['prompts'].push({ref: refCin, prompt: randomPromptFive});

    } else if (numPlayers == 7) {
      // 7 players
      let randomPromptOne = combinedPrompts[Math.floor(Math.random() * combinedPrompts.length)];
      combinedPrompts.splice(combinedPrompts.indexOf(randomPromptOne), 1);
      let randomPromptTwo = combinedPrompts[Math.floor(Math.random() * combinedPrompts.length)];
      combinedPrompts.splice(combinedPrompts.indexOf(randomPromptTwo), 1);
      let randomPromptThree = combinedPrompts[Math.floor(Math.random() * combinedPrompts.length)];
      combinedPrompts.splice(combinedPrompts.indexOf(randomPromptThree), 1);
      let randomPromptFour = combinedPrompts[Math.floor(Math.random() * combinedPrompts.length)];
      combinedPrompts.splice(combinedPrompts.indexOf(randomPromptFour), 1);
      let randomPromptFive = combinedPrompts[Math.floor(Math.random() * combinedPrompts.length)];
      combinedPrompts.splice(combinedPrompts.indexOf(randomPromptFive), 1);
      let randomPromptSix = combinedPrompts[Math.floor(Math.random() * combinedPrompts.length)];
      combinedPrompts.splice(combinedPrompts.indexOf(randomPromptSix), 1);
      let randomPromptSeven = combinedPrompts[Math.floor(Math.random() * combinedPrompts.length)];
      combinedPrompts.splice(combinedPrompts.indexOf(randomPromptSeven), 1);

      let refUno = nextRefNumber++; //1
      numberToPrompt.set(refUno, randomPromptOne);
      let refDos = nextRefNumber++; //2
      numberToPrompt.set(refDos, randomPromptTwo);
      let refTres = nextRefNumber++; //3
      numberToPrompt.set(refTres, randomPromptThree);
      let refQuad = nextRefNumber++; //4
      numberToPrompt.set(refQuad, randomPromptFour);
      let refCin = nextRefNumber++; //5
      numberToPrompt.set(refCin, randomPromptFive); 
      let refSeis = nextRefNumber++; //6
      numberToPrompt.set(refSeis, randomPromptSix);
      let refSiete = nextRefNumber++; //7
      numberToPrompt.set(refSiete, randomPromptSeven);

      //assign player one prompts
      let curPlayerOneNum = (iteratorPlayers.next().value)[0];
      players.get(curPlayerOneNum)['prompts'].push({ref: refUno, prompt: randomPromptOne});
      players.get(curPlayerOneNum)['prompts'].push({ref: refQuad, prompt: randomPromptFour});

      //assign player two prompts
      let curPlayerTwoNum = (iteratorPlayers.next().value)[0];
      players.get(curPlayerTwoNum)['prompts'].push({ref: refUno, prompt: randomPromptOne});
      players.get(curPlayerTwoNum)['prompts'].push({ref: refCin, prompt: randomPromptFive});

      //assign player three prompts
      let curPlayerThreeNum = (iteratorPlayers.next().value)[0];
      players.get(curPlayerThreeNum)['prompts'].push({ref: refDos, prompt: randomPromptTwo});
      players.get(curPlayerThreeNum)['prompts'].push({ref: refCin, prompt: randomPromptFive});

      //assign player four prompts
      let curPlayerFourNum = (iteratorPlayers.next().value)[0];
      players.get(curPlayerFourNum)['prompts'].push({ref: refDos, prompt: randomPromptTwo});
      players.get(curPlayerFourNum)['prompts'].push({ref: refSeis, prompt: randomPromptSix});

      //assign player five prompts
      let curPlayerFiveNum = (iteratorPlayers.next().value)[0];
      players.get(curPlayerFiveNum)['prompts'].push({ref: refTres, prompt: randomPromptThree});
      players.get(curPlayerFiveNum)['prompts'].push({ref: refSeis, prompt: randomPromptSix});

      //assign player six prompts
      let curPlayerSixNum = (iteratorPlayers.next().value)[0];
      players.get(curPlayerSixNum)['prompts'].push({ref: refTres, prompt: randomPromptThree});
      players.get(curPlayerSixNum)['prompts'].push({ref: refSiete, prompt: randomPromptSeven});

      //assign player seven prompts
      let curPlayerSevenNum = (iteratorPlayers.next().value)[0];
      players.get(curPlayerSevenNum)['prompts'].push({ref: refQuad, prompt: randomPromptFour});
      players.get(curPlayerSevenNum)['prompts'].push({ref: refSiete, prompt: randomPromptSeven});
      
    } else {
      console.log("unknown player count");
    }
  }
}

//! not using timer, not in spec
function tickGame() {
  if(state.countdown > 1) {
    state.countdown--;
    console.log('Tick ' + state.countdown);
  } else {
    clearInterval(timer);
    timer = null;
  }
  updateAll();
}

//Quit function
function handleQuit(socket) {
  if(!socketsToPlayers.has(socket)) {
    console.log('Handling quit');
    return;
  }
  const player = socketsToPlayers.get(socket);
  
  if (players.has(player)) {
    const playerName = (players.get(player)).name
    players.delete(player);
    socketsToPlayers.delete(socket);
    playersToSockets.delete(player);
    console.log('Handling quit from player ' + playerName);
    announce('Goodbye Player: ' + playerName);
  } else {
    const audName = (audience.get(player)).name
    audience.delete(player);
    socketsToPlayers.delete(socket);
    playersToSockets.delete(player);
    console.log('Handling quit from aud ' + audName);
  }  
}

//Update state of all players
function updateAll() {
  console.log('3 updating all players');
  for(let [playerNumber, socket] of playersToSockets){
    updatePlayer(socket);
  }
  updateDisplay();
}

//Update one player
function updatePlayer(socket) {

  const playerNumber = socketsToPlayers.get(socket);

  if (players.has(playerNumber)) {
    const thePlayer = players.get(playerNumber);
    const data = { state: state, me: thePlayer, players: Object.fromEntries(players), audience: Object.fromEntries(audience), votingPrompts: votingPrompts, voteGroupUno: voteGroupUno, voteGroupDos, voteGroupDos };
    //console.log('data' + data);
    socket.emit('state',data);
  } else {
    const thePlayer = audience.get(playerNumber);
    const data = { state: state, me: thePlayer, players: Object.fromEntries(players), audience: Object.fromEntries(audience), votingPrompts: votingPrompts, voteGroupUno: voteGroupUno, voteGroupDos, voteGroupDos };
    //console.log('data' + data);
    socket.emit('state',data); 
  }
}

function updateDisplay() {

  const data = { state: state, players: Object.fromEntries(players), audience: Object.fromEntries(audience), votingPrompts: votingPrompts, voteGroupUno: voteGroupUno, voteGroupDos, voteGroupDos };
  if (displaySoc != null) {
    displaySoc.emit('stateDis', data);
    if (state.state == 6) {
      displaySoc.emit('finalDis', {finalPlayers: Object.fromEntries(finalPlayers)});
    }
  } else {
    console.log('ERROR no display connected')
  }
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

  console.log('socket + ' + socket.handshake.url);

  //Handle display connection
  socket.on('displaySocket', () => {
    console.log('new display connected');
    displaySoc = socket;
    updateDisplay();
  })

  //Handle on chat message received
  socket.on('chat', message => {
    handleChat(message);
  });

  //Handle admin actions
  socket.on('admin', async action => {
    if(!socketsToPlayers.has(socket)) return;
    await (handleAdmin(socketsToPlayers.get(socket), action));
    updateAll();
  })

  //Handle disconnection
  socket.on('disconnect', () => {
    console.log('Dropped connection');
    handleQuit(socket);
    updateAll();
  });

  //Handle login
  socket.on('login', async (username, password) => {
    if(socketsToPlayers.has(socket)) return;
    await handleLogin(socket, username, password);
    updateAll(); 
  });

  //Handle register
  socket.on('register', async (username, password) => {
    if(socketsToPlayers.has(socket)) return;
    await handleRegister(socket, username, password);
    updateAll();
  });

  //Handle prompt input
  socket.on('submitPrompt', async (username, password, prompt) => {
    //console.log("REACHED HERE");
    await handlePrompt(socket, username, password, prompt);
    updateAll();
  });

  //Handle answer inpt
  socket.on('submitAnswer', (username, answer, prompt) => {
    //console.log("REACHED HERE");
    handleAnswer(socket, username, answer, prompt);
    updateAll();
  });

  //Handle vote selection
  socket.on('submitVote', (votePrompt, vote, username) => {
    //console.log("REACHED HERE");
    handleVote(socket, votePrompt, vote, username);
    updateAll();
  });

});

//Start server
if (module === require.main) {
  startServer();
}

module.exports = server;
