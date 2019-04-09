/*eslint no-console: ["error", { allow: ["log", "error"] }] */
/* eslint security/detect-object-injection: 0 */
const MongoClient = require('mongodb').MongoClient;
const _ = require('lodash');
const loki = require('lokijs');
const config = require('../.config');
const Time = require('../modules/Time');

let collection = {};
let MongoDB, lokiDB;

let collectionHistory, collectionTxNew, collectionConfNew, collectionMileNew;

const ttlDaemonFuncGen = (collection, age) => {
  return function ttlDaemon() {
    const now = Date.now();
    const toRemove = collection.chain().where(member => {
      const timestamp = member.meta.created;
      const diff = now - timestamp;
      return age < diff;
    });
    toRemove.remove();
  };
};

const lokiDBCollectionsGen = params => {
  const collectionName = params.collectionName;
  const collectionTtlAge = params.collectionTtlAge;
  const ttlInterval = params.ttlInterval;
  const uniqueCollections = params.uniqueCollections;

  collection[collectionName] = lokiDB.getCollection(collectionName);
  if (collection[collectionName] === null) {
    collection[collectionName] = lokiDB.addCollection(collectionName, {
      unique: uniqueCollections,
      ttl: collectionTtlAge,
      ttlInterval: ttlInterval
    });
  } else {
    collection[collectionName].ttl.age = collectionTtlAge;
    collection[collectionName].ttl.ttlInterval = ttlInterval;
    collection[collectionName].ttl.daemon = setInterval(
      ttlDaemonFuncGen(collection[collectionName], collectionTtlAge),
      ttlInterval
    );
  }
};

const lokiDBInitialize = () => {
  lokiDBCollectionsGen({
    collectionName: collectionHistory,
    collectionTtlAge: 60 * 60 * 1000,
    ttlInterval: 60 * 1000,
    uniqueCollections: ['hash']
  });

  lokiDBCollectionsGen({
    collectionName: collectionTxNew,
    collectionTtlAge: 10 * 60 * 1000,
    ttlInterval: 60 * 1000,
    uniqueCollections: ['hash']
  });

  lokiDBCollectionsGen({
    collectionName: collectionConfNew,
    collectionTtlAge: 10 * 60 * 1000,
    ttlInterval: 60 * 1000,
    uniqueCollections: ['hash']
  });

  lokiDBCollectionsGen({
    collectionName: collectionMileNew,
    collectionTtlAge: 10 * 60 * 1000,
    ttlInterval: 60 * 1000,
    uniqueCollections: ['hash']
  });

  test();
};

const nowInit = Date.now();

const test = () => {
  setTimeout(() => {
    const now = Date.now();
    console.log(`Running for ${parseInt((now - nowInit) / 1000 / 60, 10)} minutes`);
    console.log(collectionHistory, collection[collectionHistory].data.length);
    console.log(collectionTxNew, collection[collectionTxNew].data.length);
    console.log(collectionConfNew, collection[collectionConfNew].data.length);
    console.log(collectionMileNew, collection[collectionMileNew].data.length);
    test();
  }, 60 * 1000);
};

const initStandaloneDB = (options, callback) => {
  lokiDB = new loki('lokiDB', {
    autoload: config.DB.persistent ? true : false,
    autoloadCallback: lokiDBInitialize,
    autosave: config.DB.persistent ? true : false,
    autosaveInterval: 5 * 60 * 1000
  });

  callback(Time.Stamp() + 'Standalone DB [LokiJS] initialized...');
};

const initMongoDB = (options, callback) => {
  const user = encodeURIComponent(config.DB.MongoDB.credentials.user);
  const password = encodeURIComponent(config.DB.MongoDB.credentials.password);

  const db = config.DB.MongoDB.name.toString();
  const host = config.DB.MongoDB.host.toString();
  const port = config.DB.MongoDB.port.toString();
  const authMechanism = 'DEFAULT';
  const url = `mongodb://${user}:${password}@${host}:${port}/${db}?authMechanism=${authMechanism}`;

  // collectionOptions.size => 20971520 bytes equals around 20MB
  const cappedCollectionSize = 20971520;

  //Esablish MongoDB connection
  MongoClient.connect(
    url,
    { autoReconnect: true, useNewUrlParser: true },
    (err, client) => {
      if (!err) {
        MongoDB = client.db(db);

        module.exports.createCollection({
          collection: collectionHistory,
          collectionOptions: { capped: true, size: cappedCollectionSize, max: 100000 },
          indexes: [
            { name: { hash: 1 }, indexOptions: { unique: true } },
            { name: { bundle: -1 }, indexOptions: {} }
          ]
        });

        module.exports.createCollection({
          collection: collectionTxNew,
          collectionOptions: { capped: true, size: cappedCollectionSize, max: 10000 },
          indexes: [{ name: { hash: 1 }, indexOptions: { unique: true } }]
        });

        module.exports.createCollection({
          collection: collectionConfNew,
          collectionOptions: { capped: true, size: cappedCollectionSize, max: 500 },
          indexes: [{ name: { hash: 1 }, indexOptions: { unique: true } }]
        });

        module.exports.createCollection(
          {
            collection: collectionMileNew,
            collectionOptions: { capped: true, size: cappedCollectionSize, max: 100 },
            indexes: [{ name: { hash: 1 }, indexOptions: { unique: true } }]
          },
          () => {
            callback(Time.Stamp() + 'MongoDB initialized...');
          }
        );
      } else {
        callback(Time.Stamp() + err);
      }
    }
  );
};

module.exports = {
  init: (settings, callback) => {
    collectionHistory = settings.collectionTxHistory;
    collectionTxNew = settings.collectionTxNew;
    collectionConfNew = settings.collectionConfNew;
    collectionMileNew = settings.collectionMileNew;

    switch (config.DB.driver) {
      case 'standalone':
        initStandaloneDB({}, result => {
          process.on('SIGINT', function() {
            console.log(Time.Stamp() + 'Flushing DB on exit...');
            lokiDB.close();
          });
          callback(result);
        });
        break;
      case 'MongoDB':
        initMongoDB({}, result => {
          callback(result);
        });
        break;

      default:
        initStandaloneDB({}, result => {
          callback(result);
        });
    }
  },

  createCollection: (options, callback) => {
    MongoDB.createCollection(options.collection, options.collectionOptions, (err, result) => {
      if (err) console.error(Time.Stamp() + `createCollection error: ${err}`);

      collection[options.collection] = result;
      console.log(Time.Stamp() + `Collection creation successfull (${options.collection})`);

      collection[options.collection].indexes((err, result) => {
        if (err) console.error(Time.Stamp() + `DB getIndex error: ${err}`);

        if (result.length < options.indexes.length + 1) {
          console.log(Time.Stamp() + 'Indexes missing! Creating..');
          options.indexes.map(index => {
            collection[options.collection].createIndex(
              index.name,
              index.indexOptions,
              (err, result) => {
                err
                  ? console.error(Time.Stamp() + `DB Index error: ${err}`)
                  : console.log(Time.Stamp() + `DB Index result: ${result}`);
              }
            );
          });
        } else {
          console.log(`${Time.Stamp()} ${result.length} indexes exist:`);
          result.forEach(index => {
            return console.log(Time.Stamp(), index.key);
          });
        }

        if (callback) callback(true);
      });
    });
  },

  insertOne: (params, callback) => {
    const standaloneinsertOne = () => {
      let error = false;
      try {
        collection[params.collection].insert(params.item);
      } catch (e) {
        error = true;
        //console.log(Time.Stamp(), e);
      } finally {
        // TODO, check real callback
        if (callback) callback(error, error ? null : { ops: [params.item] });
      }
    };

    const mongoDBinsertOne = () => {
      collection[params.collection].insertOne(params.item, { w: 1 }, (err, res) => {
        //if (err) console.log(Time.Stamp() + err);
        if (callback) callback(err, res);
      });
    };

    if (collection[params.collection]) {
      switch (config.DB.driver) {
        case 'standalone':
          standaloneinsertOne();

          break;
        case 'MongoDB':
          mongoDBinsertOne();
          break;

        default:
          standaloneinsertOne();
      }
    } else {
      console.log(Time.Stamp() + 'DB not ready yet [call: insertOne]. Retrying to access...');
    }
  },

  update: (params, callback) => {
    if (collection[params.collection]) {
      const standaloneUpdate = () => {
        let error = false;
        let result = false;
        try {
          result = collection[params.collection].findOne(params.item);
          if (result) {
            result = _.merge(result, params.settings.$set);
            collection[params.collection].update(result);
          }
        } catch (e) {
          error = true;
          console.log(Time.Stamp(), e);
        } finally {
          if (callback) callback(error, error ? null : result);
        }
      };

      const mongoDBupdate = () => {
        collection[params.collection].updateOne(params.item, params.settings, (err, res) => {
          if (err) console.log(Time.Stamp() + err);
          if (callback) callback(err, res);
        });
      };

      switch (config.DB.driver) {
        case 'standalone':
          standaloneUpdate();
          break;
        case 'MongoDB':
          mongoDBupdate();
          break;

        default:
          standaloneUpdate();
      }
    } else {
      console.log(Time.Stamp() + 'DB not ready yet [call: update]. Retrying to access...');
    }
  },

  updateMany: (params, callback) => {
    if (collection[params.collection]) {
      const standaloneUpdateMany = () => {
        let error = false;
        let result = [];
        try {
          result = collection[params.collection].find(params.item);
          if (result.length > 0) {
            result.map(entry => {
              entry = _.merge(entry, params.settings.$set);
              collection[params.collection].update(entry);
            });
          }
        } catch (e) {
          error = true;
          console.log(Time.Stamp(), e);
        } finally {
          if (callback) callback(error, error ? null : params.item);
        }
      };

      const mongoDBupdateMany = () => {
        collection[params.collection].updateMany(params.item, params.settings, (err, res) => {
          if (err) console.log(Time.Stamp() + err);
          if (callback) callback(err, res);
        });
      };

      switch (config.DB.driver) {
        case 'standalone':
          standaloneUpdateMany();
          break;
        case 'MongoDB':
          mongoDBupdateMany();
          break;

        default:
          standaloneUpdateMany();
      }
    } else {
      console.log(Time.Stamp() + 'DB not ready yet [call: updateMany]. Retrying to access...');
    }
  },

  distinct: (params, callback) => {
    if (collection[params.collection]) {
      const standaloneDistinct = () => {
        let error = false;
        let result = [];
        try {
          result = collection[params.collection].find(params.settings);
        } catch (e) {
          error = true;
          console.log(Time.Stamp(), e);
        } finally {
          if (!error) {
            if (result.length > 0) {
              result = result.reduce((acc, tx) => {
                acc.push(tx[params.item]);
                return acc;
              }, []);

              result = _.uniq(result);
            }
          }
          if (callback) callback(error, result);
        }
      };

      const mongoDBDistinct = () => {
        collection[params.collection].distinct(params.item, params.settings, (err, res) => {
          if (err) console.log(Time.Stamp() + err);
          if (callback) callback(err, res);
        });
      };

      switch (config.DB.driver) {
        case 'standalone':
          standaloneDistinct();
          break;
        case 'MongoDB':
          mongoDBDistinct();
          break;

        default:
          standaloneDistinct();
      }
    } else {
      console.log(Time.Stamp() + 'DB not ready yet [call: distinct]. Retrying to access...');
    }
  },

  find: (params, callback) => {
    const standaloneFind = () => {
      let result = collection[params.collection]
        .chain()
        .find(params.item)
        .data();

      if (params.settings.limit) result = _.takeRight(result, params.settings.limit);
      if (callback) callback(false, result);
    };

    const mongoDBFind = () => {
      collection[params.collection].find(params.item, params.settings).toArray((err, res) => {
        if (err) console.log(Time.Stamp() + err);
        if (callback) callback(err, res);
      });
    };
    if (collection[params.collection]) {
      switch (config.DB.driver) {
        case 'standalone':
          standaloneFind();
          break;
        case 'MongoDB':
          mongoDBFind();
          break;

        default:
          standaloneFind();
      }
    } else {
      console.log(Time.Stamp() + 'DB not ready yet [call: find]. Retrying to access...');
    }
  }
};
