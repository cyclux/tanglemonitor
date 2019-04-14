/* eslint no-console: ["error", { allow: ["log", "error"] }] */
/* eslint security/detect-object-injection: 0 */ // Safe, as we do not pass user input to the objects

const _ = require('lodash');
const Time = require('../modules/Time');
const WebSocket = require('../modules/WebSocket');
const DB = require('../modules/DB');

let confirmedBundles = []; //Track confirmed bundles
const confirmedBundlesSize = 15000;

module.exports = {
  NewTX: params => {
    if (params && params.newTX) {
      params.newTX = params.newTX = { transaction: params.newTX };

      const receivedAt = parseInt(params.newTX['transaction']['receivedAt'], 10);

      const hash = params.newTX['transaction']['hash'];
      const bundle = params.newTX['transaction']['bundle'];
      const branch = params.newTX['transaction']['branch'];
      const trunk = params.newTX['transaction']['trunk'];
      const tag = params.newTX['transaction']['tag'];
      const address = params.newTX['transaction']['address'];
      const value = params.newTX['transaction']['value'];

      const reassembledTX = {
        hash: hash,
        bundle: bundle,
        branch: branch,
        trunk: trunk,
        address: address,
        tag: tag,
        confirmed: false,
        reattached: false,
        receivedAt: receivedAt,
        ctime: 1111111111111,
        value: value,
        milestone: 'f'
      };

      // Check if it may be more appropriate to send on WS once it is successfully inserted in DB
      WebSocket.emit('newTX', reassembledTX);

      // Add new TX to DB
      DB.insertOne({ collection: params.settings.collectionTxHistory, item: reassembledTX })
        .then(() => {
          module.exports.checkFormerReattachment({
            txHash: reassembledTX.hash,
            bundleHash: reassembledTX.bundle,
            settings: params.settings
          });
        })
        .catch(() => {});
    }
  },

  checkReattachment: (params, tx, receivedAt) => {
    DB.distinct({
      collection: params.settings.collectionTxHistory,
      item: 'value',
      settings: { bundle: tx.bundle }
    })
      .then(res => {
        // Check if bundle includes value
        if (res.length > 1) {
          // Include bundle hash to confirmed bundles list
          // TODO: call this from DB conf collection
          if (!confirmedBundles.includes(tx.bundle)) confirmedBundles.unshift(tx.bundle);

          //tx.receivedAt = parseInt(tx.receivedAt, 10);
          /* Maybe performance optimization? https://docs.mongodb.com/manual/tutorial/perform-findAndModify-linearizable-reads/  */
          const range = _.range(receivedAt - 15, receivedAt + 16, 1);

          DB.find({
            collection: params.settings.collectionTxHistory,
            item: {
              $and: [
                { bundle: tx.bundle },
                { hash: { $ne: tx.hash } },
                { address: { $eq: tx.address } },
                { confirmed: false },
                { reattached: false },
                { receivedAt: { $nin: range } }
              ]
            },
            settings: {}
          })
            .then(reattaches => {
              if (reattaches.length > 0) {
                // TODO: send list of reattches instead to loop and send them seperately: front-end needs to be adapted
                let reattachList = [];

                reattaches.map(reattachTX => {
                  reattachList.push(reattachTX.hash);
                  const websocketUpdate = { hash: reattachTX.hash };

                  WebSocket.emit('updateReattach', websocketUpdate);
                });

                DB.updateMany({
                  collection: params.settings.collectionTxHistory,
                  item: { hash: { $in: reattachList } },
                  settings: { $set: { reattached: true, confirmed: false } }
                }).catch(err => {});
              }
            })
            .catch(err => {});
        }
      })
      .catch(err => {});
  },

  Confirmation: params => {
    // TODO: call this from DB conf collection
    confirmedBundles.length = confirmedBundlesSize;

    /* Search for TX hash in list and update status if confirmed */
    params.transactions.map((tx, index) => {
      if (params.inclusionStates[index] === true) {
        // Ist das optimierbar? Also zB statt einzeln batchweise? => bulkWrite
        // https://docs.mongodb.com/v3.2/core/bulk-write-operations/
        let receivedAt = 0;
        DB.update(
          {
            collection: params.settings.collectionTxHistory,
            item: { hash: tx.hash },
            settings: { $set: { confirmed: true, ctime: tx.ctime } }
          },
          (err, res) => {
            if (err) console.log(Time.Stamp() + err);
            if (res) receivedAt = res.receivedAt;
          }
        );
        // Find reattachments
        module.exports.checkReattachment(params, tx, receivedAt);

        const websocketUpdate = { hash: tx.hash, ctime: tx.ctime };
        WebSocket.emit('update', websocketUpdate);
      }
    });
  },

  checkFormerReattachment: params => {
    // TODO: call this from DB conf collection
    if (confirmedBundles.includes(params.bundleHash)) {
      /*
      Preserve for optional extended logging
      console.log(
        Time.Stamp() +
          `Reattachment updated: hash: ${params.txHash} bundle: ${params.bundleHash} length: ${
            confirmedBundles.length
          }`
      );
      */

      DB.update(
        {
          collection: params.settings.collectionTxHistory,
          item: { hash: params.txHash },
          settings: { $set: { reattached: true, confirmed: false } }
        },
        (err, res) => {
          const websocketUpdate = { hash: params.txHash };
          WebSocket.emit('updateReattach', websocketUpdate);
        }
      );
    }
  },

  Milestone: (params, callback) => {
    const confirmationTime = Date.now();

    if (params.newMile.milestone !== 't') {
      DB.find({
        collection: params.settings.collectionTxHistory,
        item: { hash: params.newMile.hash },
        settings: {}
      }).then(milestone => {
        if (milestone && milestone.length > 0) {
          console.log('milestone', milestone[0]);
          module.exports.Milestone({
            newMile: { hash: milestone[0].trunk, milestone: 't', ctime: confirmationTime },
            settings: params.settings
          });
        }
      });
    }

    DB.update({
      collection: params.settings.collectionTxHistory,
      item: { hash: params.newMile.hash },
      settings: {
        $set: {
          confirmed: true,
          ctime: params.newMile.ctime,
          milestone: params.newMile.milestone
        }
      }
    });

    WebSocket.emit('updateMilestone', params.newMile);

    if (callback) callback(params.newMile);
  }
};
