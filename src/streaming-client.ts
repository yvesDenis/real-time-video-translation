import { AudioUtils } from './audio-utils'
import { EncodingUtils } from './encoding-utils'
import { wsServer } from './server'
import { EventStreamCodec, Message } from '@aws-sdk/eventstream-codec'
import * as utilUtf8Node from '@aws-sdk/util-utf8-node'

export class StreamingClient {
  webSocket: WebSocket
  audioUtils: AudioUtils
  marshall: EventStreamCodec

  constructor() {
    this.audioUtils = new AudioUtils()
    this.webSocket = new WebSocket(this.audioUtils.generateTranscribePresignedUrl())
    this.marshall = new EventStreamCodec(utilUtf8Node.toUtf8, utilUtf8Node.fromUtf8)
  }

  runSocket = () => {
    wsServer.on('connection', (connection) => {
      connection.on('message', (event) => {
        this.webSocket.onopen = () => {
          const binaryMessage = this.convertAudioToBinaryMessage(event)
          if (this.webSocket.readyState === this.webSocket.OPEN) this.webSocket.send(binaryMessage)
        }
        console.log('received: %s', event)
      })
      connection.send('something')
    })
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
