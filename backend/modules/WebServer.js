/*eslint no-console: ['error', { allow: ['log', 'error'] }] */

const express = require('express');
const path = require('path');
const config = require('../config');
const Time = require('../modules/Time');

module.exports = {
  init: (settings, callback) => {
    const webServer = express();
    webServer.set('port', config.webServer.port);
    webServer.use(express.static(path.join(__dirname, '../../frontend')));

    webServer.listen(webServer.get('port'), () => {
      callback(
        Time.Stamp() + 'Tanglemonitor is now running on http://localhost:' + webServer.get('port')
      );
    });
  }
};
