/*eslint no-console: ["error", { allow: ["log", "error"] }] */

const fs = require('fs');
const express = require('express');
const http = require('http');
const https = require('https');

const config = require('../.config');
const Time = require('../modules/Time');

let socketIO;

/* Load ssl credentials */
const credentials = {
  key: fs.readFileSync('./ssl/priv.pem', 'utf8'),
  cert: fs.readFileSync('./ssl/crt.pem', 'utf8'),
  ca: fs.readFileSync('./ssl/ca.pem', 'utf8')
};

const domain = config.domain;

module.exports = {
  init: (settings, callback) => {
    // Setting up WebSocket server */
    const expressWS = express();

    const socketioServer = http.createServer(expressWS);
    const socketioServer_ssl = https.createServer(credentials, expressWS);

    domain !== 'localhost'
      ? socketioServer_ssl.listen(settings.socketioServer_ssl)
      : socketioServer.listen(settings.socketioServer);
    socketIO = require('socket.io')(domain !== 'localhost' ? socketioServer_ssl : socketioServer, {
      pingInterval: 20000,
      pingTimeout: 7500
    });

    expressWS.use((req, res, next) => {
      const domainString =
        domain !== 'localhost'
          ? `https://${settings.subdomain !== '' ? settings.subdomain + '.' : ''}${config.domain}`
          : `http://${settings.subdomain !== '' ? settings.subdomain + '.' : ''}localhost` +
            `${config.webServer.standalone ? ':' + config.webServer.port : ''}`;
      res.header('Access-Control-Allow-Origin', domainString);
      res.header('Access-Control-Allow-Credentials', true);

      next();
    });
    expressWS.settings['x-powered-by'] = false;

    // Initialize WebSocket server
    let userCount = 0;
    socketIO.on('connection', client => {
      userCount++;
      console.log(Time.Stamp() + `New client connected | Current total: ${userCount}`);
      client.on('disconnect', reason => {
        userCount--;
        console.log(Time.Stamp() + `Client disconnected (${reason}) | Current total: ${userCount}`);
      });
    });

    callback(Time.Stamp() + 'WebSocket server initialized...');
  },

  emit: (type, msg) => {
    socketIO.sockets.emit(type, msg);
  }
};
