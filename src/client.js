const MicrophoneStream = require('microphone-stream').default // collect microphone input as a stream of raw bytes

let transcription = ''
let socket
let micStream
let sampleRate
let inputSampleRate
let socketError = false
let transcribeException = false

$('#start-button').click(function () {
  $('#error').hide() // hide any existing errors
  toggleStartStop(true) // disable start and enable stop button

  // first we get the microphone input from the browser (as a promise)...
  window.navigator.mediaDevices
    .getUserMedia({
      video: false,
      audio: true,
    })
    // ...then we convert the mic stream to binary event stream messages when the promise resolves
    .then(streamAudioToWebSocket)
    .catch(function (error) {
      console.error(error)
      showError('There was an error streaming your audio to Amazon Transcribe. Please try again.')
      toggleStartStop()
    })
})

let streamAudioToWebSocket = function (userMediaStream) {
  //let's get the mic input from the browser, via the microphone-stream module
  micStream = new MicrophoneStream()

  micStream.on('format', function (data) {
    inputSampleRate = data.sampleRate
  })

  micStream.setStream(userMediaStream)

  //open up our WebSocket connection
  socket = new WebSocket('ws://localhost:3000')
  socket.binaryType = 'arraybuffer'

  // when we get audio data from the mic, send it to the WebSocket if possible
  socket.onopen = function () {
    micStream.on('data', function (rawAudioChunk) {
      // the audio stream is raw audio bytes. Transcribe expects PCM with additional metadata, encoded as binary
      let binary = convertAudioToBinaryMessage(rawAudioChunk)

      if (socket.readyState === socket.OPEN) {
        socket.send(binary)
      }
    })
  }

  // handle messages, errors, and close events
  wireSocketEvents()
}

function wireSocketEvents() {
  // handle inbound messages from Amazon Transcribe
  socket.onmessage = function (message) {
    console.log('received message client ' + message)
    //convert the binary event stream message to JSON
    if (message != undefined) {
      $('#transcript').val(transcription + message + '\n')
    } else {
      transcribeException = true
      //showError(messageBody.Message);
      toggleStartStop()
    }
  }

  socket.onerror = function (error) {
    console.log('Error received :' + error)
    socketError = true
    showError('WebSocket connection error. Try again.')
    toggleStartStop()
  }

  socket.onclose = function (closeEvent) {
    micStream.stop()

    // the close event immediately follows the error event; only handle one.
    if (!socketError && !transcribeException) {
      if (closeEvent.code != 1000) {
        showError('</i><strong>Streaming Exception</strong><br>' + closeEvent.reason)
      }
      toggleStartStop()
    }
  }
}

let closeSocket = function () {
  if (socket.readyState === socket.OPEN) {
    micStream.stop()
    socket.send(null)
  }
}

$('#stop-button').click(function () {
  closeSocket()
  toggleStartStop()
})

$('#reset-button').click(function () {
  $('#transcript').val('')
  transcription = ''
})

function toggleStartStop(disableStart = false) {
  $('#start-button').prop('disabled', disableStart)
  $('#stop-button').attr('disabled', !disableStart)
}

function showError(message) {
  $('#error').html('<i class="fa fa-times-circle"></i> ' + message)
  $('#error').show()
}

function downsampleBuffer(buffer, inputSampleRate = 44100, outputSampleRate = 16000) {
  if (outputSampleRate === inputSampleRate) {
    return buffer
  }

  var sampleRateRatio = inputSampleRate / outputSampleRate
  var newLength = Math.round(buffer.length / sampleRateRatio)
  var result = new Float32Array(newLength)
  var offsetResult = 0
  var offsetBuffer = 0

  while (offsetResult < result.length) {
    var nextOffsetBuffer = Math.round((offsetResult + 1) * sampleRateRatio)

    var accum = 0,
      count = 0

    for (var i = offsetBuffer; i < nextOffsetBuffer && i < buffer.length; i++) {
      accum += buffer[i]
      count++
    }

    result[offsetResult] = accum / count
    offsetResult++
    offsetBuffer = nextOffsetBuffer
  }

  return result
}

function convertAudioToBinaryMessage(audioChunk) {
  let raw = MicrophoneStream.toRaw(audioChunk)

  if (raw == null) return

  // downsample and convert the raw audio bytes to PCM
  let downsampledBuffer = downsampleBuffer(raw, inputSampleRate, sampleRate)

  return downsampledBuffer
}
