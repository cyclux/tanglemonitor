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
      apiServer: { port: 4433, ssl: false },
      socketioServer: { port: 4434, ssl: false },
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
      apiServer: { port: 4437, ssl: false },
      socketioServer: { port: 4438, ssl: false },
      maxAmountZmqConnections: 3,
      nodeSyncDeltaThreshold: 10,
      zmqNodes: [{ host: 'nodes.devnet.iota.org', port: 5556, api: 443, ssl: true }]
    },

    {
      netName: 'spamnet',
      subdomain: 'spamnet',
      apiServer: { port: 4439, ssl: false },
      socketioServer: { port: 4440, ssl: false },
      maxAmountZmqConnections: 3,
      nodeSyncDeltaThreshold: 10,
      zmqNodes: [{ host: 'nodes.spamnet.iota.org', port: 5556, api: 80, ssl: false }]
    }
  ]
};
