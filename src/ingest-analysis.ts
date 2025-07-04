import { DynamoDBClient, BatchWriteItemCommand } from '@aws-sdk/client-dynamodb'
const ddb = new DynamoDBClient({})
const Table = process.env.TABLE!

export const handler = async (event: any) => {
  console.log('event', event)
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

  return { saved, failed }
}
