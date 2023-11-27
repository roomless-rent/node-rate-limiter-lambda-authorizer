
module.exports.handler = function(event, context, callback) {

    const headers = event.headers;
    const httpMethod = event.httpMethod;
    const userAgent = headers["User-Agent"];
    const host = headers["Host"];
    const path = event.path;
    
    console.log(`host ${host}, path: ${path}, user-agent: ${userAgent}`)
    console.log(event)

    if (headers['policy'] == 'deny') {
        callback(null, generatePolicy('Deny', event.methodArn));
    } else {
        callback(null, generatePolicy('Allow', event.methodArn));
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