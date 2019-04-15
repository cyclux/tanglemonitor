module.exports = {
  domain: 'localhost',
  apiMaxTransactions: 50000,
  apiToken: '',

  logging: {
    showZmqNodeStatus: false
  },

  webServer: {
    standalone: true,
    port: 3000
  },

  DB: {
    driver: 'standalone',
    persistent: true,
    MongoDB: {
      host: 'localhost',
      port: 27017,
      name: 'tanglemonitor',
      credentials: {
        user: '',
        password: ''
      }
    }
  },

  environments: [
    {
      netName: 'mainnet',
      subdomain: '',
      apiServer_ssl: 4433,
      apiServer: 8080,
      socketioServer_ssl: 4434,
      socketioServer: 8081,
      newTransactions_ssl: 4435,
      newTransactions: 8082,
      maxAmountZmqConnections: 3,
      nodeSyncDeltaThreshold: 10,
      zmqNodes: [
        { host: 'node06.iotatoken.nl', port: 5556, api: 14265, ssl: false },
        { host: 'node.deviceproof.org', port: 80, api: 14265, ssl: false },
        { host: 'trinity.iota-tangle.io', port: 5556, api: 14265, ssl: true }
      ]
    },

    {
      netName: 'devnet',
      subdomain: 'testnet',
      apiServer_ssl: 4437,
      apiServer: 8081,
      socketioServer_ssl: 4438,
      socketioServer: 8082,
      newTransactions_ssl: 4436,
      newTransactions: 8083,
      maxAmountZmqConnections: 3,
      nodeSyncDeltaThreshold: 10,
      zmqNodes: [{ host: 'nodes.devnet.iota.org', port: 5556, api: 443, ssl: true }]
    },

    {
      netName: 'spamnet',
      subdomain: 'spamnet',
      apiServer_ssl: 4439,
      apiServer: 8080,
      socketioServer_ssl: 4440,
      socketioServer: 8081,
      newTransactions_ssl: 4441,
      newTransactions: 8083,
      maxAmountZmqConnections: 3,
      nodeSyncDeltaThreshold: 10,
      zmqNodes: [{ host: 'nodes.spamnet.iota.org', port: 5556, api: 80, ssl: false }]
    }
  ]
};
