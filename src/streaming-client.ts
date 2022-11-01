import { AudioUtils } from './audio-utils'
import { EncodingUtils } from './encoding-utils'
import { wsServer } from './server'
import { EventStreamCodec, Message } from '@aws-sdk/eventstream-codec'
import * as utilUtf8Node from '@aws-sdk/util-utf8-node'
import * as WebSocket from 'websocket'

export class StreamingClient {
  webSocket: WebSocket.w3cwebsocket
  audioUtils: AudioUtils
  marshall: EventStreamCodec

  constructor() {
    this.audioUtils = new AudioUtils()
    const url = this.audioUtils.generateTranscribePresignedUrl()
    console.log(url)
    this.webSocket = new WebSocket.w3cwebsocket(url)
    this.marshall = new EventStreamCodec(utilUtf8Node.toUtf8, utilUtf8Node.fromUtf8)
  }

  runSocket = () => {
    this.webSocket.onopen = () => {
      console.log('connecting to AWS!')
    }

    this.webSocket.onerror = (errorEvent) => {
      console.error(errorEvent)
    }

    this.webSocket.onclose = (closeEvent) => {
      console.log('closeddd :' + closeEvent.code + ' , ' + closeEvent.reason)
    }

    this.webSocket.onmessage = (message) => {
      //convert the binary event stream message to JSON
      const arr = new Uint8Array(message.data as Buffer)
      const str = String.fromCharCode(...arr)
      console.log('received !!! ' + str)
    }

    wsServer.on('connection', (connection) => {
      connection.on('message', (event) => {
        const binaryMessage = this.convertAudioToBinaryMessage(event)
        if (this.webSocket.readyState === this.webSocket.OPEN) {
          console.log('sending data to AWS!!!')
          this.webSocket.send(binaryMessage)
        }
      })

      this.webSocket.onmessage = (message) => {
        //convert the binary event stream message to JSON
        console.log('received message!!!' + message)
        const messageWrapper = this.marshall.decode(new TextEncoder().encode('message.data'))
        const messageBody = JSON.parse(String.fromCharCode(...messageWrapper.body))
        if (messageWrapper.headers[':message-type'].value === 'event') {
          console.log('Sending data!!!')
          connection.send(this.handleEventStreamMessage(messageBody))
        }
      }

      this.webSocket.onerror = (errorEvent) => {
        console.error(errorEvent)
        connection.send(errorEvent)
      }

      this.webSocket.onclose = (closeEvent) => {
        console.log('closeddd')
        connection.send(closeEvent)
      }

      connection.on('error', (errorEvent) => {
        console.error('error')
        connection.send(errorEvent)
      })

      connection.on('close', (closeEvent) => {
        console.log(closeEvent)
        connection.send(closeEvent)
      })
    })
  }

  handleEventStreamMessage = (messageJson) => {
    const results = messageJson.Transcript.Results
    if (results.length > 0 && results[0].Alternatives.length > 0) {
      return results[0].Alternatives[0].Transcript
    }
    return undefined
  }

  // the audio stream is raw audio bytes. Transcribe expects PCM with additional metadata, encoded as binary
  private convertAudioToBinaryMessage = (data: unknown) => {
    if (!data) return

    const pcmEncodedBuffer = EncodingUtils.pcmEncode(data)
    const audioEventMessage = this.getAudioEventMessage(Buffer.from(pcmEncodedBuffer))

    return this.marshall.encode(audioEventMessage)
  }

  // add the right JSON headers and structure to the message
  private getAudioEventMessage = (buffer: Buffer): Message => {
    return {
      headers: {
        ':message-type': {
          type: 'string',
          value: 'event',
        },
        ':event-type': {
          type: 'string',
          value: 'AudioEvent',
        },
      },
      body: buffer,
    }
  }
}
