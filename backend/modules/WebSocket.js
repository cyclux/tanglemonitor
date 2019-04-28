/*eslint no-console: ["error", { allow: ["log", "error"] }] */

const fs = require('fs');
const express = require('express');
const http = require('http');
const https = require('https');

const config = require('../config');
const Time = require('../modules/Time');

let socketIO;

// Load ssl credentials
const credentials = {
  key: fs.readFileSync('./ssl/priv.pem', 'utf8'),
  cert: fs.readFileSync('./ssl/crt.pem', 'utf8'),
  ca: fs.readFileSync('./ssl/ca.pem', 'utf8')
};

module.exports = {
  init: (settings, callback) => {
    // Setting up WebSocket server */
    const expressWS = express();

    // Init WebSocket (socket.io) server
    const socketioServer = settings.socketioServer.ssl
      ? https.createServer(credentials, expressWS)
      : http.createServer(expressWS);
    socketioServer.listen(settings.socketioServer.port);

    socketIO = require('socket.io')(socketioServer, {
      pingInterval: 20000,
      pingTimeout: 7500
    });

    expressWS.use((req, res, next) => {
      const domainString = `http${settings.socketioServer.ssl ? 's' : ''}://${
        settings.subdomain !== '' ? settings.subdomain + '.' : ''
      }${config.webServer.domain}${config.webServer.standalone ? ':' + config.webServer.port : ''}`;
      console.log('domainString', domainString);
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
