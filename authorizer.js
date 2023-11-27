
module.exports.handler = function(event, context, callback) {

    const headers = event.headers;
    const httpMethod = event.httpMethod;
    const userAgent = headers["User-Agent"];
    const host = headers["Host"];
    const path = event.path;
    
    console.log(`host ${host}, path: ${path}, user-agent: ${userAgent}`)

    callback(null, { statusCode: 200, body: "OK" });
}