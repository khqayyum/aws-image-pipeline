import {
  DynamoDBClient,
  ScanCommand,
  GetItemCommand,
} from "@aws-sdk/client-dynamodb";
import { unmarshall } from "@aws-sdk/util-dynamodb";

const ddb = new DynamoDBClient({});
const TABLE = process.env.TABLE_NAME ?? "ImageMetadata";

const json = (code, body) => ({
  statusCode: code,
  headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  body: JSON.stringify(body),
});

export const handler = async (event) => {
  try {
    const route = (event.rawPath || event.path || "").toLowerCase();
    const method = (
      event.requestContext?.http?.method || event.httpMethod || "GET"
    ).toUpperCase();

    if (method !== "GET") return json(405, { message: "Method Not Allowed" });

    // Accepting id from PATH or from QUERY (?id=)
    const idRaw = event.pathParameters?.id ?? event.queryStringParameters?.id ?? null;
    const id = idRaw ? decodeURIComponent(idRaw) : null;

    // LIST: GET /images  (only when no id is provided)
    if (route.endsWith("/images") && !id) {
      const scan = await ddb.send(
        new ScanCommand({
          TableName: TABLE,
          Limit: 100,
          ProjectionExpression: "imageId, filename, uploadedAt, variants, original",
        })
      );
      const items = (scan.Items || []).map(unmarshall);
      return json(200, { items, next: scan.LastEvaluatedKey || null });
    }

    if (route.includes("/images/") || (route.endsWith("/images") && id)) {
      // First try exact GetItem (fast)
      if (id) {
        const getResp = await ddb.send(
          new GetItemCommand({ TableName: TABLE, Key: { imageId: { S: id } } })
        );
        if (getResp.Item) return json(200, unmarshall(getResp.Item));
      }

      //Trying a scan match on imageId OR filename (handles weird spaces)
      if (id) {
        const scanResp = await ddb.send(
          new ScanCommand({
            TableName: TABLE,
            FilterExpression: "#iid = :v OR filename = :v",
            ExpressionAttributeNames: { "#iid": "imageId" },
            ExpressionAttributeValues: { ":v": { S: id } },
            Limit: 1,
          })
        );
        const hit = (scanResp.Items || []).map(unmarshall)[0];
        if (hit) return json(200, hit);
      }

      return json(404, { message: "Not found", tried: id });
    }

    return json(404, { message: "Route not found" });
  } catch (err) {
    console.error("API error:", err);
    return json(500, { message: "Internal Error", error: String(err?.message || err) });
  }
};
