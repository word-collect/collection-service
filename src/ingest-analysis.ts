import { DynamoDBClient, PutItemCommand } from '@aws-sdk/client-dynamodb'
const ddb = new DynamoDBClient({})
const Table = process.env.TABLE!

export const handler = async (event: any) => {
  console.log('event', event)
  const { userSub, result } = event.detail
  const words = result.split(',')

  await Promise.all(
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
}
