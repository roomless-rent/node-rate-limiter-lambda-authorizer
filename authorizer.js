const { DynamoDB } = require("@aws-sdk/client-dynamodb");
const { RateLimiterDynamo } = require("rate-limiter-flexible");

module.exports.handler = async function(event, context, callback) {

    const dynamoClient = new DynamoDB();
    const rateLimiter = new RateLimiterDynamo({
        storeClient: dynamoClient,
        points: 10,
        duration: 60,
        tableName: 'api-rate-limiter-prod',
        tableCreated: true
    });

    const request = {
        headers: event.headers,
        context: event.requestContext,
        path: event.requestContext.path,
        sourceIp: event.requestContext.identity.sourceIp,
        userAgent: event.requestContext.identity.userAgent
    }

    if (!request.sourceIp) {
        callback(null, generatePolicy('Deny', event.methodArn, {}));
    }

    try {
        const res = await rateLimiter.consume(request.sourceIp);
        console.log(res);
        callback(null, generatePolicy('Allow', event.methodArn, res));
    } catch(e) {
        console.log(e);
        callback(null, generatePolicy('Deny', event.methodArn, e));
    }
}

/**
 * Generates a policy with the specified effect.
 *
 * @param {string} effect - The effect of the policy (Allow or Deny)
 * @return {Object} The generated policy object.
 */
function generatePolicy(effect, resource) {

    return {
        principalId: "user",
        policyDocument: {
            Version: "2012-10-17",
            Statement: [
                {
                    Action: "execute-api:Invoke",
                    Effect: effect,
                    Resource: resource
                }
            ]
        }
    }
}