/*eslint no-console: ["error", { allow: ["log", "error"] }] */
/* eslint security/detect-object-injection: 0 */ // Safe, as we do not pass user input to the objects

const MongoClient = require('mongodb').MongoClient;
const _ = require('lodash');
const loki = require('lokijs');
const lfsa = require('lokijs/src/loki-fs-structured-adapter.js');
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

const showDBinfo = () => {
  setTimeout(() => {
    const now = Date.now();
    console.log(`Running for ${parseInt((now - nowInit) / 1000 / 60, 10)} minutes`);
    console.log(collectionHistory, collection[collectionHistory].data.length);
    console.log(collectionTxNew, collection[collectionTxNew].data.length);
    console.log(collectionConfNew, collection[collectionConfNew].data.length);
    console.log(collectionMileNew, collection[collectionMileNew].data.length);
    showDBinfo();
  }, 60 * 1000);
};

const lokiDBInitialize = () => {
  lokiDBCollectionsGen({
    collectionName: collectionHistory,
    collectionTtlAge: 2 * 60 * 60 * 1000,
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

  showDBinfo();
};

const nowInit = Date.now();

const initLokiJS = (options, callback) => {
  const adapter = new lfsa();
  lokiDB = new loki('DB/lokiDB', {
    adapter: adapter,
    autoload: config.DB.persistent ? true : false,
    autoloadCallback: lokiDBInitialize,
    autosave: config.DB.persistent ? true : false,
    autosaveInterval: 1 * 60 * 1000
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

// Collection of DB calls
const lokiFind = (params, callback) => {
  let result = [];
  let err = false;
  try {
    result = collection[params.collection]
      .chain()
      .find(params.item)
      .data({ removeMeta: true });

    if (params.settings.limit) result = _.takeRight(result, params.settings.limit);
  } catch (e) {
    err = 'Error on lokiJS find() call: ' + e;
  } finally {
    if (callback) callback(err, result);
  }
};

const mongoDBFind = (params, callback) => {
  collection[params.collection].find(params.item, params.settings).toArray((err, res) => {
    if (err) console.log(Time.Stamp() + err);
    if (callback) callback(err, res);
  });
};

const lokiInsertOne = (params, callback) => {
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

const mongoDBinsertOne = (params, callback) => {
  collection[params.collection].insertOne(params.item, { w: 1 }, (err, res) => {
    if (callback) callback(err, res);
  });
};

const lokiUpdateMany = (params, callback) => {
  let error = false;
  try {
    const txToUpdate = collection[params.collection].find(params.item);
    if (txToUpdate.length > 0) {
      txToUpdate.map(entry => {
        entry = _.merge(entry, params.settings.$set);
      });
      collection[params.collection].update(txToUpdate);
    }
  } catch (e) {
    error = true;
    console.log(Time.Stamp(), e);
  } finally {
    if (callback) callback(error, error ? null : params.item);
  }
};

const mongoDBupdateMany = (params, callback) => {
  collection[params.collection].updateMany(params.item, params.settings, (err, res) => {
    if (err) console.log(Time.Stamp() + err);
    if (callback) callback(err, res);
  });
};

const lokiDistinct = (params, callback) => {
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

const mongoDBDistinct = (params, callback) => {
  collection[params.collection].distinct(params.item, params.settings, (err, res) => {
    if (err) console.log(Time.Stamp() + err);
    if (callback) callback(err, res);
  });
};

module.exports = {
  init: (settings, callback) => {
    collectionHistory = settings.collectionTxHistory;
    collectionTxNew = settings.collectionTxNew;
    collectionConfNew = settings.collectionConfNew;
    collectionMileNew = settings.collectionMileNew;

    switch (config.DB.driver) {
      case 'standalone':
        initLokiJS({}, result => {
          process.on('beforeExit', code => {
            console.log(`About to exit with code: ${code}`);
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
        initLokiJS({}, result => {
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
    return new Promise((resolve, reject) => {
      if (collection[params.collection]) {
        switch (config.DB.driver) {
          case 'standalone':
            lokiInsertOne(params, (err, result) => {
              if (err) {
                reject(err);
              } else {
                resolve(result);
              }
            });

            break;
          case 'MongoDB':
            mongoDBinsertOne(params, (err, result) => {
              if (err) {
                reject(err);
              } else {
                resolve(result);
              }
            });
            break;

          default:
            lokiInsertOne(params, (err, result) => {
              if (err) {
                reject(err);
              } else {
                resolve(result);
              }
            });
        }
      } else {
        reject(Time.Stamp() + 'DB not ready yet [call: insertOne]. Retrying to access...');
      }
    });
  },

  update: (params, callback) => {
    if (collection[params.collection]) {
      const lokiUpdate = () => {
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
          lokiUpdate();
          break;
        case 'MongoDB':
          mongoDBupdate();
          break;

        default:
          lokiUpdate();
      }
    } else {
      console.log(Time.Stamp() + 'DB not ready yet [call: update]. Retrying to access...');
    }
  },

  updateMany: (params, callback) => {
    return new Promise((resolve, reject) => {
      if (collection[params.collection]) {
        switch (config.DB.driver) {
          case 'standalone':
            lokiUpdateMany(params, (err, result) => {
              if (err) {
                reject(err);
              } else {
                resolve(result);
              }
            });
            break;
          case 'MongoDB':
            mongoDBupdateMany(params, (err, result) => {
              if (err) {
                reject(err);
              } else {
                resolve(result);
              }
            });
            break;

          default:
            lokiUpdateMany(params, (err, result) => {
              if (err) {
                reject(err);
              } else {
                resolve(result);
              }
            });
        }
      } else {
        reject(Time.Stamp() + 'DB not ready yet [call: updateMany]. Retrying to access...');
      }
    });
  },

  distinct: (params, callback) => {
    return new Promise((resolve, reject) => {
      if (collection[params.collection]) {
        switch (config.DB.driver) {
          case 'standalone':
            lokiDistinct(params, (err, result) => {
              if (err) {
                reject(err);
              } else {
                resolve(result);
              }
            });
            break;
          case 'MongoDB':
            mongoDBDistinct(params, (err, result) => {
              if (err) {
                reject(err);
              } else {
                resolve(result);
              }
            });
            break;

          default:
            lokiDistinct(params, (err, result) => {
              if (err) {
                reject(err);
              } else {
                resolve(result);
              }
            });
        }
      } else {
        reject(Time.Stamp() + 'DB not ready yet [call: distinct]. Retrying to access...');
      }
    });
  },

  find: params => {
    return new Promise((resolve, reject) => {
      if (collection[params.collection]) {
        switch (config.DB.driver) {
          case 'standalone':
            lokiFind(params, (err, result) => {
              if (err) {
                reject(err);
              } else {
                resolve(result);
              }
            });
            break;
          case 'MongoDB':
            mongoDBFind(params, (err, result) => {
              if (err) {
                reject(err);
              } else {
                resolve(result);
              }
            });
            break;

          default:
            lokiFind(params, (err, result) => {
              if (err) {
                reject(err);
              } else {
                resolve(result);
              }
            });
        }
      } else {
        reject(Time.Stamp() + 'DB not ready yet [call: find]. Retrying to access...');
      }
    });
  }
};
