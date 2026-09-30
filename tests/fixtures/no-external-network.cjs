// Fail startup tests if any launcher code attempts a remote connection.
for (const protocol of ['node:http', 'node:https']) {
  const transport = require(protocol)
  for (const method of ['get', 'request']) {
    const original = transport[method]
    transport[method] = function (target, ...rest) {
      const host = typeof target === 'string' || target instanceof URL
        ? new URL(target).hostname : target.hostname || target.host
      if (host !== '127.0.0.1' && host !== 'localhost' && host !== '::1') {
        throw new Error('EXTERNAL_NETWORK_BLOCKED: ' + host)
      }
      return original.call(this, target, ...rest)
    }
  }
}
