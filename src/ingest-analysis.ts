import { DynamoDBClient, PutItemCommand } from '@aws-sdk/client-dynamodb'
const ddb = new DynamoDBClient({})
const Table = process.env.TABLE!

export const handler = async (event: any) => {
  console.log('event', event)
  const { userSub, result } = event.detail
  const words = result.split(',')

  console.log(`📝 writing ${words.length} words for ${userSub}`)

  /* run the PutItem commands in parallel and capture every outcome */
  const outcomes = await Promise.allSettled(
    words.map((word: string) =>
      ddb.send(
        new PutItemCommand({
          TableName: Table,
          Item: {
            userSub: { S: userSub },
            word: { S: word },
            notes: { S: '' }
          }
        })
      )
    )
  )

  /* summarise */
  const failed = outcomes
    .map((o, i) =>
      o.status === 'rejected' ? { word: words[i], err: o.reason } : null
    )
    .filter(Boolean) as { word: string; err: unknown }[]

  const succeeded = words.length - failed.length
  console.log(`✅ ${succeeded} succeeded, ❌ ${failed.length} failed`)

  if (failed.length) {
    console.error(
      'Failed items:',
      failed.map((f) => ({ word: f.word, error: (f.err as any).message }))
    )
  }

  /* return something useful for DLQ / Step-Functions */
  return {
    saved: succeeded,
    failed: failed.map((f) => f.word)
  }
}
