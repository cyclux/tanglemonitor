/*eslint no-console: ['error', { allow: ['log', 'error'] }] */
/* global console */

const fs = require('fs');
const compression = require('compression');
const bodyParser = require('body-parser');
const http = require('http');
const https = require('https');
const express = require('express');
const helmet = require('helmet');

const config = require('../.config');
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
          ? `https://${settings.subdomain !== '' ? settings.subdomain + '.' : ''}${settings.domain}`
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

      DB.find(
        {
          collection: settings.collectionTxHistory,
          item: {},
          settings: {
            projection: { _id: 0 },
            limit: txAmount,
            sort: { _id: -1 }
          }
        },
        (err, txHistory) => {
          res.json({ txHistory });
        }
      );
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
      DB.find(
        {
          collection: settings.collectionTxHistory,
          item: { confirmed: true },
          settings: {
            projection: { _id: 0 },
            sort: { _id: -1 }
          }
        },
        (err, confirmedTransactions) => {
          res.json({ confirmedTransactions });
        }
      );
    });

    router.get('/v1/getUnconfirmedTransactions', (req, res) => {
      DB.find(
        {
          collection: settings.collectionTxHistory,
          item: { confirmed: false },
          settings: {
            projection: { _id: 0 },
            sort: { _id: -1 }
          }
        },
        (err, unconfirmedTransactions) => {
          res.json({ unconfirmedTransactions });
        }
      );
    });

    router.get('/v1/getTransactionsToRequest', (req, res) => {
      /* TODO: deprecated - Slow request > 100ms */
      DB.find(
        {
          collection: settings.collectionTxHistory,
          item: { confirmed: false },
          settings: {
            projection: { _id: 0 },
            limit: config.maxTransactions,
            sort: { _id: -1 }
          }
        },
        (err, getTransactionsToRequest) => {
          res.json({ getTransactionsToRequest });
        }
      );
    });

    router.get('/v1/resetReattach', (req, res) => {
      const t = escape(req.query.token);
      if (t === apiToken) {
        DB.updateMany(
          {
            collection: settings.collectionTxHistory,
            item: {},
            settings: { $set: { reattached: false } }
          },
          (err, result) => {
            const answer = result ? result : err;
            res.json({ answer });
          }
        );
      } else {
        res.json({ request_error: 'Restricted request!' });
      }
    });

    router.get('/v1/distinct', (req, res) => {
      const thebundle = req.query.bundle;
      DB.distinct(
        {
          collection: settings.collectionTxHistory,
          item: 'value',
          settings: { bundle: thebundle }
        },
        (err, result) => {
          const answer = result ? result : err;
          res.json({ answer });
        }
      );
    });

    router.get('/v1/getTransactions', (req, res) => {
      let txRequested;
      try {
        txRequested = JSON.parse(req.query.hashes);
      } catch (error) {
        res.json({ Request_error: 'No TX hashes given (Array)' });
      }

      if (Array.isArray(txRequested) && txRequested.length > 0) {
        txRequested.forEach(txHash => {
          DB.find(
            {
              collection: settings.collectionTxHistory,
              item: { hash: txHash },
              settings: {
                projection: { _id: 0 }
              }
            },
            (err, Transactions) => {
              res.json({ Transactions });
            }
          );
        });
      } else {
        res.json({ Request_error: 'No TX hashes given (Array)' });
      }
    });

    // Register route and listen on port
    api.use('/api', router);

    callback(Time.Stamp() + 'API started...');
  }
};
