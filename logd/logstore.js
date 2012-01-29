/* Functions abstracting the logging datastore from logd.
 *
 * Originally, logd was written using Redis as a backing store, but since this
 * forced capping collections onto logd, problems were encountered both with
 * synchronicity (issuing multiple "MULTI"s) as well as extensibility (it's
 * difficult to allow for things you hadn't thought of, like searching, or
 * filtering by aspects that aren't pre-calculated).
 *
 * Logd now uses mongodb with capped collections as its backing store.  There
 * are a few reasons for this:
 *
 *   - mongodb has capped collections built in, which simplifies logd
 *   - mongodb has in-mem speed and durability on par with redis
 *   - mongodb will allow us to issue ad hoc queries against logfiles
 *   - mongodb capped collections have a natural order equivalent to the
 *     insertion order
 */

var mongodb = require("mongodb")
  , util    = require("util")
  , async   = require("async");


function extend(o1, o2) {
  var o2key;
  for (o2key in o2) {
    if (o2.hasOwnProperty(o2key)) {
      o1[o2key] = o2[o2key];
    }
  }
  return o1;
}

/* A wrapper around a MongoDB connection to define our own events or
 * catch and handle ones that should be dealt with in a standard manner.
 * 
 * Takes a config object which has:
 *
 *  - port : numeric or string port number, defaults to mongos' default
 *  - host : domain name or ip address, defaults to "localhost"
 *  - dbname: database name (defaults to "logd")
 *  - options: monogodb Db options.
 */

var MongoConnection = function(config) {
  
  var self = this;

  self.port = Number(config.port || mongodb.Connection.DEFAULT_PORT);
  self.host = config.host || "localhost";
  self.dbname = config.db || "logd";
  self.options = config.options || {};

  self.server = new mongodb.Server(self.host, self.port, {auto_reconnect: true});
  self.db = new mongodb.Db(self.dbname, self.server, self.options);
 
  self.connect = function() {
    self.db.open(function(err, db) {
      util.log("Connected to mongodb.");
      self.emit("connect", db);
    });
  };

  /* define a few useful callbacks for debugging */

  self.info = function(string) {
    return function(err, data) {
      util.log(string);
      self.print(err, data);
    };
  };

  self.print = function(err, data) {
    if (err) {
      util.log("Error: " + util.inspect(err));
    } else {
      util.log("Data: " + util.inspect(data));
    }
  };
  
  self.db.on("close", self.print);
  self.connect();
};

util.inherits(MongoConnection, process.EventEmitter);

/* Document Store abstraction */

var Store = function(config) {
  var self = this;
  
  self.storeConfig = config || {};

  /* establish some data that will be filled in upon initialization */

  self.logFiles = {};
  self.config = null;
  self.db = null;

  /* initialize basic structure we need in the data store.
   * this runs right after mongo connects to the db.
   */
  self.initStore = function(db) {
    self.emit("connect", self);
    self.db = self.mongo.db;
    self.config = new mongodb.Collection(db, "config");

    var done = function(err, results) {
      var colname;
      for (colname in self.logFiles) {
        if (self.logFiles.hasOwnProperty(colname)) {
          var collection = self.logFiles[colname];
          collection.ensureIndex(["_id", "level", "name"], function() {});
          collection.ensureIndex(["msg"], function() {});
        }
      }
      self.emit("setup", self);
    };

    /* initialize the logd database and all of our setup info */
    async.parallel([
      /* create Collection objects for all current log paths */
      function(callback) {
        self.getLogFiles(function(paths) {
          paths.forEach(function(p) {
            self.logFiles[p] = new mongodb.Collection(self.db, p);
            self.verifyConfig(p);
          });
          callback(null, paths);
        });
      },
      /* create the config index */
      function(callback) {
        self.config.ensureIndex("name", function() {
          callback(null, "index");
        });
      }
    ], done);

  /* end initStore */
  };

  /* fetch the current log files in the database */
  self.getLogFiles = function(cb) {
    self.db.collectionNames(function(err, data) {
      var ret = [];
      data.forEach(function(el) {
        if (el.name !== "logd.system.indexes" && el.name !== "logd.config") {
          ret[ret.length] = el.name.replace("logd.", "");
        }
      });
      util.log("Found " + ret.length + " collections: " + ret);
      cb(ret);
    });
  };

  /* If configuration for a log does not exist, create a stub.
   */
  self.verifyConfig = function(name) {
    self.config.findOne({"name": name}, function(err, cur) {
        if (cur == null) {
          self.createLogConfig(name, function(){});
        }
    });
  };

  self.createLogConfig = function(name, options, callback) {
    var args = Array.prototype.slice.call(arguments, 1);
    callback = args.pop();
    options = args.length ? args.shift() : null;

    /* if no options were passed, cook up some defaults */
    if (options === null) {
      var key;
      options = {capped: true};
      if (self.storeConfig.logs.hasOwnProperty(name)) {
        options = extend(options, self.storeConfig.logs[name]);
      } else {
        options = extend(options, self.storeConfig.logs['default']);
      }
    } else if (!options.hasOwnProperty("capped")) {
      options.capped = true;
    }
    
    /* create the collection & configs */
    async.parallel([
      function(c) {
        /* create the collection */
        self.db.createCollection(name, options, function(e,collection) {
          self.logFiles[name] = collection;
          collection.ensureIndex(["_id", "level", "name"], function() {
            collection.ensureIndex(["msg"], function() {
              c(null, null);
            });
          });
        });
      },
      function(c) {
        /* add the path to the config */
        self.config.insert({name: name, options: options}, function() {
          c(null, null);
        });
    }], callback);
  };


  /* create a log file if it isn't already created */
  self.createLog = function(name, options, callback) {
    var args = Array.prototype.slice.call(arguments, 1);
    callback = args.pop();
    options = args.length ? args.shift() : null;

    if (self.logFiles.hasOwnProperty(name) && !force) {
      callback(null, []);
    } else {
      self.createLogConfig(name, options, callback);
    }
  };

  /* delete a log file if it exists */
  self.deleteLog = function(name, callback) {
    if (self.logFiles.hasOwnProperty(name)) {
      async.parallel([
        function(c) {
          /* remove the collection */
          self.db.dropCollection(name, function() {
            delete self.logFiles[name];
            c(null, null);
          });
        },
        function(c) {
          /* remove the log file's configuration */
          self.config.remove({"name": name}, function() {
            c(null, null);
          });
        }], callback);
    } else {
      callback(null, []);
    }
  };

  /* append lines to a log, returns the number of items appended */
  self.appendLog = function(file, lines, callback) {
    /* if this log doesn't exist, create it w/ defaults */
    if (!self.logFiles.hasOwnProperty(file)) {
      self.createLog(file, function() {
        self.appendLog(file, lines, callback);
      });
    } else {
      var collection = self.logFiles[file];
      collection.insert(lines);
      if (typeof(callback) !== "undefined") {
        callback(lines.length);
      }
    }
  };

  self.updateAggregates = function() {
    var name;

    var updater = function(name) {
      return function(e, d) {
        self.config.update({'name': name}, {'$set': {'loggers': d}});
      };
    };

    for(name in self.logFiles) {
      if(self.logFiles.hasOwnProperty(name)) {
        /* update the "loggers" in the config */
        var collection = self.logFiles[name];
        collection.distinct('name', updater(name));
      }
    }
  };

  self.mongo = new MongoConnection(self.storeConfig.mongo || {});
  self.mongo.on("connect", self.initStore);

};

util.inherits(Store, process.EventEmitter);

exports.MongoConnection = MongoConnection;
exports.Store = Store;

