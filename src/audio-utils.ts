import { Constants } from './constants'
import * as QueryString from 'querystring'
import * as CryptoEncHex from 'crypto-js/enc-hex'
import * as Sha256 from 'crypto-js/sha256'
import * as HmacSHA256 from 'crypto-js/hmac-sha256'

export class AudioUtils {
  generateTranscribePresignedUrl = () => {
    const headers = new Map<string, string>()
    headers.set('Host', Constants.ENDPOINT)
    const payload = this.toHash('').toString(CryptoEncHex)
    const timestamp = Date.now()

    const query = this.createQuery(timestamp, headers)
    const canonicalRequest = this.createCanonicalRequest(query, payload, headers)
    const stringToSign = this.createStringToSign(timestamp, canonicalRequest)
    const signature = this.createSignature(timestamp, stringToSign)

    query.set('X-Amz-Signature', signature.toString(CryptoEncHex))
    const queryString = QueryString.stringify(this.toDict(query))

    return Constants.PROTOCOL.concat('://')
      .concat(Constants.ENDPOINT)
      .concat(Constants.PATH)
      .concat('?')
      .concat(queryString)
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
    Array.from(headers.keys())
      .sort()
      .map((name) => name.toLowerCase().trim().concat(':').concat(headers.get(name).trim()).concat('\n'))
      .join('')

  private createCanonicalQueryString = (query: Map<string, string>) =>
    Array.from(query.keys())
      .sort()
      .map((key) =>
        encodeURIComponent(key)
          .concat('=')
          .concat(encodeURIComponent(query.get(key))),
      )
      .join('&')

  private createSignedHeaders = (headers: Map<string, string>) =>
    Array.from(headers.keys())
      .map((name) => name.toLowerCase().trim())
      .join(';')

  private createStringToSign = (timestamp: number, canonicalRequest: string) =>
    [
      Constants.X_AMZ_ALGORITHM,
      this.toTime(timestamp),
      this.createCredentialScope(timestamp, Constants.REGION, Constants.SERVICE),
      this.toHash(canonicalRequest).toString(CryptoEncHex),
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

  private toHash = (text: string) => Sha256(text)

  private toHmac = (key: string | CryptoJS.lib.WordArray, text: string) => HmacSHA256(text, key)

  private createQuery = (timestamp: number, headers: Map<string, string>) => {
    const query = new Map<string, string>()
    query.set('language-code', Constants.LANGUAGE_CODE)
    query.set('media-encoding', Constants.MEDIA_ENCODING)
    query.set('sample-rate', Constants.INPUT_SAMPLE_RATE.toString())
    query.set('X-Amz-Algorithm', Constants.X_AMZ_ALGORITHM)
    query.set(
      'X-Amz-Credential',
      Constants.AWS_ACCESS_KEY_ID.toString()
        .concat('/')
        .concat(this.createCredentialScope(timestamp, Constants.REGION, Constants.SERVICE)),
    )
    query.set('X-Amz-Date', this.toTime(timestamp))
    query.set('X-Amz-Expires', Constants.EXPIRATION_DELAY.toString())
    query.set('X-Amz-SignedHeaders', this.createSignedHeaders(headers))

    return new Map([...query.entries()].sort())
  }

  private toDict = (query: Map<string, string>) => Object.fromEntries(query)
}
