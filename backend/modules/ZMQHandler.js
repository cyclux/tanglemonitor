/*eslint no-console: ['error', { allow: ['log', 'error'] }] */
/* global console */

//const config = require('../.config');
const Time = require('../modules/Time');
const TXprocessor = require('../modules/TXprocessor');
const DB = require('../modules/DB');

// The ZMQ Handler receives callbacks from the forked ZeroZMQ libary and processes the messages accordingly
// This prevents ZeroZMQ library to block the main event loop

module.exports = {
  process: msg => {
    if (msg.type === 'consoleLog') {
      console.log(Time.Stamp() + msg);
    } else if (msg.type === 'cmd' && msg.call) {
      switch (msg.call) {
        case 'newTX':
          // Only process if the TX was not already received from another node (hash is unique key)
          DB.insertOne(
            { collection: msg.settings.collectionTxNew, item: { hash: msg.zmqTX.newTX.hash } },
            (err, res) => {
              if (res) {
                const dbResponse = { newTX: msg.zmqTX.newTX, settings: msg.settings };
                TXprocessor.NewTX(dbResponse);
              }
            }
          );
          break;

        case 'newConf':
          // Only process confirmation if it was not already received from another node (hash is unique key)
          DB.insertOne(
            { collection: msg.settings.collectionConfNew, item: { hash: msg.zmqTX.newConf.hash } },
            (err, res) => {
              if (res) {
                TXprocessor.Confirmation({
                  transactions: [msg.zmqTX.newConf],
                  inclusionStates: [true],
                  settings: msg.settings
                });
              }
            }
          );
          break;

        case 'newMile':
          // Only process if the Milestone was not already received from another node (hash is unique key)
          DB.insertOne(
            { collection: msg.settings.collectionMileNew, item: msg.zmqTX.newMile },
            (err, res) => {
              if (res) {
                const dbResponse = { newMile: msg.zmqTX.newMile, settings: msg.settings };
                TXprocessor.Milestone(dbResponse);
              }
            }
          );
          break;
        default:
          console.log(Time.Stamp() + 'ZMQ Handler cannot recognize command from ZMQ fork process');
      }
    }
  }
};
