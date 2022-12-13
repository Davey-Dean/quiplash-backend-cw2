var socket = null;

//Prepare game
var app = new Vue({
    el: '#game',
    data: {
        error: null,
        chatmessage: '',
        username: '',
        password: '',
        me: { name: '', state: 0, score: 0 },
        state: { state: false },
        players: {},
    },
    mounted: function() {
        connect(); 
    },
    methods: {
        handleChat(message) {
            if(this.messages.length + 1 > 10) {
                this.messages.pop();
            }
            this.messages.unshift(message);
        },
        chat() {
            socket.emit('chat',this.chatmessage);
            this.chatmessage = '';
        },
        login() {
            socket.emit('login', this.username, this.password);
        },
        update(data) {
            this.me = data.me;
            this.state = data.state;
            this.players = data.players;
        },
    }
});

function connect() {
    //Prepare web socket
    socket = io();

    //Connect
    socket.on('connect', function() {
        //Set connected state to true
        app.state.state = 0;
    });

    //state update
    socket.on('state', function(data) {
        app.update(data);
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

     //Handle incoming chat message
    socket.on('chat', function(message) {
        app.announce(message);
    });
}
