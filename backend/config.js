module.exports = {
  /* Specify which web server should be utilzed to serve the front-end */
  webServer: {
    /* If this instance should be hosted public, adapt 'domain' to your URL (e.g. tanglemonitor.com)
    Default: 'localhost' */
    domain: 'localhost',

    /* If you do not have any webserver installed or configured on your machine you can utilize the standalone feature.
    However, if you prefer running something dedicated, like Apache or nginx, set standalone to 'false'
    Default: true */
    standalone: true,

    /* If standalone is set true, specify a 'port' where the front-end will be reachable at (e.g. http://localhost:3000)
    Default: 3000 */
    port: 3000
  },

  /* The maximum recent transactions which can be fetched by the API endpoint 'getRecentTransactions'
  This limit is useful if you are hosting the service to the public, as frequent requests of huge TX amounts can result in bad response performance.
  Default: 50000 */
  apiMaxTransactions: 50000,

  /* Shows additional logging output. For now only 'showZmqNodeStatus' available */
  logging: {
    /* Show constant info about ZMQ connection status to each node
    Default: false */
    showZmqNodeStatus: false
  },

  /* Database configuration */
  DB: {
    /* The standalone driver utilizes an in-memory DB (LokiJS). This DB is very fast but not suitable to store larger amounts of TX history.
    If you want to keep more than a few hours of TX history please consider to utilize a MongoDB instance.
    Default: 'standalone', Alternative option: 'MongoDB' */
    driver: 'standalone',

    /* Amount of minutes of Tangle tx history, which will be stored. If set to 0 all history of the transactions will be lost on restart.
    Non-persistence usually only makes sense in combination with 'standalone' DB driver.
    Default: 120 */
    storageDuration: 0, // minutes

    /* Configuration only relevant if driver is set to 'MongoDB' */
    MongoDB: {
      /* The DB host can also be on a remote location
      Default: 'localhost' */
      host: 'localhost',

      /* Default port: 27017 */
      port: 27017,

      /* Name of the DB */
      name: 'tanglemonitor',
      /* Set the credentiols to access the MongoDB instance */
      credentials: {
        user: '',
        password: ''
      }
    }
  },
  /* Configuration of Tangle environments / nets
  You can add as many nets as you like in this list, however only one of those nets will be initialized, depending on which one you set:
  'mainnet' is the default net when you start tanglemonitor via 'node tanglemonitor.js' or pm2
  Other nets can be deployed via the --net flag, for example: 'node tanglemonitor.js --net devnet'
  pm2 handles command line flags a bit different: 'pm2 start tanglemonitor.js -- --net devnet' Be aware to include the double dash '--' */
  environments: [
    {
      /* Name of the net (which needs to be declared via command line flag if it is not 'mainnet', see above) */
      netName: 'mainnet',

      /* If you are running this instance on a subdomain you need to declare it here (e.g: spamnet.tanglemonitor.com) */
      subdomain: '',

      /* Ports on which the API and WebSocket will be reachable - Important that those ports are matched in the front-end if you edit them
      If you run this instance public and use ssl you need to enable ssl with setting 'true' on each
      Certificates need to be placed in folder backend/ssl - see documentation on github for details
      Default: port: 4433, ssl: false */
      apiServer: { port: 4433, ssl: false },
      /* Websocket, Default: port: 4434, ssl: false  */
      socketioServer: { port: 4434, ssl: false },

      /* Defines the maximum amount of connections to ZMQ nodes (which are defined at 'zmqNodes' below)
      Please define at least two different sources of nodes to get the best results
      Default: 3  */
      maxAmountZmqConnections: 3,

      /* Each node is regularly sync checked (Delta between LSSMI & LSMI) if 'syncCheck' is set 'true' on 'zmqNodes'.
      The threshold specifies at which delta a node should be considered 'unsynced' and thus be disconnected
      Default: 10 */
      nodeSyncDeltaThreshold: 10,

      /* Pool of nodes which will potentially be connected to. First nodes in the list are prioritized.
      If a node gets out of sync or the connection is lost, another node will be tried.
      Maximum simultaneous connections to ZMQ nodes is set with the option 'maxAmountZmqConnections'
      port = ZMQ port, the ssl option refers to the API port, for info on syncCheck see comment of 'nodeSyncDeltaThreshold' */
      zmqNodes: [
        { host: 'localhost', port: 5556, api: 14265, ssl: false, syncCheck: true  },
        { host: 'tanglebeat.com', port: 5556, api: 14265, ssl: false, syncCheck: false },
        { host: 'node06.iotatoken.nl', port: 5556, api: 14265, ssl: false, syncCheck: true },
        { host: 'trinity.iota-tangle.io', port: 5556, api: 14265, ssl: true, syncCheck: true }
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
