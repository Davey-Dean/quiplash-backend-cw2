var socket = null;

//Prepare game
var app = new Vue({
    el: '#game',
    data: {
        error: null,
        chatmessage: '',
        username: '',
        password: '',
        me: { name: '', state: false, roundScore: 0, totalScore: 0, prompts: [] },
        state: { state: false, round: 0 },
        players: {},
        audience: {},
        prompt: '',
        answer: '',
        votingPrompts: [],
        voteGroupUno: [],
        voteGroupDos: []
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
        announce(message) {
            const messages = document.getElementById('messages');
            var item = document.createElement('li');
            item.textContent = message;
            messages.prepend(item);
        },
        admin(command) {
            socket.emit('admin', command);
        },
        login() {
            socket.emit('login', this.username, this.password);
        },
        register() {
            socket.emit('register', this.username, this.password);
        },
        submitPrompt(prompt) {
            socket.emit('submitPrompt', this.username, this.password, prompt);
            clearPrompt(prompt);
        },
        submitAnswer(answer) {
            socket.emit('submitAnswer', this.username, answer, this.me.prompts[0]);
            app.answer = '';
        },
        submitVote(vote) {
            socket.emit('submitVote', this.votingPrompts[0], vote, this.username);
        },
        update(data) {
            this.me = data.me;
            this.state = data.state;
            this.players = data.players;
            this.audience = data.audience;
            this.votingPrompts = data.votingPrompts;
            this.voteGroupUno = data.voteGroupUno;
            this.voteGroupDos = data.voteGroupDos;
        },
        fail(message) {
            this.error = message;
            setTimeout(clearError, 3000);
        }
    }
});

function clearError() {
    app.error = null;
}

function clearPrompt(input) {
    if (19 < input.length && input.length < 101) {
        app.prompt = '';
    }
}

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

    socket.on('fail', function(message) {
        app.fail(message);
    })

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
