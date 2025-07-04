import {
  DynamoDBClient,
  PutItemCommand,
  DeleteItemCommand,
  QueryCommand
} from '@aws-sdk/client-dynamodb'
import type { APIGatewayProxyEventV2WithJWTAuthorizer } from 'aws-lambda'

const ddb = new DynamoDBClient({})
const Table = process.env.TABLE!

export const handler = async (evt: APIGatewayProxyEventV2WithJWTAuthorizer) => {
  const sub = (evt.requestContext.authorizer!.jwt as any).claims.sub as string
  const body = evt.body ? JSON.parse(evt.body) : {}
  const { word, notes = '' } = body

  switch (evt.requestContext.http.method) {
    case 'POST': // Create
      await ddb.send(
        new PutItemCommand({
          TableName: Table,
          Item: { userSub: { S: sub }, word: { S: word }, notes: { S: notes } }
        })
      )
      return { statusCode: 204 }

    case 'PUT': // Update (upsert)
      await ddb.send(
        new PutItemCommand({
          TableName: Table,
          Item: { userSub: { S: sub }, word: { S: word }, notes: { S: notes } }
        })
      )
      return { statusCode: 204 }

    case 'DELETE': // Delete
      await ddb.send(
        new DeleteItemCommand({
          TableName: Table,
          Key: { userSub: { S: sub }, word: { S: word } }
        })
      )
      return { statusCode: 204 }

    default: // GET = list
      const out = await ddb.send(
        new QueryCommand({
          TableName: Table,
          KeyConditionExpression: 'userSub = :u',
          ExpressionAttributeValues: { ':u': { S: sub } }
        })
      )
      return {
        statusCode: 200,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(
          (out.Items ?? []).map((i) => ({
            word: i.word.S,
            notes: i.notes?.S ?? ''
          }))
        )
      }
  }
}
