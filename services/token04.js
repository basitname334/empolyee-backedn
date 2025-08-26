const crypto = require("crypto");

function generateToken04(appId, userId, secret, effectiveTimeInSeconds, roomId) {
  const expiredTime = Math.floor(Date.now() / 1000) + effectiveTimeInSeconds;
  const nonce = Math.floor(Math.random() * 2147483647);

  // Create the payload
  const payload = {
    app_id: appId,
    user_id: userId,
    nonce,
    ctime: Math.floor(Date.now() / 1000),
    expire: expiredTime,
    payload: roomId ? `{"room_id":"${roomId}"}` : "", // Include roomId in payload
  };

  // Convert payload to JSON string
  const payloadString = JSON.stringify(payload);
  
  // Generate HMAC-SHA256 hash
  const hash = crypto.createHmac("sha256", secret).update(payloadString).digest("hex");
  
  // Create Base64-encoded payload
  const base64Payload = Buffer.from(payloadString).toString("base64");
  
  // Return token in the format: 04<base64_payload>.<hmac_sha256>
  return `04${base64Payload}.${hash}`;
}

module.exports = { generateToken04 };