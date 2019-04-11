/*eslint no-console: ['error', { allow: ['log', 'error'] }] */
/* global console */

const zmq = require('zeromq');
const request = require('request');

const config = require('../.config');
const Time = require('../modules/Time');

/*  Store ZMQ Socket objects */
let zmqSockets = {};
/*  Ring buffer which stores most recent TX
    Incoming TX will only be processed further if they are present in this buffer
    This prevents processing TX, received by only a single node (which is probably syncing). */
let syncingCheckBuffer = [];
const syncingCheckBufferSize = 10000;
/* Stores current amount of connections to ZMQ nodes */
let zmqNodesAmountConnected = 0;
/* Maximum amount of parallel ZMQ connections (user defined via config) */
let maxAmountZmqConnections;
/* Store pool of ZMQ nodes (user defined via config) */
let zmqNodes;
/*  Threshold which determines at which delta between LMI and LSSMI
    the node should be considered "out-of-sync" (user defined via config) */
let nodeSyncDeltaThreshold;

process.on('message', msg => {
  if (msg && msg.init && msg.init) {
    const settings = msg.init;
    module.exports.init(settings, statusZMQ => {
      process.send({ consoleLog: statusZMQ });
    });
  }
});

const checkIsConnectedZmqNode = zmqNode => {
  if (
    zmqSockets[zmqNode.host] &&
    zmqSockets[zmqNode.host]['_zmq'] &&
    zmqSockets[zmqNode.host]['_zmq'].state === 0
  ) {
    return true;
  } else {
    return false;
  }
};

const processZmqMsg = (zmqMsg, settings) => {
  let zmqTX = {};
  try {
    const zmqMsgArray = zmqMsg.toString().split(' ');
    switch (zmqMsgArray[0]) {
      case 'tx':
        zmqTX = {
          newTX: {
            hash: zmqMsgArray[1],
            address: zmqMsgArray[2],
            value: parseInt(zmqMsgArray[3], 10),
            tag: zmqMsgArray[12],
            timestamp: parseInt(zmqMsgArray[5], 10),
            index: parseInt(zmqMsgArray[6], 10),
            indexTotal: parseInt(zmqMsgArray[7], 10),
            bundle: zmqMsgArray[8],
            trunk: zmqMsgArray[9],
            branch: zmqMsgArray[10],
            receivedAt: parseInt(zmqMsgArray[11], 10),
            receivedAtms: Date.now()
          }
        };
        break;
      case 'sn':
        zmqTX = {
          newConf: {
            milestone: parseInt(zmqMsgArray[1], 10),
            hash: zmqMsgArray[2],
            address: zmqMsgArray[3],
            trunk: zmqMsgArray[4],
            branch: zmqMsgArray[5],
            bundle: zmqMsgArray[6],
            ctime: Date.now()
          }
        };
        break;
      case 'lmhs':
        zmqTX = {
          newMile: {
            hash: zmqMsgArray[1],
            milestone: 'm',
            ctime: Date.now()
          }
        };
        break;
      default:
        zmqTX = { default: zmqMsgArray };
    }
  } catch (err) {
    console.log(Time.Stamp() + `Error: ${zmqTX}`);
  }

  if (zmqTX.newTX) {
    // Compensate for possible wrong timestamp precision

    if (Math.ceil(Math.log10(zmqTX.newTX.receivedAt + 1)) === 10) {
      zmqTX.newTX.receivedAt = zmqTX.newTX.receivedAt * 1000;
    }

    // Only process new TX if they were already received by another node recently
    if (syncingCheckBuffer.includes(zmqTX.newTX.hash)) {
      process.send({ type: 'cmd', call: 'newTX', zmqTX: zmqTX, settings: settings });
    } else {
      syncingCheckBuffer.unshift(zmqTX.newTX.hash);
    }
  } else if (zmqTX.newConf) {
    process.send({ type: 'cmd', call: 'newConf', zmqTX: zmqTX, settings: settings });
  } else if (zmqTX.newMile) {
    process.send({ type: 'cmd', call: 'newMile', zmqTX: zmqTX, settings: settings });
  } else {
    if (zmqTX && !zmqTX.default) console.log(Time.Stamp() + `zmqTX not recognized: ${zmqTX}`);
  }
};

module.exports = {
  init: (settings, callback) => {
    zmqNodes = settings.zmqNodes;
    maxAmountZmqConnections = settings.maxAmountZmqConnections;
    nodeSyncDeltaThreshold = settings.nodeSyncDeltaThreshold;

    module.exports.nodeCheck(settings, { initialCall: true, loop: true });

    callback(Time.Stamp() + 'ZMQ listener started...');
  },

  nodeCheck: (settings, options) => {
    // Track amount of connected ZMQ nodes
    let zmqNodesAmountCounter = 0;
    // Track iteration count for node check routine
    let iterCount = 0;

    if (config.logging.showZmqNodeStatus) {
      console.log('===============================================');
    }

    zmqNodes.forEach((zmqNode, key, zmqNodes) => {
      const requestOptions = {
        url: `http${zmqNode.ssl ? 's' : ''}://${zmqNode.host}:${zmqNode.api}`,
        method: 'POST',
        timeout: 2000,
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(
            JSON.stringify({
              command: 'getNodeInfo'
            })
          ),
          'X-IOTA-API-Version': '1'
        },
        json: {
          command: 'getNodeInfo'
        }
      };

      request(requestOptions, (error, response, data) => {
        let syncDelta = 0;
        iterCount++;

        const isConnectedZmqNode = checkIsConnectedZmqNode(zmqNode);

        // Check and track actual connection state for each node
        if (isConnectedZmqNode) zmqNodesAmountCounter++;

        // On last iteration match counted connections with global state
        if (iterCount === zmqNodes.length && !options.initialCall) {
          zmqNodesAmountConnected = zmqNodesAmountCounter;
          if (config.logging.showZmqNodeStatus) {
            console.log(Time.Stamp() + `Current ZMQ node connections: ${zmqNodesAmountConnected}`);
          }
        }

        if (data && data.latestMilestoneIndex) {
          syncDelta =
            parseInt(data.latestMilestoneIndex, 10) -
            parseInt(data.latestSolidSubtangleMilestoneIndex, 10);
          if (config.logging.showZmqNodeStatus && !options.initialCall) {
            console.log(
              Time.Stamp() +
                `${zmqNode.host} [syncDelta: ${syncDelta} | LMI/LSSMI ${
                  data.latestMilestoneIndex
                } ${data.latestSolidSubtangleMilestoneIndex}] State: ${
                  isConnectedZmqNode ? 'connected' : 'disconnected'
                }`
            );
          }

          if (
            (!isConnectedZmqNode &&
              syncDelta < nodeSyncDeltaThreshold &&
              zmqNodesAmountConnected < maxAmountZmqConnections &&
              zmqNodesAmountCounter < maxAmountZmqConnections) ||
            (!zmqSockets[zmqNode.host] &&
              syncDelta < nodeSyncDeltaThreshold &&
              zmqNodesAmountConnected < maxAmountZmqConnections &&
              zmqNodesAmountCounter < maxAmountZmqConnections)
          ) {
            console.log(
              Time.Stamp() +
                `Opening connection to ${zmqNode.host} [syncDelta: ${syncDelta} | LMI/LSSMI ${
                  data.latestMilestoneIndex
                } ${data.latestSolidSubtangleMilestoneIndex}]`
            );

            module.exports.connect(
              zmqNode,
              settings
            );
          } else if (isConnectedZmqNode && syncDelta >= nodeSyncDeltaThreshold) {
            console.log(
              Time.Stamp() +
                `Node out of sync: ${zmqNode.host} [syncDelta ${syncDelta} | LMI/LSSMI ${
                  data.latestMilestoneIndex
                } ${data.latestSolidSubtangleMilestoneIndex}]. Closing ZMQ connection...`
            );
            zmqSockets[zmqNode.host].emit('close');
            zmqSockets[zmqNode.host].close();
            // Workaround as close event is not fired (by zeromq library)
          }
        } else {
          if (config.logging.showZmqNodeStatus) {
            console.log(
              Time.Stamp() +
                `Error fetching node info via API from ${zmqNode.host} | State: ${
                  isConnectedZmqNode ? 'connected' : 'disconnected'
                }`
            );
          }

          // No API response from this node. If the ZMQ connection was already established, disconnect
          if (isConnectedZmqNode) {
            console.log(
              Time.Stamp() + `No API response from ${zmqNode.host}. Closing connection...`
            );
            zmqSockets[zmqNode.host].emit('close');
            zmqSockets[zmqNode.host].close();
            // Workaround as close event is not fired (by zeromq library)
          }
        }
      });
    });

    if (options.loop) {
      setTimeout(() => {
        module.exports.nodeCheck(settings, { initialCall: false, loop: true });
        // Keep "tx sync buffer" capped: does not need to be strictly 10k length, so calling it every 30s suffices
        syncingCheckBuffer.length = syncingCheckBufferSize;
      }, 30 * 1000);
    }
  },

  connect: (node, settings) => {
    if (zmqNodesAmountConnected < maxAmountZmqConnections) {
      zmqNodesAmountConnected++;

      zmqSockets[node.host] = zmq.socket('sub');
      zmqSockets[node.host].connect(`tcp://${node.host}:${node.port}`);
      console.log(
        Time.Stamp() +
          `Connected to ${node.host} | Current ZMQ node connections: ${zmqNodesAmountConnected}`
      );

      zmqSockets[node.host].subscribe('tx'); // New transactions
      zmqSockets[node.host].subscribe('sn'); // New confirmed transactions
      zmqSockets[node.host].subscribe('lmhs'); // New milestones

      zmqSockets[node.host].on('close', close => {
        zmqNodesAmountConnected--;
        console.log(
          Time.Stamp() +
            `Connection close: ${
              node.host
            } | Current ZMQ node connections: ${zmqNodesAmountConnected}`
        );

        module.exports.nodeCheck(settings, { initialCall: false, loop: false });
      });

      zmqSockets[node.host].on('message', zmqMsg => {
        processZmqMsg(zmqMsg, settings);
      });
    }
  }
};
