/*eslint no-console: ['error', { allow: ['log', 'error'] }] */
/* global console */

/* Start options
node tanglemonitor.js --net devnet
pm2 start tanglemonitor.js -f -- --net devnet
*/

const commandLineArgs = require('command-line-args');
// Doku https://github.com/75lb/command-line-args/wiki
// https://github.com/75lb/command-line-usage
const config = require('./.config');

const DB = require('./modules/DB');
const API = require('./modules/API');
const ZMQ = require('./modules/ZMQ');
const Time = require('./modules/Time');
const WebSocket = require('./modules/WebSocket');
const WebServer = require('./modules/WebServer');

// Define accepted CLI parameters
const cliDefinitions = [{ name: 'net', alias: 'n', type: String }];
const cliParams = commandLineArgs(cliDefinitions);

// Set net according to CLI parameter - default to mainnet
const netEnvironment = cliParams && cliParams.net ? cliParams.net : 'mainnet';

// Set Port / URL according to net environment
let settings;
switch (netEnvironment) {
  case 'mainnet':
    settings = config.env.mainnet;
    break;
  case 'devnet':
    settings = config.env.devnet;
    break;
  case 'spamnet':
    settings = config.env.spamnet;
    break;
  default:
    console.log(
      Time.Stamp() + `Settings for ${netEnvironment} not found! Defaulting to MAINNET...`
    );
    settings = config.env.mainnet;
}

console.log(Time.Stamp() + `Starting tanglemonitor with ${netEnvironment} settings...`);

// Once DB is initialized, start API, ZMQ listener and WebSocket server
DB.init(settings, statusDB => {
  console.log(statusDB);

  API.init(settings, statusAPI => {
    console.log(statusAPI);
  });

  ZMQ.init(settings, statusZMQ => {
    console.log(statusZMQ);
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
