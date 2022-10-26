import { Constants } from './constants'
import * as Crypto from 'crypto'
import * as QueryString from 'querystring'

export class AudioUtils {
  generateTranscribePresignedUrl = () => {
    const headers = new Map<string, string>()
    headers.set('Host', Constants.ENDPOINT)
    const payload = this.toHash('')
    const timestamp = Date.now()
    const query = this.createQuery(timestamp, headers)

    const canonicalRequest = this.createCanonicalRequest(query, payload, headers)
    const stringToSign = this.createStringToSign(timestamp, canonicalRequest)
    const signature = this.createSignature(timestamp, stringToSign)

    query['X-Amz-Signature'] = signature

    return Constants.PROTOCOL.concat('://')
      .concat(Constants.ENDPOINT)
      .concat(Constants.PATH)
      .concat('?')
      .concat(QueryString.stringify(this.toDict(query)))
  }

  private createCredentialScope = (time: number, region: string, service: string) =>
    [this.toDate(time), region, service, Constants.AWS4_REQUEST].join('/')

  private createCanonicalRequest = (query: Map<string, string>, payload: string, headers: Map<string, string>) =>
    [
      Constants.GET_METHOD,
      Constants.PATH,
      this.createCanonicalQueryString(query),
      this.createCanonicalHeaders(headers),
      this.createSignedHeaders(headers),
      payload,
    ].join('\n')

  private createCanonicalHeaders = (headers: Map<string, string>) =>
    Object.keys(headers)
      .sort()
      .map((name) => name.toLowerCase().trim().concat(':').concat(headers[name].toString().trim()).concat('\n'))
      .join('')

  private createCanonicalQueryString = (query: Map<string, string>) =>
    Object.keys(query)
      .sort()
      .map((key) => encodeURIComponent(key).concat('=').concat(encodeURIComponent(query[key])))
      .join('&')

  private createSignedHeaders = (headers: Map<string, string>) =>
    Object.keys(headers)
      .sort()
      .map((name) => name.toLowerCase().trim())
      .join(';')

  private createStringToSign = (timestamp: number, canonicalRequest: string) =>
    [
      Constants.X_AMZ_ALGORITHM,
      this.toTime(timestamp),
      this.createCredentialScope(timestamp, Constants.REGION, Constants.SERVICE),
      this.toHash(canonicalRequest),
    ].join('\n')

  private createSignature = (timestamp: number, stringToSign: string) => {
    const kDate = this.toHmac(Constants.AWS4.concat(Constants.AWS_SECRET_ACCESS_KEY), this.toDate(timestamp)) // date-key
    const kRegion = this.toHmac(kDate, Constants.REGION) // region-key
    const kService = this.toHmac(kRegion, Constants.SERVICE) // service-key
    const kSigning = this.toHmac(kService, Constants.AWS4_REQUEST) // signing-key
    return this.toHmac(kSigning, stringToSign)
  }

  private toDate = (timestamp: number) => this.toTime(timestamp).substring(0, 8)

  private toTime = (timestamp: number) => new Date(timestamp).toISOString().replace(/[:-]|\.\d{3}/g, '')

  private toHash = (text: string) => Crypto.createHash(Constants.SHA256).update(text, 'utf8').digest('hex')

  private toHmac = (key: Crypto.BinaryLike, text: string) =>
    Crypto.createHmac(Constants.SHA256, key).update(text, 'utf8').digest('hex')

  private createQuery = (timestamp: number, headers: Map<string, string>) => {
    const query = new Map<string, string>()
    query['language-code'] = Constants.LANGUAGE_CODE
    query['media-encoding'] = Constants.MEDIA_ENCODING
    query['sample-rate'] = Constants.INPUT_SAMPLE_RATE
    query['X-Amz-Algorithm'] = Constants.X_AMZ_ALGORITHM
    query['X-Amz-Credential'] = Constants.AWS_ACCESS_KEY_ID.concat('/').concat(
      this.createCredentialScope(timestamp, Constants.REGION, Constants.SERVICE),
    )
    query['X-Amz-Date'] = this.toTime(timestamp)
    query['X-Amz-Expires'] = Constants.EXPIRATION_DELAY
    query['X-Amz-SignedHeaders'] = this.createSignedHeaders(headers)
    return query
  }

  private toDict = (query: Map<string, string>) => Object.fromEntries(query)
}
