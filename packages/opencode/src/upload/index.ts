import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3"
import { extension } from "mime-types"
import { Flag } from "../flag/flag"
import { Log } from "../util/log"
import { randomBytes } from "crypto"

const log = Log.create({ service: "upload" })

export namespace Upload {
  export function init() {
    if (enabled()) {
      const msg = `S3 upload enabled (endpoint=${Flag.OPENCODE_S3_ENDPOINT} bucket=${Flag.OPENCODE_S3_BUCKET} region=${Flag.OPENCODE_S3_REGION ?? "us-east-1"})`
      console.log(msg)
      log.info(msg)
    } else {
      const missing = [
        !Flag.OPENCODE_S3_ENDPOINT && "OPENCODE_S3_ENDPOINT",
        !Flag.OPENCODE_S3_BUCKET && "OPENCODE_S3_BUCKET",
        !Flag.OPENCODE_S3_ACCESS_KEY_ID && "OPENCODE_S3_ACCESS_KEY_ID",
        !Flag.OPENCODE_S3_SECRET_ACCESS_KEY && "OPENCODE_S3_SECRET_ACCESS_KEY",
      ].filter(Boolean)
      console.log(`S3 upload disabled (missing: ${missing.join(", ")})`)
      log.info("s3 upload disabled", { missing })
    }
  }

  let client: S3Client | undefined

  function s3() {
    if (client) return client
    client = new S3Client({
      endpoint: Flag.OPENCODE_S3_ENDPOINT,
      region: Flag.OPENCODE_S3_REGION ?? "us-east-1",
      credentials: {
        accessKeyId: Flag.OPENCODE_S3_ACCESS_KEY_ID!,
        secretAccessKey: Flag.OPENCODE_S3_SECRET_ACCESS_KEY!,
      },
      forcePathStyle: true,
    })
    return client
  }

  export function enabled() {
    return !!(
      Flag.OPENCODE_S3_ENDPOINT &&
      Flag.OPENCODE_S3_BUCKET &&
      Flag.OPENCODE_S3_ACCESS_KEY_ID &&
      Flag.OPENCODE_S3_SECRET_ACCESS_KEY
    )
  }

  export async function upload(buf: Buffer, mime: string, filename?: string): Promise<string | undefined> {
    const bucket = Flag.OPENCODE_S3_BUCKET!
    const endpoint = Flag.OPENCODE_S3_ENDPOINT!
    const ext = extension(mime) || "bin"
    const id = randomBytes(16).toString("hex")
    const key = `images/${id}.${ext}`

    log.info("uploading", { bucket, key, mime, size: buf.byteLength })

    try {
      await s3().send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: key,
          Body: buf,
          ContentType: mime,
        }),
      )
    } catch (err) {
      log.error("s3 upload failed, falling back to inline data url", { err })
      return undefined
    }

    // Build public URL using path-style: <endpoint>/<bucket>/<key>
    const base = endpoint.replace(/\/$/, "")
    const url = `${base}/${bucket}/${key}`
    log.info("uploaded", { url })
    return url
  }
}
