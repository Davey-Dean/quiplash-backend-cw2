var socket = null;

//Prepare game
var app = new Vue({
    el: '#display',
    data: {
        state: { state: false, round: 0 },
        players: {},
        finalPlayers: {},
        audience: {},
        votingPrompts: [],
        voteGroupUno: [],
        voteGroupDos: []
    },
    mounted: function() {
        connect(); 
    },
    methods: {
        update(data) {
            this.state = data.state;
            this.players = data.players;
            this.audience = data.audience;
            this.votingPrompts = data.votingPrompts;
            this.voteGroupUno = data.voteGroupUno;
            this.voteGroupDos = data.voteGroupDos;
        },
        updateP(data) {
            this.finalPlayers = data.finalPlayers;
        },
        fail(message) {
            this.error = message;
            setTimeout(clearError, 3000);
        }
    }
});

function connect() {
    //Prepare web socket
    socket = io();

    //Connect
    socket.on('connect', function() {
        //Set connected state to true
        app.state.state = 0;
        socket.emit('displaySocket');
    });

    //state update
    socket.on('stateDis', function(data) {
        app.update(data);
    });

    //state update
    socket.on('finalDis', function(data) {
        app.updateP(data);
    });

    //Handle connection error
    socket.on('connect_error', function(message) {
        alert('Unable to connect: ' + message);
    });

    //Handle disconnection
    socket.on('disconnect', function() {
        alert('Disconnected');
        app.state.state = 0;
    });

}
