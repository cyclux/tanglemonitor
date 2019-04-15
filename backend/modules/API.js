/*eslint no-console: ['error', { allow: ['log', 'error'] }] */

const fs = require('fs');
const compression = require('compression');
const bodyParser = require('body-parser');
const http = require('http');
const https = require('https');
const express = require('express');
const helmet = require('helmet');

const config = require('../config');
const DB = require('../modules/DB');
const Time = require('../modules/Time');

const apiToken = config.apiToken;

const credentials = {
  key: fs.readFileSync('./ssl/priv.pem', 'utf8'),
  cert: fs.readFileSync('./ssl/crt.pem', 'utf8'),
  ca: fs.readFileSync('./ssl/ca.pem', 'utf8')
};

// Setting up API server
const api = express();

const apiServer = http.createServer(api);
const apiServer_ssl = https.createServer(credentials, api);

const domain = config.domain;

module.exports = {
  init: (settings, callback) => {
    domain !== 'localhost'
      ? apiServer_ssl.listen(settings.apiServer_ssl)
      : apiServer.listen(settings.apiServer);

    // Setting up API
    api.settings['x-powered-by'] = false;
    api.settings['json escape'] = true;
    api.use(helmet());
    api.set('trust proxy', 1);
    api.use(bodyParser.urlencoded({ extended: true }));
    api.use(bodyParser.json());
    api.use(compression());

    api.use((req, res, next) => {
      const domainString =
        domain !== 'localhost'
          ? `https://${settings.subdomain !== '' ? settings.subdomain + '.' : ''}${config.domain}`
          : `http://${settings.subdomain !== '' ? settings.subdomain + '.' : ''}localhost` +
            `${config.webServer.standalone ? ':' + config.webServer.port : ''}`;
      res.header('Access-Control-Allow-Origin', domainString);
      next();
    });

    const router = express.Router();

    router.get('/v1/getRecentTransactions', (req, res) => {
      let txAmount = 1;

      txAmount = parseInt(escape(req.query.amount), 10);
      if (!Number.isInteger(txAmount)) {
        txAmount = 10;
      }
      if (txAmount < 1) {
        txAmount = 1;
      }
      if (txAmount > config.apiMaxTransactions) {
        txAmount = config.apiMaxTransactions;
      }

      DB.find({
        collection: `txHistory-${settings.netName}`,
        item: {},
        settings: {
          projection: { _id: 0 },
          limit: txAmount,
          sort: { _id: -1 }
        }
      })
        .then(txHistory => {
          res.json({ txHistory });
        })
        .catch(err => {
          console.log(Time.Stamp() + err);
          res.json('DB not available currently.');
        });

      /*
      Maybe find solution to stream TX data

      const queryResult = DBtxHistory.find( {} ).stream();
      stream.on('data', item => {} );
      stream.on('end', () => {} );
      DBtxHistory.findOne({}, (err, item) => {
          res.json({ txHistory: item });
      });

      */
    });

    router.get('/v1/getConfirmedTransactions', (req, res) => {
      DB.find({
        collection: `txHistory-${settings.netName}`,
        item: { confirmed: true },
        settings: {
          projection: { _id: 0 },
          sort: { _id: -1 }
        }
      })
        .then(confirmedTransactions => {
          res.json({ confirmedTransactions });
        })
        .catch(err => {
          console.log(err);
        });
    });

    router.get('/v1/getUnconfirmedTransactions', (req, res) => {
      DB.find({
        collection: `txHistory-${settings.netName}`,
        item: { confirmed: false },
        settings: {
          projection: { _id: 0 },
          sort: { _id: -1 }
        }
      })
        .then(unconfirmedTransactions => {
          res.json({ unconfirmedTransactions });
        })
        .catch(err => {
          console.log(err);
        });
    });

    router.get('/v1/getTransactionsToRequest', (req, res) => {
      /* TODO: deprecated - Slow request > 100ms */
      DB.find({
        collection: `txHistory-${settings.netName}`,
        item: { confirmed: false },
        settings: {
          projection: { _id: 0 },
          limit: config.maxTransactions,
          sort: { _id: -1 }
        }
      })
        .then(getTransactionsToRequest => {
          res.json({ getTransactionsToRequest });
        })
        .catch(err => {
          console.log(err);
        });
    });

    router.get('/v1/resetReattach', (req, res) => {
      const t = escape(req.query.token);
      if (t === apiToken) {
        DB.updateMany({
          collection: `txHistory-${settings.netName}`,
          item: {},
          settings: { $set: { reattached: false } }
        })
          .then(result => {})
          .catch(err => {
            res.json({ err });
          });
      } else {
        res.json({ request_error: 'Restricted request!' });
      }
    });

    // Register route and listen on port
    api.use('/api', router);

    callback(Time.Stamp() + 'API started...');
  }
};
