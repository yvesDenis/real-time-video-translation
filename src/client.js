const MicrophoneStream = require('microphone-stream').default; // collect microphone input as a stream of raw bytes

let transcription = "";
let socket;
let micStream;
let socketError = false;
let transcribeException = false;

$('#start-button').click(function () {
    $('#error').hide(); // hide any existing errors
    toggleStartStop(true); // disable start and enable stop button

    // first we get the microphone input from the browser (as a promise)...
    window.navigator.mediaDevices.getUserMedia({
            video: false,
            audio: true
        })
        // ...then we convert the mic stream to binary event stream messages when the promise resolves 
        .then(streamAudioToWebSocket) 
        .catch(function (error) {
            console.error(error);
            showError('There was an error streaming your audio to Amazon Transcribe. Please try again.');
            toggleStartStop();
        });
});

let streamAudioToWebSocket = function (userMediaStream) {
    //let's get the mic input from the browser, via the microphone-stream module
    micStream = new MicrophoneStream();

    micStream.setStream(userMediaStream);

    //open up our WebSocket connection
    socket = new WebSocket("ws://localhost:3000");
    socket.binaryType = "arraybuffer";

    // when we get audio data from the mic, send it to the WebSocket if possible
    socket.onopen = function() {
        micStream.on('data', function(rawAudioChunk) {
            // the audio stream is raw audio bytes. Transcribe expects PCM with additional metadata, encoded as binary
            if (socket.readyState === socket.OPEN){
                console.log("Sending data")
                socket.send(rawAudioChunk);
            }
        }
    )};

    // handle messages, errors, and close events
    wireSocketEvents();
}

function wireSocketEvents() {
    // handle inbound messages from Amazon Transcribe
    socket.onmessage = function (message) {
        console.log("received message client")
        //convert the binary event stream message to JSON
        if(message != undefined){
            $('#transcript').val(transcription + message + "\n");
        } else {
            transcribeException = true;
            //showError(messageBody.Message);
            toggleStartStop();
        }
    };

    socket.onerror = function (error) {
        console.log("Error received :"+error)
        socketError = true;
        showError('WebSocket connection error. Try again.');
        toggleStartStop();
    };
    
    socket.onclose = function (closeEvent) {
        micStream.stop();
        
        // the close event immediately follows the error event; only handle one.
        if (!socketError && !transcribeException) {
            if (closeEvent.code != 1000) {
                showError('</i><strong>Streaming Exception</strong><br>' + closeEvent.reason);
            }
            toggleStartStop();
        }
    };
}

let closeSocket = function () {
    if (socket.readyState === socket.OPEN) {
        micStream.stop();
    }
}

$('#stop-button').click(function () {
    closeSocket();
    toggleStartStop();
});

$('#reset-button').click(function (){
    $('#transcript').val('');
    transcription = '';
});

function toggleStartStop(disableStart = false) {
    $('#start-button').prop('disabled', disableStart);
    $('#stop-button').attr("disabled", !disableStart);
}

function showError(message) {
    $('#error').html('<i class="fa fa-times-circle"></i> ' + message);
    $('#error').show();
}