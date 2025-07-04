import { DynamoDBClient, BatchWriteItemCommand } from '@aws-sdk/client-dynamodb'
import {
  EventBridgeClient,
  PutEventsCommand
} from '@aws-sdk/client-eventbridge'

const Table = process.env.TABLE!
const busName = process.env.BUS_NAME!

const ddb = new DynamoDBClient({})
const eb = new EventBridgeClient({})

export const handler = async (event: any) => {
  const { userSub, result } = event.detail
  const words = result.split(',')

  console.log(`📝 writing ${words.length} words for ${userSub}`)

  const chunks: string[][] = []
  for (let i = 0; i < words.length; i += 25) chunks.push(words.slice(i, i + 25))

  let saved = 0
  let failed: string[] = []

  for (const chunk of chunks) {
    const resp = await ddb.send(
      new BatchWriteItemCommand({
        RequestItems: {
          [Table]: chunk.map((word) => ({
            PutRequest: {
              Item: {
                userSub: { S: userSub },
                word: { S: word },
                notes: { S: '' }
              }
            }
          }))
        }
      })
    )

    const unprocessed = resp.UnprocessedItems?.[Table] ?? []
    saved += chunk.length - unprocessed.length
    failed.push(...unprocessed.map((x) => x.PutRequest!.Item!.word.S!))
  }

  console.log(`✅ ${saved} succeeded, ❌ ${failed.length} failed`)
  if (failed.length) console.error('Failed words:', failed)

  await eb.send(
    new PutEventsCommand({
      Entries: [
        {
          EventBusName: busName,
          Source: 'collection-service',
          DetailType: 'CollectionUpdated',
          Detail: JSON.stringify({ userSub, saved, failed })
        }
      ]
    })
  )

  return { saved, failed }
}
