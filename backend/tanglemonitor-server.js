/* eslint no-console: ['error', { allow: ['log', 'error'] }] */
/* eslint security/detect-child-process: 0 */ // Safe, as we do not execute user input as child_process
/* global console */

/* Start options
node tanglemonitor.js --net devnet
pm2 start tanglemonitor.js -f -- --net devnet
*/

/*
TODO:
Give option to delete DB collections
*/


const commandLineArgs = require('command-line-args');
const { fork } = require('child_process');
// Doku https://github.com/75lb/command-line-args/wiki
// https://github.com/75lb/command-line-usage
const config = require('./config');

const DB = require('./modules/DB');
const API = require('./modules/API');
const ZMQHandler = require('./modules/ZMQHandler');
const Time = require('./modules/Time');
const WebSocket = require('./modules/WebSocket');
const WebServer = require('./modules/WebServer');

// Define accepted CLI parameters
const cliDefinitions = [{ name: 'net', alias: 'n', type: String }];
const cliParams = commandLineArgs(cliDefinitions);

// Set net according to CLI parameter - default to mainnet
const netEnvironment = cliParams && cliParams.net ? cliParams.net : 'mainnet';

// Define (net environment) settings according to user config
let settings = config.environments.find(nets => nets.netName === netEnvironment);
if (!settings) {
  settings = console.log(
    `Settings for '${netEnvironment}' not found! Please set '--net' flag according to the declaration specified in '.config'`
  );
  process.exit(1);
}

console.log(Time.Stamp() + `Starting tanglemonitor with ${netEnvironment} settings...`);

// Once DB is initialized, start API, ZMQ listener and WebSocket server
DB.init(settings, statusDB => {
  console.log(statusDB);

  API.init(settings, statusAPI => {
    console.log(statusAPI);
  });

  // ZeroZMQ library tends to block the event loop on heavy load,
  // thus we spawn a fork and listen on message callbacks which are handled by the ZMQHandler
  const ZMQ = fork('./modules/ZMQ.js');
  ZMQ.send({ init: settings });
  ZMQ.on('message', msg => {
    ZMQHandler.process(msg);
  });

  WebSocket.init(settings, statusWS => {
    console.log(statusWS);
  });

  if (config.webServer && config.webServer.standalone) {
    WebServer.init(settings, statusWeb => {
      console.log(statusWeb);
    });
  } else {
    console.log(
      Time.Stamp() +
        'Running on dedicated web server settings. Please configure your web server accordingly to reach Tanglemonitor.'
    );
  }

});
