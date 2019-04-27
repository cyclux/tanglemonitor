# Tanglemonitor

_Visualization and detailed live metrics of the IOTA confirmation process._

> Tanglemonitor is part of the EDF funded **UNIO project**. Hence, you are now able to run your own instances. The goal of UNIO is, to combine three well established Tangle analytics tools (tangle.glumb, tanglebeat & tanglemonitor) into one collaborating project. For more details on this, please see the **annoucement** and our **proposal document**. Fully open sourcing Tanglemonitor and providing following instructions is just one of the first steps of our combined efforts project. Later on, we will provide a single repository with detailed instructions and a simple deployment process. For now however, if you like to deploy Tanglemonitor check out following preliminary instructions.

## Installation

**Instructions for Linux (Ubuntu)**
First get sure you have the required programs installed:

```
sudo apt-get install git nodejs
```

Within your desired folder clone this git repository:

```
git clone https://github.com/unioproject/tanglemonitor.git
```

Then go into the backend folder and install the NodeJS backend:

```
cd tanglemonitor/backend
npm install
```

That's it, now you can start Tanglemonitor:

```
nodejs tanglemonitor-server.js --net mainnet
```

or simply ..

```
nodejs tanglemonitor-server.js
```

.. because mainnet is the default net.

> **Note:** Please see the [configuration section](#Configuration) for more details on how to run Tanglemonitor!

## pm2 - process manager

If you intend to run Tanglemonitor as a service or several nets simultaneously, it is recommended to run it via a process manager, like pm2:

```
sudo apt-get install pm2
```

Go into the backend folder and run:

```
pm2 start tanglemonitor-server.js
```

Setting flags in pm2 is a bit different to normal NodeJS (note the double dash):

```
pm2 start tanglemonitor-server.js -- --net mainnet
```

You can stop it again with:

```
pm2 stop tanglemonitor-server
```

> **Note:** For more information on [pm2](https://pm2.io/) visit their [documentation](https://pm2.io/doc/en/runtime/overview/?utm_source=pm2&utm_medium=website&utm_campaign=rebranding).

## Configuration

Tanglemonitor is configured by the `config.js` file within the `backend` folder:

| Option                                 | Description                                                                                                                                      | Default      |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | ------------ |
| `webServer.domain`                     | Where should this instance be hosted? If public, adapt to your URL (e.g. tanglemonitor.com)                                                      | `localhost`  |
| `webServer.standalone`                 | If you do not have any webserver installed or configured on your machine you can utilize the standalone feature.
                                          However, if you prefer running something dedicated, like Apache or nginx, set standalone to 'false'                                               | `true`       |
| `webServer.port`                       | If standalone webserver is set true, specify a 'port' where the front-end will be reachable at (e.g. http://localhost:3000)                      | `3000`       |
| `apiMaxTransactions`                   | This limits the maximum amount of TX history which can be requested by the user (front-end).
                                          It is particularly useful, if you are hosting the service to the public,
                                          as frequent requests of huge TX amounts can result in bad response performance.                                                                   | `50000`      |
| `logging.showZmqNodeStatus`            | Show constant info about ZMQ connection status to each node                                                                                      | `false`      |
| `DB.driver`                            | The standalone driver utilizes an in-memory DB (LokiJS). This DB is very fast but not suitable to store larger amounts of TX history.
                                          If you want to keep more than a few hours of TX history please consider to utilize a MongoDB instance.
                                          Alternative option: 'MongoDB'                                                                                                                     | `standalone` |
| `DB.persistent`                        | Should the TX history be persistent? Normally you want this to be 'true'
                                          If set 'false', all history of the transactions will be lost on restart.
                                          Non-persistence usually only makes sense in combination with 'standalone' DB driver.                                                              | `true`       |
| `DB.MongoDB.host`                      | The MongoDB host can also be on a remote location.                                                                                               | `localhost`  |
| `DB.MongoDB.port`                      | Specify the port of the MongoDB instance.                                                                                                        | `27017`      |
| `DB.MongoDB.name`                      | Specify the name of the MongoDB instance.                                                                                                        | `tanglemonitor` |
| `DB.MongoDB.credentials`               | Specify the credentials (user, password) of the MongoDB instance.                                                                                | `none`       |
| `environments`                         | You can add as many nets as you like in this list, however only one of those nets will be initialized.
                                          'mainnet' is the default net when you start via 'node tanglemonitor.js' or pm2
                                          Other nets can be deployed via the --net flag, for example: 'node tanglemonitor.js --net devnet'
                                          pm2 handles command line flags a bit differently: 'pm2 start tanglemonitor.js -- --net devnet' Be aware to include the double dash '--'           | `none`       |
| `environments.netName`                 | Name of the net (which needs to be declared via command line flag if it is not 'mainnet', see 'environments')                                    | `mainnet`      |
| `environments.subdomain`               | If you are running this instance on a subdomain you need to declare it here (e.g: spamnet.tanglemonitor.com)                                     | `''`      |
| `environments.apiServer.port`          | Port on which the API runs - Important that this port is matched within the front-end if you modify it
                                          (particularly when running several nets simultaneously on the same machine / domain)                                                              | `4433`      |
| `environments.apiServer.ssl`           | If you run this instance public and use ssl you need to enable via 'true'
                                          Certificates need to be placed in folder backend/ssl - see section [ssl](#ssl)                                                                    | `false`      |
| `environments.socketioServer.port`          | Port on which the WebSocket runs - Important that this port is matched within the front-end if you modify it
                                          (particularly when running several nets simultaneously on the same machine / domain)                                                              | `4434`      |
| `environments.socketioServer.ssl`           | If you run this instance public and use ssl you need to enable via 'true'
                                          Certificates need to be placed in folder backend/ssl - see section [ssl](#ssl)                                                                    | `false`      |
| `environments.maxAmountZmqConnections` | Defines the maximum amount of connections to ZMQ nodes (which are defined at 'zmqNodes' below)
                                          Please include at least two different sources of nodes to get the best results.                                                                   | `3`      |
| `environments.nodeSyncDeltaThreshold`  | Each node is regularly sync checked (Delta between LSSMI & LSMI) if 'syncCheck' is set 'true' on 'zmqNodes'.
                                          The threshold specifies at which delta a node should be considered 'unsynced' and thus be disconnected                                            | `10`      |
| `environments.zmqNodes`                | Pool of nodes which will potentially be connected to. First nodes in the list are prioritized.
                                          If a node gets out of sync or the connection is lost, another node will be tried.
                                          Maximum simultaneous connections to ZMQ nodes is set with the option 'maxAmountZmqConnections'                                                    | `none`      |
| `environments.zmqNodes.host`           | IP / URL of the ZMQ node (e.g. node.myiotanode.com).                                                                                             | `localhost`      |
| `environments.zmqNodes.port`           | ZMQ port of the node.                                                                                                                            | `5556`      |
| `environments.zmqNodes.api`            | IRI API port of the ZMQ node (needed for sync checks).                                                                                           | `14265`      |
| `environments.zmqNodes.ssl`            | `true` if IRI API port has ssl encryption (very likely if  IRI API port is 443).                                                                 | `false`      |
| `environments.zmqNodes.syncCheck`      | Should the ZMQ node be sync checked? 'zmqNodes.api' needs to be specified. Also see 'nodeSyncDeltaThreshold'.                                    | `27017`      |

## SSL

TBD
