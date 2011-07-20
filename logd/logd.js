var dgram  = require('dgram')
  , sys    = require('sys')
  , net    = require('net')
  , msgpack = require('msgpack')
  , config = require('./config')
  , redis  = require('redis')

/* enums for message types and message levels */

var types = Object.freeze({
  LOG: 1,
  COUNTER: 2,
  TIMER: 3,
  DELETE_LOG: 4,
});

var levels = Object.freeze({
  DEBUG: 10,
  INFO: 20,
  WARNING: 30,
  ERROR: 40,
  FATAL: 50
});

var messagesReceived = 0;
var messagesReceivedPrev = 0;
var logMessages = {};
var counters = {};
var timers = {};
var debugInt, flushInt, logInt, trimInt, statsInt, server;


function redisErrback(err, ret) {
  if (err) {
    sys.log("redis error: " + err);
  }
}

/* Connect to redis, using the configuration options provided, falling
 * back on sane defaults.  Sets a few message handlers to deal with errors
 * and report the status of the connection.
 */

function redisConnect(config) {
  var port = Number(config.redis.port || 6379),
      host = config.redis.host || "localhost",
      options = config.redisOptions || {};

  var client = redis.createClient(port, host, options);

  client.on("end", function() {
    sys.log("end event received from Redis client.");
  });

  client.on("error", function(err) {
    sys.log("Redis error: " + err.message);
    /* if this was connection refused, lets exit */
    if (err.message.match(/ECONNREFUSED/)) {
      process.exit(-1);
    }
  });

  client.on("connect", function() {
    sys.log("connected to Redis server on " +
      (config.redis.host || 'localhost') + ":" +
      Number(config.redis.port || 6379));
  });

  return client;
}

/* Trim the logs in redis, flushing any records that have been trimmed.
 * Because this relies on a few synchronous round trips to redis per logger,
 * it's run on its own interval.
 */

function trimLogs(redisClient, config) {
  var logd = config.redis.prefix || 'logd';
  var defaultSize = config.logSize['default'] || 100000;

  /* fetch a list of all of the paths to truncate */
  redisClient.smembers(logd + ':paths', function(err, paths) {
    for(var i=0; i<paths.length; i++) {
      var path = paths[i];
      var size = Number(config.logSize[path] || defaultSize);
      /* for every log, we have to truncate the main list, but we also need to
       * fetch the discarded items at the same time in order to delete the keys
       * for those messages and remove them from any sets they might have
       * belonged to
       */
      redisClient.multi()
        .sort(logd + ':log:' + path, 'BY', 'nosort', 'LIMIT', size, -1, 'GET',
              logd + ':log:' + path + ':*', 'GET', '#')
        .ltrim(logd + ':log:' + path, 0, size-1)
        .exec(function(err, ret){ 
          /* remove each log item from the main db and from each level, which
           * are known without fetching a list.
           */
          if (!removedItems) return;
          var removedItems = ret[0];
          var multi = redisClient.multi();

          for(var j=0; j<removedItems.length; j+=2) {
            var msg = msgpack.unpack(removedItems[i]), key = removedItems[i+1];
            multi
              .zrem(logd + ':log:' + path + ':level:' + msg.level, key)
              .zrem(logd + ':log:' + path + ':name:' + msg.name, key)
              .del(logd + ':log:' + path + ':' + key);
          }
          multi.exec(redisErrback);
      });
    }
  });
}

/* Delete a log and all support data for a given log on a path. */
function deleteLog(redisClient, config, path) {
  var logd = config.redis.prefix || 'logd';
  var base = logd + ':log:' + path;
  redisClient.lrange(base, 0, -1, function(err, keys) {
    var multi = redisClient.multi();
    for (var i=0; i<keys.length; i++) {
      var key = keys[i];
      multi.del(base + ':' + key);
    }
    multi.del(base);
    multi.del(base + ':next');
    multi.exec(redisErrback);
  });
  redisClient.lrange(base + ':' + 'names', 0, -1, function(err, keys) {
    /* FIXME: We are going to just keep level names here, which means we also
     * need to store a set of them;  similar to how we have log:names, we need
     * log:levels.  For now, we assume the python levelnames.
     */
    var multi = redisClient.multi();
    multi
      .del(base + ':level:INFO')
      .del(base + ':level:DEBUG')
      .del(base + ':level:WARNING')
      .del(base + ':level:ERROR')
      .del(base + ':level:CRITICAL');
    for (var i=0; i<keys.length; i++) {
      multi.del(base + ':name:' + keys[i]);
    }
    multi.del(base + ':names');
    multi.exec(redisErrback);
  });
}

/* send stats to graphite */

function sendStats(config, stats) {
  var port = Number(config.graphite.port || 2003)
    , host = config.graphite.host || 'localhost';

  try {
    var graphite = net.createConnection(port, host);
    graphite.addListener('error', function(connectionException){
      if (config.debug) {
        sys.log(connectionException);
      }
    });
    graphite.on('connect', function() {
      this.write(stats);
      this.end();
    });
  } catch(e) {
    if (config.debug) {
      sys.log(e);
    }
  }
}

/* read the config file and run the server */
config.configFile(process.argv[2], function (config, oldConfig) {
  if (! config.debug && debugInt) {
    clearInterval(debugInt); 
    debugInt = false;
  }

  if (config.debug) {
    if (debugInt !== undefined) { clearInterval(debugInt); }
    debugInt = setInterval(function () {
      sys.log("counters: " + sys.inspect(counters));
      sys.log("timers: " + sys.inspect(timers));
    }, config.debugInterval || 10000);
  }

  if (typeof config.logSize == 'undefined') {
    config.logSize = {'default': 100000};
  }

  if (typeof config.redis == 'undefined') {
    sys.log("no redis config, using defaults.");
    config.redis = {};
  }
  
  if (typeof config.graphite == 'undefined') {
    sys.log("no graphite config, using defaults.");
    config.graphite = {};
  }

  var redisClient = redisConnect(config);

  if (server === undefined) {
    var port = Number(config.port || 8126);
    /* listen on a datagram socket and add messages to local data structures to
     * be flushed out at a configurable interval.
     */
    server = dgram.createSocket('udp4', function (msg, rinfo) {
      messagesReceived++;
      var blob = msgpack.unpack(msg);
      if (config.debug) { 
        sys.log(sys.inspect(msg)); 
      }

      switch (blob.id) {
        case types.LOG:
          /* TODO: do we care about this? this doubles the amt of
           * msgpack/unpack we have to do, but it allows us to always know
           * which ip sent us some information
           */
          blob.ip = rinfo.address;
          if (! logMessages[blob.path]) {
            logMessages[blob.path] = [];
          }
          logMessages[blob.path].push(blob);
          break;
        case types.COUNTER:
          /* statsd like counter */
          var sampleRate = blob.rate || 1;
          if (! counters[blob.key]) {
            counters[blob.key] = 0;
          }
          counters[blob.key] += Number((blob.value || 1) * (1 / sampleRate));
          break;
        case types.TIMER:
          /* statsd like timer */
          if (! timers[blob.key]) {
            timers[blob.key] = [];
          }
          timers[blob.key].push(blob.value);
          break;
        case types.DELETE_LOG:
          deleteLog(redisClient, blob.path);
        default: break;
      }
    });
    
    server.on("listening", function() {
      sys.log("logd listening on port " + port);
    });

    server.bind(port);
  }
    
  /* every second, print if we've received messages or not */
  var logInterval = Number(config.logInterval || 1000);

  logInt = setInterval(function() {
    if (messagesReceived != messagesReceivedPrev) {
      dmsg = messagesReceived - messagesReceivedPrev;
      messagesReceivedPrev = messagesReceived;
      sys.log("Received " + dmsg + " messages in 1s (" + messagesReceived + " total).");
    }
  }, logInterval);

  /* every second, flush local stats & messages to redis */
  var flushInterval = Number(config.flushInterval || 1000);

  flushInt = setInterval(function() {
    /* flush log messages */
    var messages, logger, size, msg;
    var allsize = Number(config.logSize['all'] || 250000);
    var logd = config.redis.prefix || 'logd';

    for (path in logMessages) {
      if (!logMessages[path] || !logMessages[path].length) continue;

      var base = logd + ':log:' + path;

      /* ids for these messages are simple monotonically increasing integers.
       * fetch the value for the next id from the database and add the cached
       * messages.
       */
      redisClient.get(base + ':next', function(base, path) {
          return function(err, next) {
            var messages = logMessages[path];
            var count = 0;
            var multi = redisClient.multi();
            next = Number(next);
            /* if there was no "next" setting, then this logger didn't exist yet.
             * add it to the list of paths and give it a next val
             */
            if (next == null) {
              next = 1;
              redisClient.multi()
                .sadd('logd:paths', path)
                .set(base + ':next', next)
                .exec();
            }

            /* add the messages to the path's lists & ordered sets */
            for( ; count < messages.length; count++, next++) {
              msg = messages[count];
              msg.id = next;
              //  https://github.com/mranney/node_redis/pull/119
              //  fixed in 0.6.5
              var packed = msgpack.pack(msg);
              //var bufpacked = new Buffer(packed.length);
              //packed.copy(bufpacked)
              multi
                .set(base + ':' + next, packed)
                .lpush(base, next)
                .zadd(base + ':level:' + msg.level, -msg.time, next)
                .zadd(base + ':name:' + msg.name, -msg.time, next)
                .sadd(base + ':names', msg.name);
            }

            /* clear local cache, increment the in-redis next val, and flush */
            /*
            if (!count) {
              debugger;
            }
            */
            multi.incrby(base + ':next', count);
            multi.exec(redisErrback);
            logMessages[path] = [];
          };
        }(base, path)
      );
    }

  }, flushInterval);

  var trimInterval = Number(config.trimInterval || 10000);

  trimInt = setInterval(function() {
    trimLogs(redisClient, config);
  }, trimInterval)
  

  /* Every 10 seconds, flush stats to graphite.  This code is exactly
   * the same as the statsd code, as even the local storage is identical.
   */
  var statsInterval = Number(config.statsInterval || 10000);

  statsInt = setInterval(function() {
    var statString = '';
    var ts = Math.round(new Date().getTime() / 1000);
    var numStats = 0;
    var key;

    for (key in counters) {
      var value = counters[key] / (flushInterval / 1000);
      var message = 'stats.' + key + ' ' + value + ' ' + ts + "\n";
      message += 'stats_counts.' + key + ' ' + counters[key] + ' ' + ts + "\n";
      statString += message;
      counters[key] = 0;

      numStats += 1;
    }

    for (key in timers) {
      if (timers[key].length > 0) {
        var pctThreshold = config.percentThreshold || 90;
        var values = timers[key].sort(function (a,b) { return a-b; });
        var count = values.length;
        var min = values[0];
        var max = values[count - 1];

        var mean = min;
        var maxAtThreshold = max;

        if (count > 1) {
          var thresholdIndex = Math.round(((100 - pctThreshold) / 100) * count);
          var numInThreshold = count - thresholdIndex;
          values = values.slice(0, numInThreshold);
          maxAtThreshold = values[numInThreshold - 1];

          // average the remaining timings
          var sum = 0;
          for (var i = 0; i < numInThreshold; i++) {
            sum += values[i];
          }

          mean = sum / numInThreshold;
        }

        timers[key] = [];

        var message = "";
        message += 'stats.timers.' + key + '.mean ' + mean + ' ' + ts + "\n";
        message += 'stats.timers.' + key + '.upper ' + max + ' ' + ts + "\n";
        message += 'stats.timers.' + key + '.upper_' + pctThreshold + ' ' + maxAtThreshold + ' ' + ts + "\n";
        message += 'stats.timers.' + key + '.lower ' + min + ' ' + ts + "\n";
        message += 'stats.timers.' + key + '.count ' + count + ' ' + ts + "\n";
        statString += message;

        numStats += 1;
      }
    }

    statString += 'statsd.numStats ' + numStats + ' ' + ts + "\n";
    if (numStats) {
      if (config.debug) {
        sys.log("Sending stats string: \n" + statString);
      }
      sendStats(config, statString);
    }

  }, statsInterval);

});


